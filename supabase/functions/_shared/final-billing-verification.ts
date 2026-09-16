import { ProviderFailure, providerJson } from './provider-http.ts';
import { providerExecutionFetch, withProviderBudget } from './provider-execution.ts';
import { verifyFinalStripeTruth } from './final-stripe-truth.ts';
import type { AccountDeletionClient } from './account-deletion-lifecycle.ts';
type Read = (path: string) => Promise<unknown>;
type Status = 'clear' | 'provider_wait' | 'operator_review' | 'lease_lost' | 'cancelled';
type Verification = {
  status: string;
  token: string;
  resources: string[];
  discover_legacy: boolean;
};
export class BillingVerificationBlocked extends Error {
  constructor(public readonly status: Status | 'provider_pending') {
    super(status);
  }
}
function stripeRead(path: string): Promise<unknown> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new ProviderFailure('stripe_unavailable', true);
  return providerJson(
    `https://api.stripe.com/v1${path}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2024-06-20' },
    },
    providerExecutionFetch()
  );
}
function verification(value: unknown): Verification {
  if (!value || typeof value !== 'object') throw new Error('verification_context');
  const result = value as Verification;
  if (result.status === 'checking') validateChecking(result);
  return result;
}
function validateChecking(result: Verification) {
  if (typeof result.token !== 'string' || !Array.isArray(result.resources))
    throw new Error('verification_context');
  validateResources(result);
}
function validateResources(result: Verification) {
  if (
    result.resources.some((id) => typeof id !== 'string') ||
    typeof result.discover_legacy !== 'boolean'
  )
    throw new Error('verification_context');
}
function waitingStatus(status: string): Status {
  return status === 'cancelled'
    ? 'cancelled'
    : status === 'lease_lost'
      ? 'lease_lost'
      : 'provider_wait';
}
function failureStatus(error: unknown): Status {
  if (error instanceof ProviderFailure && !error.retryable) {
    return 'operator_review';
  }
  return 'provider_wait';
}
export async function verifyAccountBilling(
  client: AccountDeletionClient,
  userId: string,
  claimToken: string,
  read: Read = stripeRead
): Promise<Status> {
  const args = { p_user_id: userId, p_claim_token: claimToken };
  const started = await client.rpc('begin_final_billing_verification', args);
  if (started.error) return 'provider_wait';
  const context = verification(started.data);
  if (context.status !== 'checking') return waitingStatus(context.status);
  const outcome = await checkTruth(client, userId, args, context, read);
  return finishTruth(client, args, context, outcome);
}
async function checkTruth(
  client: AccountDeletionClient,
  userId: string,
  args: Record<string, string>,
  context: Verification,
  read: Read
): Promise<Status> {
  let outcome: Status = 'clear';
  try {
    await withProviderBudget(() =>
      verifyFinalStripeTruth(
        userId,
        context.resources,
        context.discover_legacy,
        read,
        async (resource) => {
          const saved = await client.rpc('preserve_final_billing_resource', {
            ...args,
            p_token: context.token,
            p_resource: resource,
          });
          if (saved.error || saved.data !== true)
            throw new ProviderFailure('billing_resource_changed', true);
        }
      )
    );
  } catch (error) {
    outcome = failureStatus(error);
  }
  return outcome;
}
async function finishTruth(
  client: AccountDeletionClient,
  args: Record<string, string>,
  context: Verification,
  outcome: Status
): Promise<Status> {
  const finished = await client.rpc('finish_final_billing_verification', {
    ...args,
    p_token: context.token,
    p_outcome: outcome,
  });
  if (finished.error) return 'provider_wait';
  return outcome === 'clear' && finished.data !== true ? 'lease_lost' : outcome;
}
