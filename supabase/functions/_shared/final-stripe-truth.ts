import { ProviderFailure } from './provider-http.ts';
import { verifyStripeFinancialState } from './stripe-financial-review.ts';
import { stripeReference } from './stripe-provider-shapes.ts';
type Read = (path: string) => Promise<unknown>;
type Row = Record<string, unknown>;
type Preserve = (resource: string) => Promise<void>;
function row(value: unknown): Row {
  if (!value || typeof value !== 'object') {
    throw new ProviderFailure('stripe_truth_shape', true);
  }
  return value as Row;
}
function page(value: unknown): { rows: Row[]; more: boolean } {
  const result = row(value);
  if (!Array.isArray(result.data) || typeof result.has_more !== 'boolean') {
    throw new ProviderFailure('stripe_truth_list', true);
  }
  const rows = result.data.map(row);
  if (rows.some((item) => typeof item.id !== 'string' || item.id.length === 0)) {
    throw new ProviderFailure('stripe_truth_identity', true);
  }
  return { rows, more: result.has_more };
}
async function list(path: string, read: Read): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor = '';
  for (let count = 0; count < 4; count++) {
    const next = page(await read(path + cursor));
    rows.push(...next.rows);
    if (!next.more) return rows;
    cursor = nextCursor(next.rows, cursor);
  }
  throw new ProviderFailure('stripe_truth_pagination_review', false);
}
function nextCursor(rows: Row[], previous: string): string {
  const id = rows.at(-1)?.id;
  if (!id) throw new ProviderFailure('stripe_truth_cursor', true);
  const next = '&starting_after=' + encodeURIComponent(String(id));
  if (next === previous) throw new ProviderFailure('stripe_truth_cursor', true);
  return next;
}
function customerReference(value: unknown): string {
  const id = stripeReference(value);
  if (!id?.startsWith('cus_')) throw new ProviderFailure('stripe_truth_customer', false);
  return id;
}
function terminal(subscription: Row): void {
  if (['canceled', 'incomplete_expired'].includes(String(subscription.status))) return;
  const waiting = ['active', 'trialing'].includes(String(subscription.status));
  throw new ProviderFailure(
    waiting ? 'subscription_still_active' : 'subscription_requires_review',
    waiting
  );
}
async function customer(resource: string, read: Read): Promise<string> {
  if (resource.startsWith('cus_')) return resource;
  if (!resource.startsWith('sub_')) {
    throw new ProviderFailure('stripe_truth_resource', false);
  }
  const subscription = row(await read(`/subscriptions/${encodeURIComponent(resource)}`));
  if (subscription.id !== resource) {
    throw new ProviderFailure('stripe_truth_identity', false);
  }
  terminal(subscription);
  return customerReference(subscription.customer);
}
async function verifyCustomer(id: string, read: Read, preserve: Preserve): Promise<void> {
  const subscriptions = await list(
    `/subscriptions?customer=${encodeURIComponent(id)}&status=all&limit=100`,
    read
  );
  for (const subscription of subscriptions) {
    if (stripeReference(subscription.customer) !== id)
      throw new ProviderFailure('stripe_truth_customer_mismatch', true);
    await preserve(subscriptionId(subscription));
    terminal(subscription);
  }
  await verifyStripeFinancialState(id, read);
}
function attributed(item: Row, userId: string): boolean {
  if (item.client_reference_id === userId) return true;
  if (!item.metadata || typeof item.metadata !== 'object') return false;
  return (item.metadata as Row).user_id === userId;
}
async function discover(userId: string, read: Read, preserve: Preserve): Promise<string[]> {
  // Never use eventually-consistent Search to prove absence. Incomplete account
  // lists fail closed for operator review; this does not replay historical events.
  const subscriptions = await list('/subscriptions?status=all&limit=100', read);
  const sessions = await list('/checkout/sessions?limit=100', read);
  return [
    ...(await subscriptionResources(
      subscriptions.filter((item) => attributed(item, userId)),
      preserve
    )),
    ...(await sessionResources(
      sessions.filter((item) => attributed(item, userId)),
      preserve
    )),
  ];
}
async function subscriptionResources(items: Row[], preserve: Preserve): Promise<string[]> {
  const resources: string[] = [];
  for (const item of items) {
    await preserve(subscriptionId(item));
    terminal(item);
    resources.push(customerReference(item.customer));
  }
  return resources;
}
async function sessionResources(items: Row[], preserve: Preserve): Promise<string[]> {
  const resources: string[] = [];
  for (const item of items) {
    verifySession(item);
    const id = stripeReference(item.customer);
    if (id) {
      await preserve(id);
      resources.push(id);
    }
  }
  return resources;
}
function verifySession(session: Row) {
  if (session.status === 'expired') return;
  if (
    session.status === 'complete' &&
    ['paid', 'no_payment_required'].includes(String(session.payment_status))
  )
    return;
  throw new ProviderFailure('stripe_truth_checkout_unresolved', true);
}
/** Read-only provider evidence. No cancel/refund/credit/customer deletion is reachable here. */
export async function verifyFinalStripeTruth(
  userId: string,
  resources: string[],
  discoverLegacy: boolean,
  read: Read,
  preserve: Preserve = async () => {}
): Promise<void> {
  const discovered = await discoverIfNeeded(userId, resources, discoverLegacy, read, preserve);
  const customers = new Set<string>();
  for (const resource of [...resources, ...discovered]) {
    customers.add(await customer(resource, read));
  }
  for (const id of customers) await verifyCustomer(id, read, preserve);
}
function discoverIfNeeded(
  userId: string,
  resources: string[],
  legacy: boolean,
  read: Read,
  preserve: Preserve
) {
  return legacy || resources.length === 0 ? discover(userId, read, preserve) : Promise.resolve([]);
}
function subscriptionId(item: Row): string {
  if (typeof item.id !== 'string' || !item.id.startsWith('sub_'))
    throw new ProviderFailure('stripe_truth_identity', true);
  return item.id;
}
