import type { AccountDeletionClient } from './account-deletion-lifecycle.ts';
export class DeletionBillingError extends Error {
  constructor(
    readonly status: 409 | 503,
    readonly code: string
  ) {
    super(code);
  }
}
const unavailable = () => new DeletionBillingError(503, 'account_deletion_billing_unavailable');
function isMatchingSubscription(
  value: unknown,
  id: string
): value is { id: string; status?: unknown } {
  if (!value || typeof value !== 'object') return false;
  return (value as { id?: unknown }).id === id;
}
function isEndedStripeSubscription(value: unknown, id: string): boolean {
  return (
    isMatchingSubscription(value, id) &&
    ['canceled', 'incomplete_expired'].includes(String(value.status))
  );
}
type DeletionBillingSnapshot = {
  customerId: string | null;
  subscriptionId: string | null;
  subscriptionIds: string[];
};
async function linkedBilling(
  client: AccountDeletionClient,
  userId: string
): Promise<DeletionBillingSnapshot> {
  const { data, error } = await client
    .from('supporters')
    .select('stripe_subscription_id,stripe_customer_id')
    .eq('user_id', userId)
    .limit(1);
  if (error || !Array.isArray(data)) throw unavailable();
  const subscriptionIds = await retainedSubscriptions(client, userId);
  if (data.length === 0) return { customerId: null, subscriptionId: null, subscriptionIds };
  return {
    customerId: nullableSubscriptionId(data[0]?.stripe_customer_id),
    subscriptionId: nullableSubscriptionId(data[0]?.stripe_subscription_id),
    subscriptionIds,
  };
}
async function retainedSubscriptions(
  client: AccountDeletionClient,
  userId: string
): Promise<string[]> {
  const { data, error, count } = await client
    .from('account_billing_subscriptions')
    .select('stripe_subscription_id', { count: 'exact' })
    .eq('user_id', userId);
  if (error || !Array.isArray(data)) throw unavailable();
  if (count !== data.length) throw unavailable();
  return data.map((row: { stripe_subscription_id: unknown }) =>
    requiredSubscriptionId(row.stripe_subscription_id)
  );
}
function requiredSubscriptionId(value: unknown): string {
  const id = nullableSubscriptionId(value);
  if (!id) throw unavailable();
  return id;
}
function nullableSubscriptionId(id: unknown): string | null {
  if (id === null) return null;
  if (typeof id !== 'string' || !id) throw unavailable();
  return id;
}
async function requestStripeSubscription(
  id: string,
  stripeKey: string,
  method: 'GET' | 'DELETE',
  fetchImpl: typeof fetch
): Promise<unknown> {
  return await requestStripe(
    `/subscriptions/${encodeURIComponent(id)}`,
    stripeKey,
    method,
    fetchImpl
  );
}
async function requestStripe(
  path: string,
  stripeKey: string,
  method: 'GET' | 'DELETE',
  fetchImpl: typeof fetch
): Promise<unknown> {
  if (!stripeKey) throw unavailable();
  try {
    const response = await fetchImpl(`https://api.stripe.com/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': '2024-06-20' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw unavailable();
    return await response.json();
  } catch {
    throw unavailable();
  }
}
function requireEndedSubscription(subscription: unknown, id: string): void {
  if (!isMatchingSubscription(subscription, id)) throw unavailable();
  if (!isEndedStripeSubscription(subscription, id))
    throw new DeletionBillingError(409, 'account_deletion_subscription_active');
}
type SubscriptionPage = { data: { id: string; status?: unknown }[]; has_more: boolean };
function subscriptionPage(value: unknown): SubscriptionPage {
  if (!value || typeof value !== 'object') throw unavailable();
  const page = value as SubscriptionPage;
  if (!Array.isArray(page.data)) throw unavailable();
  return requireCompletePage(page);
}
function requireCompletePage(page: SubscriptionPage): SubscriptionPage {
  if (typeof page.has_more !== 'boolean') throw unavailable();
  if (page.has_more && page.data.length === 0) throw unavailable();
  return page;
}
function verifyEndedPage(page: SubscriptionPage): void {
  for (const subscription of page.data) {
    const id = nullableSubscriptionId(subscription?.id);
    if (!id) throw unavailable();
    requireEndedSubscription(subscription, id);
  }
}
async function verifyCustomerSubscriptions(
  customerId: string,
  stripeKey: string,
  fetchImpl: typeof fetch,
  after = ''
): Promise<void> {
  const params = new URLSearchParams({ customer: customerId, status: 'all', limit: '100' });
  if (after) params.set('starting_after', after);
  const page = subscriptionPage(
    await requestStripe(`/subscriptions?${params}`, stripeKey, 'GET', fetchImpl)
  );
  verifyEndedPage(page);
  const cursor = nextPageCursor(page, after);
  if (cursor) await verifyCustomerSubscriptions(customerId, stripeKey, fetchImpl, cursor);
}
function nextPageCursor(page: SubscriptionPage, previous: string): string | null {
  if (!page.has_more) return null;
  const cursor = page.data.at(-1)!.id;
  if (cursor === previous) throw unavailable();
  return cursor;
}
/** Read-only Stripe verification: scheduled cancellation is still a live subscription. */
export async function endedDeletionSubscription(
  client: AccountDeletionClient,
  userId: string,
  stripeKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<DeletionBillingSnapshot> {
  const billing = await linkedBilling(client, userId);
  const ids = new Set(billing.subscriptionIds);
  if (billing.subscriptionId) ids.add(billing.subscriptionId);
  await verifyRetainedSubscriptions(ids, stripeKey, fetchImpl);
  if (billing.customerId)
    await verifyCustomerSubscriptions(billing.customerId, stripeKey, fetchImpl);
  return billing;
}
async function verifyRetainedSubscriptions(
  ids: Set<string>,
  stripeKey: string,
  fetchImpl: typeof fetch
): Promise<void> {
  for (const id of ids)
    requireEndedSubscription(await requestStripeSubscription(id, stripeKey, 'GET', fetchImpl), id);
}
/** A changed subscription or replaced/expired deletion lease cannot clear billing identity. */
export async function clearEndedDeletionSubscription(
  client: AccountDeletionClient,
  userId: string,
  billing: DeletionBillingSnapshot,
  claimToken: string
): Promise<void> {
  const { data, error } = await client.rpc('clear_ended_deletion_subscription', {
    p_user_id: userId,
    p_subscription_id: billing.subscriptionId,
    p_customer_id: billing.customerId,
    p_subscription_ids: billing.subscriptionIds,
    p_claim_token: claimToken,
  });
  if (error || data !== true) throw unavailable();
}
type AuthLookup = {
  auth: {
    admin: {
      getUserById(id: string): Promise<{
        data: { user: unknown };
        error: { status?: number; code?: string } | null;
      }>;
    };
  };
};
function isMissingUser(error: { status?: number; code?: string } | null): boolean {
  return error?.status === 404 && error.code === 'user_not_found';
}
async function isDeletedUser(client: AuthLookup, userId: string): Promise<boolean> {
  const { data, error } = await client.auth.admin.getUserById(userId);
  if (isMissingUser(error)) return true;
  if (error || !data.user) throw unavailable();
  return false;
}
/** Compensate a previously issued Checkout that completes after its account was deleted. */
export async function cancelDeletedUserSubscription(
  client: AuthLookup,
  userId: string,
  subscription: { id: string; status?: unknown },
  stripeKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!(await isDeletedUser(client, userId))) return false;
  if (isEndedStripeSubscription(subscription, subscription.id)) return true;
  const canceled = await requestStripeSubscription(subscription.id, stripeKey, 'DELETE', fetchImpl);
  if (!isEndedStripeSubscription(canceled, subscription.id)) throw unavailable();
  return true;
}
