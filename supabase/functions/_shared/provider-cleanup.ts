import { ProviderFailure, providerJson } from './provider-http.ts';
import type { LifecycleWork, WorkOutcome } from './lifecycle-worker.ts';
type StripeObject = { id: string; status?: string; cancel_at_period_end?: boolean };
function providerRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object')
    throw new ProviderFailure('provider_invalid_object', true);
  return value as Record<string, unknown>;
}
const object = (value: unknown): StripeObject => {
  const row = providerRecord(value);
  if (typeof row.id !== 'string') throw new ProviderFailure('provider_invalid_object', true);
  return {
    id: row.id,
    status: typeof row.status === 'string' ? row.status : undefined,
    cancel_at_period_end: row.cancel_at_period_end === true,
  };
};
async function requireLease(providers: CleanupProviders, work: LifecycleWork) {
  if (!(await providers.validate(work))) throw new ProviderFailure('lease_lost', false);
}
export interface CleanupProviders {
  stripe(path: string, method?: string, body?: string, idempotencyKey?: string): Promise<unknown>;
  verifyFinancialState(resource: string): Promise<void>;
  removeDiscordRoles(id: string): Promise<void>;
  reconcileDiscord?(work: LifecycleWork): Promise<void>;
  validate(work: LifecycleWork): Promise<boolean>;
}
async function subscriptionCleanup(
  id: string,
  providers: CleanupProviders,
  work: LifecycleWork
): Promise<WorkOutcome> {
  const subscription = object(await providers.stripe(`/subscriptions/${encodeURIComponent(id)}`));
  const state = subscriptionState(subscription);
  if (state === 'completed') return { state: 'completed' };
  if (state === 'blocked') throw new ProviderFailure('subscription_operator_review', false);
  if (!subscription.cancel_at_period_end) {
    await requireLease(providers, work);
    await providers.stripe(
      `/subscriptions/${encodeURIComponent(id)}`,
      'POST',
      'cancel_at_period_end=true',
      `deletion-${work.id}-${id}`
    );
  }
  return { state: 'waiting', retryAfterSeconds: 21600 };
}
async function customerCleanup(
  id: string,
  providers: CleanupProviders,
  work: LifecycleWork
): Promise<WorkOutcome> {
  const result = await providers.stripe(
    `/subscriptions?customer=${encodeURIComponent(id)}&status=all&limit=100`
  );
  const subscriptions = subscriptionList(result);
  let pending = false;
  for (const item of subscriptions) {
    const outcome = await subscriptionCleanup(object(item).id, providers, work);
    pending ||= outcome.state === 'waiting';
  }
  return pending ? { state: 'waiting', retryAfterSeconds: 21600 } : { state: 'completed' };
}
/** No defaults create provider clients or enable an external runner. */
export async function executeProviderCleanup(
  work: LifecycleWork,
  providers: CleanupProviders
): Promise<WorkOutcome> {
  if (!work.resource_id) throw new ProviderFailure('missing_identifier', false);
  await requireLease(providers, work);
  if (work.kind === 'discord_cleanup') return discordCleanup(work, providers);
  return stripeCleanup(work, providers);
}
function subscriptionList(value: unknown): unknown[] {
  const row = providerRecord(value);
  if (!Array.isArray(row.data)) throw new ProviderFailure('provider_invalid_list', true);
  if (row.has_more) throw new ProviderFailure('subscription_pagination_review', false);
  return row.data;
}
async function discordCleanup(
  work: LifecycleWork,
  providers: CleanupProviders
): Promise<WorkOutcome> {
  if (providers.reconcileDiscord) await providers.reconcileDiscord(work);
  else await removeManagedRoles(work, providers);
  return { state: 'completed' };
}
async function removeManagedRoles(work: LifecycleWork, providers: CleanupProviders): Promise<void> {
  if (work.action !== 'remove_managed_roles')
    throw new ProviderFailure('discord_reconciler_required', false);
  await providers.removeDiscordRoles(work.resource_id!);
}
async function stripeCleanup(
  work: LifecycleWork,
  providers: CleanupProviders
): Promise<WorkOutcome> {
  if (work.kind !== 'stripe_cleanup' || work.action !== 'cancel_at_period_end')
    throw new ProviderFailure('provider_action_requires_review', false);
  await providers.verifyFinancialState(work.resource_id!);
  return stripeResourceCleanup(work, providers);
}
function stripeResourceCleanup(
  work: LifecycleWork,
  providers: CleanupProviders
): Promise<WorkOutcome> {
  const id = work.resource_id!;
  if (id.startsWith('sub_')) return subscriptionCleanup(id, providers, work);
  if (id.startsWith('cus_')) return customerCleanup(id, providers, work);
  throw new ProviderFailure('unknown_provider_resource', false);
}
export const stripeTestTransport = (key: string, fetcher: typeof fetch = fetch) => {
  if (!key.startsWith('sk_test_'))
    throw new Error('Only explicit Stripe test keys are accepted by this staging adapter');
  return (path: string, method = 'GET', body?: string, idempotencyKey?: string) =>
    providerJson(
      `https://api.stripe.com/v1${path}`,
      {
        method,
        body,
        headers: {
          Authorization: `Bearer ${key}`,
          'Stripe-Version': '2024-06-20',
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
      },
      fetcher
    );
};
function subscriptionState(subscription: StripeObject): 'completed' | 'waiting' | 'blocked' {
  const status = subscription.status ?? '';
  if (['canceled', 'incomplete_expired'].includes(status)) return 'completed';
  return ['active', 'trialing'].includes(status) ? 'waiting' : 'blocked';
}
