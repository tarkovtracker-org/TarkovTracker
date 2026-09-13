import { ProviderFailure } from './provider-http.ts';
import { stripeReference } from './stripe-provider-shapes.ts';
import { lifecycleStore } from './lifecycle-store.ts';
type Rpc = Parameters<typeof lifecycleStore>[0];
type Candidate = { id: string; user_id: string; resource_id: string };
function candidate(value: unknown): Candidate {
  if (!value || typeof value !== 'object') throw new ProviderFailure('initiation_invalid', true);
  const row = value as Record<string, unknown>;
  if (!['id', 'user_id', 'resource_id'].every((key) => typeof row[key] === 'string'))
    throw new ProviderFailure('initiation_invalid', true);
  return row as Candidate;
}
function sessionObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new ProviderFailure('checkout_invalid', true);
  return value as Record<string, unknown>;
}
async function reconcileOne(
  rpc: Rpc,
  stripe: (path: string) => Promise<unknown>,
  item: Candidate
): Promise<boolean> {
  const session = sessionObject(
    await stripe(`/checkout/sessions/${encodeURIComponent(item.resource_id)}`)
  );
  if (session.id !== item.resource_id || session.client_reference_id !== item.user_id)
    throw new ProviderFailure('checkout_owner_mismatch', false);
  const customer = optionalReference(session.customer);
  const subscription = optionalReference(session.subscription);
  validateCompletedSubscription(session, subscription);
  const result = await rpc('complete_checkout_initiation', {
    p_id: item.id,
    p_session_id: item.resource_id,
    p_user_id: item.user_id,
    p_customer_id: customer,
    p_subscription_id: subscription,
    p_status: session.status,
    p_payment_status: session.payment_status,
  });
  if (result.error) throw new ProviderFailure('initiation_completion_unavailable', true);
  return result.data === true;
}
/** Read provider truth, then atomically preserve identifiers before closing an initiation. No schedule. */
export async function reconcileCheckoutInitiations(
  rpc: Rpc,
  stripe: (path: string) => Promise<unknown>,
  limit = 10
) {
  validateBatchLimit(limit);
  const rows = await initiationCandidates(rpc, limit);
  let completed = 0;
  for (const row of rows) {
    if (await reconcileAndDefer(rpc, stripe, candidate(row))) completed++;
  }
  return { examined: rows.length, completed };
}
async function reconcileAndDefer(
  rpc: Rpc,
  stripe: (path: string) => Promise<unknown>,
  item: Candidate
): Promise<boolean> {
  try {
    if (await reconcileOne(rpc, stripe, item)) return true;
    await defer(rpc, item.id, true, null);
  } catch (error) {
    const failure = classifyLookupFailure(error);
    await defer(rpc, item.id, failure.retryable, failure.code);
  }
  return false;
}
function classifyLookupFailure(error: unknown): ProviderFailure {
  return error instanceof ProviderFailure
    ? error
    : new ProviderFailure('checkout_unavailable', true);
}
async function defer(rpc: Rpc, id: string, retryable: boolean, code: string | null) {
  const result = await rpc('defer_provider_initiation', {
    p_id: id,
    p_retryable: retryable,
    p_error_code: code,
  });
  if (result.error) throw new Error('Initiation retry persistence unavailable');
}
function validateBatchLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error('Invalid batch limit');
}
function validateCompletedSubscription(
  session: Record<string, unknown>,
  subscription: string | null
) {
  if (session.mode !== 'subscription') return;
  if (session.status === 'complete' && !subscription)
    throw new ProviderFailure('checkout_subscription_missing', true);
}
function optionalReference(value: unknown) {
  return stripeReference(value ?? null);
}
async function initiationCandidates(rpc: Rpc, limit: number) {
  const rows = await rpc('provider_initiation_candidates', { p_limit: limit });
  if (rows.error || !Array.isArray(rows.data)) throw new Error('Initiation query unavailable');
  return rows.data;
}
