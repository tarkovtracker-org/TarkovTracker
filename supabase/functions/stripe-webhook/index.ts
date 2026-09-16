import { lifecycleDatabaseFetch } from '../_shared/lifecycle-delivery-context.ts';
import { verifyStripeSignature } from '../_shared/stripe-signature.ts';
import { withProviderBudget, providerExecutionFetch } from '../_shared/provider-execution.ts';
import { withLifecycleDelivery, DeliveryUnavailable } from '../_shared/lifecycle-delivery.ts';
import {
  chargeCustomer,
  paymentCanActivate,
  stripeReference,
} from '../_shared/stripe-provider-shapes.ts';
import { providerJson, ProviderFailure } from '../_shared/provider-http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import {
  getInvoiceSubscriptionId,
  getStripeReferenceId,
  getSubscriptionUserId,
  isFullRefund,
  shouldActivateCheckoutSession,
} from '../_shared/stripeBilling.ts';
import {
  getTierPriceConfig,
  isSupporterTier,
  resolveSubscriptionTier,
} from '../_shared/stripeTier.ts';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GRACE_PERIOD_DAYS = 7;
const STRIPE_API_VERSION = '2024-06-20';
const STRIPE_API_BASE = 'https://api.stripe.com/v1';
type StripeSubscription = {
  customer?: unknown;
  id: string;
  items?: { data?: Array<{ price?: { id?: string } }> };
  metadata?: Record<string, string>;
  status?: string;
};
const { missing: missingTierPriceEnvVars, priceIdsByTier: TIER_PRICE_IDS } = getTierPriceConfig(
  (name) => Deno.env.get(name)
);
const missingRequiredEnvVars = [
  !SUPABASE_URL ? 'SUPABASE_URL' : null,
  !SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
  !STRIPE_WEBHOOK_SECRET ? 'STRIPE_WEBHOOK_SECRET' : null,
  !STRIPE_SECRET_KEY ? 'STRIPE_SECRET_KEY' : null,
  ...missingTierPriceEnvVars,
].filter((name): name is string => Boolean(name));
if (missingRequiredEnvVars.length > 0) {
  throw new Error(
    `[stripe-webhook] Missing required env vars: ${missingRequiredEnvVars.join(', ')}`
  );
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: lifecycleDatabaseFetch },
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
/**
 * PermanentError is thrown when an event cannot be processed and Stripe should
 * NOT retry (e.g., malformed payload, missing supporter row that will never
 * appear). Stripe retries 5xx up to ~16 times over 72h — for permanent errors
 * we acknowledge with 200 to stop the retry storm and log for ops review.
 */
class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}
/**
 * Verify Stripe webhook signature using Web Crypto API (no stripe npm dependency).
 */
/**
 * Atomically claim a Stripe event by ID. Returns true if this is the first
 * time we've seen this event (caller should process it), false if it's a
 * duplicate (caller should ack and skip). Idempotency is the contract:
 * regardless of how many retries Stripe sends, side effects run once.
 */
type EventClaim = { state: string; id?: string; token?: string };
async function claimEvent(eventId: string, eventType: string): Promise<EventClaim> {
  const { data, error } = await supabase.rpc('claim_stripe_lifecycle', {
    p_event_id: eventId,
    p_type: eventType,
  });
  if (error || !data || typeof data.state !== 'string') throw new Error('event_claim_failed');
  return data;
}
async function finishEvent(claim: EventClaim, state: string, code: string | null = null) {
  const { data, error } = await supabase.rpc('finish_lifecycle_work', {
    p_id: claim.id,
    p_token: claim.token,
    p_state: state,
    p_code: code,
    p_retry_seconds: 60,
  });
  if (error || data !== true) throw new Error('event_completion_fence_lost');
  return eventCompleted(claim);
}
/**
 * Extract Discord user ID from Supabase auth identities.
 * Prefer identity_data.provider_id (Discord snowflake) and fall back to
 * identity_data.sub. Avoid identity.id, which can be the Supabase row UUID
 * depending on auth client version, not the Discord-side user id.
 */
type StripeEvent = { id: string; type: string; data: { object: unknown } };
type EventProcessor = { claim: EventClaim; supabase: typeof supabase; boundUserId: string | null };
function createEventProcessor(claim: EventClaim) {
  if (!claim.id || !claim.token) throw new Error('invalid_processing_claim');
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: {
      fetch: lifecycleDatabaseFetch,
      headers: { 'x-lifecycle-work': claim.id, 'x-lifecycle-claim': claim.token },
    },
  });
  const processor: EventProcessor = { claim, supabase: client, boundUserId: null };
  return (event: StripeEvent) => dispatchEvent(processor, event);
}
async function getDiscordUserId(processor: EventProcessor, userId: string): Promise<string | null> {
  const { data: linkedAccount, error: linkedAccountError } = await processor.supabase
    .from('discord_account_links')
    .select('discord_user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (linkedAccount?.discord_user_id) return linkedAccount.discord_user_id;
  if (linkedAccountError) throw new Error('discord_mapping_lookup_failed');
  const { data, error: authError } = await processor.supabase.auth.admin.getUserById(userId);
  if (authError) throw new Error('discord_auth_lookup_failed');
  if (!data?.user?.identities) return null;
  const discordIdentity = data.user.identities.find((i) => i.provider === 'discord');
  if (!discordIdentity) return null;
  const providerId = discordIdentity.identity_data?.provider_id;
  if (typeof providerId === 'string' && providerId) return providerId;
  const sub = discordIdentity.identity_data?.sub;
  if (typeof sub === 'string' && sub) return sub;
  return null;
}
/**
 * Prefer live Discord identity (discord_account_links / auth.identities) over
 * the denormalized supporters.discord_user_id column so users who link Discord
 * after checkout still get role updates on portal/refund/cancel events.
 */
async function resolveDiscordUserIdForSupporter(
  processor: EventProcessor,
  // deno-lint-ignore no-explicit-any
  supporter: any
): Promise<string | null> {
  const userId = typeof supporter?.user_id === 'string' ? supporter.user_id : null;
  if (!userId) return null;
  const persisted =
    typeof supporter.discord_user_id === 'string' && supporter.discord_user_id
      ? supporter.discord_user_id
      : null;
  const resolved = await getDiscordUserId(processor, userId);
  if (!resolved) return persisted;
  if (supporter.discord_user_id !== resolved) {
    const { error } = await processor.supabase
      .from('supporters')
      .update({ discord_user_id: resolved })
      .eq('user_id', userId);
    if (error) {
      console.warn('[stripe-webhook] Failed to backfill supporters.discord_user_id:', {
        userId,
        error,
      });
    } else {
      supporter.discord_user_id = resolved;
    }
  }
  return resolved;
}
function resolveTier(metadata: Record<string, string> | null | undefined): string {
  return isSupporterTier(metadata?.tier) ? metadata.tier : 'supporter';
}
const TIER_RANK: Record<string, number> = { supporter: 0, scav: 1, timmy: 2, chad: 3 };
function higherTier(a: string | null | undefined, b: string): string {
  return (TIER_RANK[a || 'supporter'] ?? 0) >= (TIER_RANK[b] ?? 0) ? a || 'supporter' : b;
}
/** Preserve desired-state reconciliation; required Discord work gates event completion. */
async function enqueueDiscordEffect(
  processor: EventProcessor,
  context: Record<string, unknown>
): Promise<void> {
  const { error } = await processor.supabase.rpc('enqueue_stripe_discord_effect', {
    p_id: processor.claim.id,
    p_token: processor.claim.token,
    p_user: context.userId,
    p_resource: context.discordUserId,
  });
  if (error) throw new Error('discord_obligation_not_preserved');
}
/**
 * Activate (or re-activate) a supporter from a completed/cleared checkout
 * session. Shared by checkout.session.completed and async_payment_succeeded.
 *
 * When an active subscriber makes a one-time payment, the subscription fields
 * are preserved — only tier is upgraded if the new tier outranks the current.
 */
async function activateSupporterFromSession(
  processor: EventProcessor,
  // deno-lint-ignore no-explicit-any
  session: any,
  source: string
): Promise<void> {
  const userId = session.client_reference_id;
  if (!userId) {
    throw new PermanentError(`${source} without client_reference_id`);
  }
  const isSubscription = session.mode === 'subscription';
  let tier = resolveTier(session.metadata);
  let subscriptionId = getStripeReferenceId(session.subscription);
  let sessionCustomerId = getStripeReferenceId(session.customer);
  if (isSubscription) {
    if (!subscriptionId) {
      throw new PermanentError(`${source} subscription without subscription id`);
    }
    const subscription = await fetchLatestSubscription(subscriptionId);
    if (!['active', 'trialing'].includes(subscription.status ?? '')) {
      console.info(
        `[stripe-webhook] ${source} subscription ${subscriptionId} is ${subscription.status}; skipping activation`
      );
      return;
    }
    tier = resolveSubscriptionTier(subscription, tier, TIER_PRICE_IDS);
    subscriptionId = subscription.id;
    sessionCustomerId = getStripeReferenceId(subscription.customer) || sessionCustomerId;
  }
  const discordUserId = await getDiscordUserId(processor, userId);
  // Preserve started_at across re-subscriptions so renewal/upgrade flows
  // don't reset the original support date. Only set it when the row is new.
  const { data: existing, error: existingError } = await processor.supabase
    .from('supporters')
    .select(
      'started_at, status, type, stripe_subscription_id, stripe_customer_id, tier, expires_at'
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (existingError) throw new Error('supporter_lookup_failed');
  const startedAt = existing?.started_at ?? new Date().toISOString();
  // Guard: do not overwrite a subscription (active OR in grace period) with
  // one-time payment fields. past_due subscribers are still subscribers.
  const subscriptionStatuses = ['active', 'past_due'];
  const hasLiveSubscription =
    existing?.type === 'subscription' &&
    subscriptionStatuses.includes(existing?.status) &&
    existing?.stripe_subscription_id;
  const effectiveTier =
    hasLiveSubscription && !isSubscription ? higherTier(existing.tier, tier) : tier;
  // Preserve stripe_customer_id from the existing row when the session doesn't
  // provide one (e.g., guest one-time checkout linked later).
  const effectiveCustomerId = sessionCustomerId || existing?.stripe_customer_id || null;
  const record = {
    user_id: userId,
    tier: effectiveTier,
    status: hasLiveSubscription && !isSubscription ? existing.status : 'active',
    type: hasLiveSubscription || isSubscription ? 'subscription' : 'one_time',
    stripe_customer_id: effectiveCustomerId,
    stripe_subscription_id:
      hasLiveSubscription && !isSubscription ? existing.stripe_subscription_id : subscriptionId,
    has_ever_supported: true,
    discord_user_id: discordUserId,
    amount_total: session.amount_total || 0,
    started_at: startedAt,
    expires_at: hasLiveSubscription && !isSubscription ? existing.expires_at : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await processor.supabase
    .from('supporters')
    .upsert(record, { onConflict: 'user_id' });
  if (error) {
    throw new Error(`Failed to upsert supporter for ${userId}: ${error.message}`);
  }
  if (discordUserId) await enqueueDiscordEffect(processor, { userId, discordUserId });
  console.info(
    `[stripe-webhook] Supporter activated (${source}): ${userId} tier=${effectiveTier} type=${record.type}`
  );
}
/**
 * Look up a supporter by an exact column match. Returns null if not found
 * (caller decides whether that's permanent or expected).
 */
async function findSupporterBy(
  processor: EventProcessor,
  column: 'stripe_subscription_id' | 'stripe_customer_id' | 'user_id',
  value: string
) {
  const { data, error } = await processor.supabase
    .from('supporters')
    .select('*')
    .eq(column, value)
    .maybeSingle();
  if (error) {
    throw new Error(`Lookup by ${column} failed: ${error.message}`);
  }
  return data;
}
async function currentCheckout(
  processor: EventProcessor,
  event: unknown
): Promise<Record<string, unknown> | null> {
  const id = requiredStripeReference(event, 'checkout_reference_missing');
  const session = await boundCheckout(processor, id);
  if (session.mode !== 'payment') return session;
  return (await checkoutPaymentValid(session)) ? session : null;
}
function requiredStripeReference(value: unknown, code: string): string {
  const id = stripeReference(value);
  if (!id) throw new Error(code);
  return id;
}
async function stripeResource(path: string, id: string): Promise<Record<string, unknown>> {
  const record = await stripeGet<Record<string, unknown>>(`${path}/${encodeURIComponent(id)}`);
  if (!record || record.id !== id) throw new Error('provider_resource_invalid');
  return record;
}
async function boundCheckout(
  processor: EventProcessor,
  id: string
): Promise<Record<string, unknown>> {
  const session = await stripeResource('/checkout/sessions', id);
  if (typeof session.client_reference_id !== 'string')
    throw new PermanentError('checkout_owner_missing');
  if (await bindResolvedOwner(processor, session.client_reference_id))
    return stripeResource('/checkout/sessions', id);
  return session;
}
async function checkoutPaymentValid(session: Record<string, unknown>): Promise<boolean> {
  const id = requiredStripeReference(session.payment_intent, 'payment_intent_missing');
  const intent = await stripeResource('/payment_intents', id);
  const chargeId = stripeReference(intent.latest_charge);
  if (!chargeId) return false;
  return paymentCanActivate(await stripeGet<unknown>(`/charges/${encodeURIComponent(chargeId)}`));
}
// deno-lint-ignore no-explicit-any
async function handleCheckoutCompleted(processor: EventProcessor, session: any): Promise<void> {
  session = await currentCheckout(processor, session);
  if (!session) return;
  if (session?.mode !== 'payment' && session?.mode !== 'subscription') {
    throw new PermanentError('checkout.session.completed with invalid mode');
  }
  if (!shouldActivateCheckoutSession(session)) {
    console.info(
      `[stripe-webhook] Payment not yet paid, deferring: ${session.client_reference_id}`
    );
    return;
  }
  await activateSupporterFromSession(processor, session, 'checkout.session.completed');
}
// deno-lint-ignore no-explicit-any
async function handleAsyncPaymentSucceeded(processor: EventProcessor, session: any): Promise<void> {
  session = await currentCheckout(processor, session);
  if (!session) return;
  await activateSupporterFromSession(processor, session, 'async_payment_succeeded');
}
async function handleSubscriptionUpdated(
  processor: EventProcessor,
  // deno-lint-ignore no-explicit-any
  subscription: any
): Promise<void> {
  const subscriptionId = getStripeReferenceId(subscription);
  if (!subscriptionId) return;
  const latestSubscription = await fetchLatestSubscription(subscriptionId);
  await reconcileSubscription(processor, latestSubscription);
}
async function fetchLatestSubscription(subscriptionId: string): Promise<StripeSubscription> {
  const subscription = await stripeGet<StripeSubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`
  );
  if (!subscription) {
    throw new Error(`Unable to retrieve Stripe subscription ${subscriptionId}`);
  }
  return subscription;
}
async function reconcileSubscription(
  processor: EventProcessor,
  subscription: StripeSubscription,
  paymentConfirmed = false
): Promise<void> {
  let supporter = await findSupporterBy(processor, 'stripe_subscription_id', subscription.id);
  const metadataUserId = getSubscriptionUserId(subscription);
  if (!supporter && metadataUserId) {
    supporter = await findSupporterBy(processor, 'user_id', metadataUserId);
  }
  if (supporter?.stripe_subscription_id && supporter.stripe_subscription_id !== subscription.id) {
    throw new PermanentError('conflicting_subscription_requires_review');
  }
  const userId = supporter?.user_id || metadataUserId;
  if (!userId) return;
  if (await bindResolvedOwner(processor, userId)) {
    subscription = await fetchLatestSubscription(subscription.id);
  }
  if (
    supporter?.type === 'subscription' &&
    supporter.stripe_subscription_id &&
    supporter.stripe_subscription_id !== subscription.id &&
    ['active', 'past_due'].includes(supporter.status)
  ) {
    return;
  }
  const newTier = resolveSubscriptionTier(subscription, supporter?.tier, TIER_PRICE_IDS);
  const isActive = ['active', 'trialing'].includes(subscription.status ?? '');
  const isPastDue = subscription.status === 'past_due';
  if (!isActive && !isPastDue && !paymentConfirmed && supporter?.type === 'one_time') return;
  let status = 'active';
  let expiresAt: string | null = null;
  if (isPastDue) {
    status = 'past_due';
    const grace = new Date();
    grace.setDate(grace.getDate() + GRACE_PERIOD_DAYS);
    expiresAt =
      supporter?.status === 'past_due' && supporter?.expires_at
        ? supporter.expires_at
        : grace.toISOString();
  } else if (!isActive) {
    status = 'expired';
    expiresAt = new Date().toISOString();
  }
  const entitlementTier = isActive ? newTier : isPastDue ? supporter?.tier || newTier : 'supporter';
  const hasEverSupported = supporter?.has_ever_supported === true || paymentConfirmed;
  const discordUserId = await getDiscordUserId(processor, userId);
  const { error } = await processor.supabase.from('supporters').upsert(
    {
      user_id: userId,
      tier: entitlementTier,
      status,
      type: 'subscription',
      stripe_customer_id:
        getStripeReferenceId(subscription.customer) || supporter?.stripe_customer_id || null,
      stripe_subscription_id: subscription.id,
      has_ever_supported: hasEverSupported,
      discord_user_id: discordUserId || supporter?.discord_user_id || null,
      amount_total: supporter?.amount_total || 0,
      started_at: supporter?.started_at || new Date().toISOString(),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) {
    throw new Error(`Failed to update subscription for ${userId}: ${error.message}`);
  }
  const resolvedDiscordUserId =
    discordUserId ||
    (supporter
      ? await resolveDiscordUserIdForSupporter(processor, { ...supporter, user_id: userId })
      : null);
  if (resolvedDiscordUserId) {
    await enqueueDiscordEffect(processor, { userId, discordUserId: resolvedDiscordUserId });
  }
}
async function handleSubscriptionDeleted(
  processor: EventProcessor,
  // deno-lint-ignore no-explicit-any
  subscription: any
): Promise<void> {
  await reconcileSubscription(processor, await fetchLatestSubscription(subscription.id));
}
// deno-lint-ignore no-explicit-any
async function handleInvoicePaymentFailed(processor: EventProcessor, invoice: any): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  await reconcileSubscription(processor, await fetchLatestSubscription(subscriptionId));
}
// deno-lint-ignore no-explicit-any
async function handleInvoicePaid(processor: EventProcessor, invoice: any): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  await reconcileSubscription(processor, await fetchLatestSubscription(subscriptionId), true);
}
/**
 * Authenticated GET against the Stripe REST API. Returns parsed JSON, or null
 * on HTTP error (caller decides how to fall back).
 */
async function stripeGet<T>(path: string): Promise<T> {
  return (await providerJson(
    `${STRIPE_API_BASE}${path}`,
    {
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Stripe-Version': STRIPE_API_VERSION,
      },
    },
    providerExecutionFetch()
  )) as T;
}
/**
 * Count successful charges for a Stripe customer. Returns null on transient
 * failures (missing key, Stripe unreachable, non-OK response) so callers can
 * defer destructive actions instead of assuming a single-payment history.
 */
async function getCustomerPaymentCount(stripeCustomerId: string): Promise<number | null> {
  if (!STRIPE_SECRET_KEY) {
    console.warn('[stripe-webhook] STRIPE_SECRET_KEY missing; cannot determine charge history.');
    return null;
  }
  let count = 0;
  let startingAfter: string | undefined;
  // Page through up to 5 pages of 100 to bound worst case for noisy customers
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ customer: stripeCustomerId, limit: '100' });
    if (startingAfter) params.set('starting_after', startingAfter);
    const json = await stripeGet<{
      data: Array<{ id: string; status: string }>;
      has_more: boolean;
    }>(`/charges?${params.toString()}`);
    if (!json) return null;
    for (const charge of json.data) {
      if (charge.status === 'succeeded') count += 1;
    }
    if (!json.has_more || json.data.length === 0) break;
    startingAfter = json.data[json.data.length - 1].id;
  }
  return count;
}
/**
 * Resolve the subscription ID that a charge belongs to (via its invoice).
 *
 * Return values:
 * - string: the subscription ID the charge belongs to
 * - null: the charge has no invoice (definitively not a subscription charge)
 * - undefined: Stripe API failed; caller must treat as indeterminate
 */
// deno-lint-ignore no-explicit-any
async function resolveChargeSubscription(charge: any): Promise<string | null | undefined> {
  // Stripe webhook payloads sometimes include `invoice` as a string ID.
  const invoiceId = typeof charge?.invoice === 'string' ? charge.invoice : null;
  // No invoice means this is a direct charge (one-time), not subscription-related.
  if (!invoiceId) return null;
  const invoice = await stripeGet<unknown>(`/invoices/${encodeURIComponent(invoiceId)}`);
  // API failure: return undefined so caller knows lookup was indeterminate.
  if (invoice === null) return undefined;
  return getInvoiceSubscriptionId(invoice);
}
// deno-lint-ignore no-explicit-any
async function handleAsyncPaymentFailed(processor: EventProcessor, session: any): Promise<void> {
  const userId = session.client_reference_id;
  if (!userId) {
    throw new PermanentError('async_payment_failed without client_reference_id');
  }
  console.warn(
    `[stripe-webhook] Async payment failed (ACH/delayed): user=${userId} session=${session.id}`
  );
  const supporter = await findSupporterBy(processor, 'user_id', userId);
  // Nothing to revert. Activation is deferred for delayed payments, so the
  // expected state when a delayed payment fails is no supporter row at all.
  if (!supporter || supporter.status !== 'active') return;
  // Correlation guard: only revert the active supporter row if its Stripe
  // identifiers match this failed session. Without this guard, an existing
  // active supporter starting an unrelated delayed checkout (e.g., a renewal
  // attempt or a separate one-time purchase) that fails would wipe out the
  // active row even though its underlying payment is still good.
  const sessionSubscriptionId =
    typeof session.subscription === 'string' ? session.subscription : null;
  const sessionCustomerId = typeof session.customer === 'string' ? session.customer : null;
  const matchesSubscription = Boolean(
    sessionSubscriptionId && supporter.stripe_subscription_id === sessionSubscriptionId
  );
  const matchesOneTime = Boolean(
    !sessionSubscriptionId &&
    supporter.type === 'one_time' &&
    sessionCustomerId &&
    supporter.stripe_customer_id === sessionCustomerId
  );
  if (!matchesSubscription && !matchesOneTime) {
    console.info(
      `[stripe-webhook] async_payment_failed for ${userId} session=${session.id} does not correlate with active supporter row (sub=${supporter.stripe_subscription_id} customer=${supporter.stripe_customer_id} type=${supporter.type}); leaving row untouched`
    );
    return;
  }
  const { error } = await processor.supabase
    .from('supporters')
    .update({ status: 'expired', expires_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) {
    throw new Error(`Failed to expire async-failed supporter for ${userId}: ${error.message}`);
  }
  const discordUserId = await resolveDiscordUserIdForSupporter(processor, supporter);
  if (discordUserId) {
    await enqueueDiscordEffect(processor, { userId, discordUserId });
  }
}
/**
 * Revoke supporter access following a refund or chargeback.
 * - fullRevoke=true clears has_ever_supported and removes the base Supporter
 *   role (chargeback or first/only-payment refund).
 * - fullRevoke=false keeps the base Supporter role and only drops tier roles
 *   (long-time supporter refunding latest charge).
 *
 * Uses an optimistic lock on `updated_at` so concurrent webhook events
 * (e.g., refund + new checkout arriving in parallel) can't flip-flop state.
 */
async function revokeSupporter(
  processor: EventProcessor,
  // deno-lint-ignore no-explicit-any
  supporter: any,
  fullRevoke: boolean,
  reason: string
): Promise<void> {
  const updates = fullRevoke
    ? {
        status: 'cancelled',
        has_ever_supported: false,
        tier: 'supporter',
        expires_at: new Date().toISOString(),
        stripe_subscription_id: null,
      }
    : {
        status: 'expired',
        tier: 'supporter',
        expires_at: new Date().toISOString(),
        stripe_subscription_id: null,
      };
  const { data, error } = await processor.supabase
    .from('supporters')
    .update(updates)
    .eq('user_id', supporter.user_id)
    .eq('updated_at', supporter.updated_at)
    .select('user_id')
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to revoke supporter for ${supporter.user_id}: ${error.message}`);
  }
  if (!data) {
    // Row was modified between our read and write — re-read and let Stripe
    // retry if state still warrants revocation. Treat as transient.
    throw new Error(`Supporter row for ${supporter.user_id} changed during ${reason}; will retry`);
  }
  const discordUserId = await resolveDiscordUserIdForSupporter(processor, supporter);
  if (!discordUserId) return;
  await enqueueDiscordEffect(processor, { userId: supporter.user_id, discordUserId });
  if (fullRevoke) {
    await enqueueDiscordEffect(processor, { userId: supporter.user_id, discordUserId });
  }
}
// deno-lint-ignore no-explicit-any
async function handleChargeRefunded(processor: EventProcessor, charge: any): Promise<void> {
  if (!isFullRefund(charge)) {
    console.info(`[stripe-webhook] Partial refund for charge ${charge?.id}; keeping entitlement`);
    return;
  }
  const customerId = typeof charge?.customer === 'string' ? charge.customer : null;
  if (!customerId) return;
  const supporter = await findSupporterBy(processor, 'stripe_customer_id', customerId);
  if (!supporter) {
    // Stripe webhook ordering is not guaranteed: a refund can arrive before
    // checkout.session.completed activates the supporter row. If we ack the
    // refund here, the activation event would later create the row as if no
    // refund happened. Throw transient so the idempotency processor.claim rolls back
    // and Stripe retries; either the row eventually exists and gets revoked,
    // or Stripe gives up after its retry window (~3 days) without ever
    // creating an unrevoked supporter row.
    throw new Error(
      `charge.refunded for customer=${customerId} charge=${charge.id} has no supporter row yet; deferring`
    );
  }
  // Determine if the refunded charge is tied to the active subscription.
  // If the supporter has an active subscription and this charge belongs to a
  // different payment (one-time, old invoice, etc.), skip revocation to avoid
  // breaking a valid subscription.
  const liveSubscriptionStatuses = ['active', 'past_due'];
  if (supporter.stripe_subscription_id && liveSubscriptionStatuses.includes(supporter.status)) {
    const chargeSubscription = await resolveChargeSubscription(charge);
    // undefined = Stripe API failed; throw so Stripe retries rather than
    // permanently skipping revocation for a real subscription refund.
    if (chargeSubscription === undefined) {
      throw new Error(
        `Unable to resolve subscription for charge ${charge.id}; deferring refund handling`
      );
    }
    if (chargeSubscription !== supporter.stripe_subscription_id) {
      console.info(
        `[stripe-webhook] Refund for charge ${charge.id} is not tied to active subscription ` +
          `${supporter.stripe_subscription_id} for ${supporter.user_id}; skipping revocation`
      );
      return;
    }
  }
  const paymentCount = await getCustomerPaymentCount(customerId);
  if (paymentCount === null) {
    // Transient Stripe failure: defer revocation rather than risk wiping
    // has_ever_supported on a long-time supporter. Throw so Stripe retries.
    throw new Error(
      `Unable to determine payment count for ${supporter.user_id}; deferring refund revocation`
    );
  }
  const fullRevoke = paymentCount <= 1;
  await revokeSupporter(
    processor,
    supporter,
    fullRevoke,
    fullRevoke ? 'refund (first)' : 'refund (partial)'
  );
  console.info(
    `[stripe-webhook] ${fullRevoke ? 'Full' : 'Partial'} revoke on refund: ${supporter.user_id}`
  );
}
/**
 * Resolve the customer for a dispute. `dispute.charge` is a charge ID string
 * (Stripe webhooks send unexpanded refs), and disputes don't always carry a
 * top-level customer field, so fetch the charge directly when needed.
 */
// deno-lint-ignore no-explicit-any
async function resolveDisputeCustomerId(dispute: any): Promise<string | null> {
  if (typeof dispute?.customer === 'string' && dispute.customer) return dispute.customer;
  const chargeId = typeof dispute?.charge === 'string' ? dispute.charge : null;
  if (!chargeId) throw new PermanentError('Dispute has no customer or charge reference');
  const charge = await stripeGet<unknown>(`/charges/${encodeURIComponent(chargeId)}`);
  return chargeCustomer(charge, chargeId);
}
// deno-lint-ignore no-explicit-any
async function handleChargeDisputeCreated(processor: EventProcessor, dispute: any): Promise<void> {
  const customerId = await resolveDisputeCustomerId(dispute);
  if (!customerId) return;
  const supporter = await findSupporterBy(processor, 'stripe_customer_id', customerId);
  if (!supporter) {
    // Webhook ordering: a dispute can arrive before activation. Treat as
    // transient so Stripe retries until either the row appears (and we
    // revoke) or the retry window closes. See handleChargeRefunded note.
    throw new Error(
      `charge.dispute.created for customer=${customerId} dispute=${dispute.id} has no supporter row yet; deferring`
    );
  }
  // Chargeback = adversarial. Full revoke always.
  await revokeSupporter(processor, supporter, true, 'chargeback');
  console.warn(`[stripe-webhook] Full revoke on chargeback: ${supporter.user_id}`);
}
async function bindResolvedOwner(processor: EventProcessor, userId: string): Promise<boolean> {
  if (processor.boundUserId === userId) return false;
  if (processor.boundUserId) throw new PermanentError('conflicting_event_owner');
  const result = await processor.supabase.rpc('bind_stripe_lifecycle', {
    p_id: processor.claim.id,
    p_token: processor.claim.token,
    p_user_id: userId,
  });
  requireBindingResult(result);
  processor.boundUserId = userId;
  return true;
}
async function bindEventOwner(processor: EventProcessor, event: StripeEvent): Promise<void> {
  const object = eventObject(event.data.object);
  const supporter = await eventSupporter(processor, await eventCustomer(event, object));
  const hint = getSubscriptionUserId(object) ?? clientReference(object);
  validateOwnerHint(supporter, hint);
  const userId = resolvedEventUser(supporter, hint);
  if (userId) await bindResolvedOwner(processor, userId);
}
async function dispatchEvent(processor: EventProcessor, event: StripeEvent): Promise<void> {
  await bindEventOwner(processor, event);
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(processor, event.data.object);
    case 'checkout.session.async_payment_succeeded':
      return handleAsyncPaymentSucceeded(processor, event.data.object);
    case 'checkout.session.async_payment_failed':
      return handleAsyncPaymentFailed(processor, event.data.object);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(processor, event.data.object);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(processor, event.data.object);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(processor, event.data.object);
    case 'invoice.paid':
      return handleInvoicePaid(processor, event.data.object);
    case 'charge.refunded':
      return handleChargeRefunded(processor, event.data.object);
    case 'charge.dispute.created':
      return handleChargeDisputeCreated(processor, event.data.object);
    default:
      console.info(`[stripe-webhook] Unhandled event: ${event.type}`);
      return Promise.resolve();
  }
}
function jsonResponse(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}
export async function handleStripeWebhook(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(req) });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, req);
  const event = await signedEvent(req);
  if (event instanceof Response) return event;
  return receiveAndProcess(req, event);
}
async function receiveAndProcess(req: Request, event: StripeEvent): Promise<Response> {
  const receipt = await supabase.rpc('receive_stripe_lifecycle', {
    p_event_id: event.id,
    p_type: event.type,
  });
  if (receipt.error) return jsonResponse({ error: 'Receipt unavailable' }, 503, req);
  try {
    return await withLifecycleDelivery(
      (name, args) => supabase.rpc(name, args),
      'provider_processing',
      () => withProviderBudget(() => handleVerifiedEvent(req, event))
    );
  } catch (error) {
    if (error instanceof DeliveryUnavailable)
      return jsonResponse({ received: true, completed: false, processingPaused: true }, 202, req);
    return jsonResponse({ error: 'Processing unavailable' }, 503, req);
  }
}
async function signedEvent(req: Request): Promise<StripeEvent | Response> {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  if (!(await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET)))
    return jsonResponse({ error: 'Invalid signature' }, 401, req);
  try {
    return parseEvent(body);
  } catch {
    return jsonResponse({ error: 'Malformed event' }, 400, req);
  }
}
function parseEvent(body: string): StripeEvent {
  const event = eventObject(JSON.parse(body));
  if (!validEventIdentity(event.id) || !validEventIdentity(event.type))
    throw new Error('invalid_event');
  return event as StripeEvent;
}
async function handleVerifiedEvent(req: Request, event: StripeEvent): Promise<Response> {
  let claim: EventClaim;
  try {
    claim = await claimEvent(event.id, event.type);
  } catch {
    return jsonResponse({ error: 'Event claim failed' }, 503, req);
  }
  if (claim.state !== 'processing') return unclaimedResponse(req, claim.state);
  return executeClaim(req, event, claim);
}
function unclaimedResponse(req: Request, state: string): Response {
  if (state === 'completed') return jsonResponse({ received: true, completed: true }, 200, req);
  if (state === 'operator_review')
    return jsonResponse({ received: true, completed: false, review: true }, 202, req);
  return jsonResponse({ received: true, completed: false }, 503, req);
}
async function executeClaim(
  req: Request,
  event: StripeEvent,
  claim: EventClaim
): Promise<Response> {
  try {
    await createEventProcessor(claim)(event);
    const completed = await finishEvent(claim, 'completed');
    return jsonResponse({ received: true, completed }, completed ? 200 : 202, req);
  } catch (error) {
    return persistWebhookFailure(req, claim, error);
  }
}
function terminalProviderError(error: unknown): boolean {
  return error instanceof PermanentError || (error instanceof ProviderFailure && !error.retryable);
}
function webhookFailure(error: unknown) {
  const terminal = terminalProviderError(error);
  return {
    state: terminal ? 'dead_letter' : 'retryable',
    code: terminal ? 'invalid_event' : 'processing_failed',
    status: terminal ? 202 : 503,
  };
}
async function persistWebhookFailure(
  req: Request,
  claim: EventClaim,
  error: unknown
): Promise<Response> {
  const disposition = webhookFailure(error);
  try {
    await finishEvent(claim, disposition.state, disposition.code);
  } catch {
    return jsonResponse({ error: 'Processing state requires retry' }, 503, req);
  }
  return jsonResponse({ received: true, completed: false }, disposition.status, req);
}
/** Explicit unscheduled recovery; only rows already accepted into the verified inbox are eligible. */
export async function recoverStripeEvents(
  limit = 10
): Promise<{ examined: number; completed: number }> {
  validateRecoveryLimit(limit);
  const due = await recoveryCandidates(limit);
  let completed = 0;
  for (const candidate of due) {
    if (await recoverStripeEvent(candidate.event_id, candidate.event_type)) completed++;
  }
  return { examined: due.length, completed };
}
async function recoverStripeEvent(id: string, type: string): Promise<boolean> {
  const claim = await claimEvent(id, type);
  if (claim.state !== 'processing') return claim.state === 'completed';
  try {
    const event = await recoveryEvent(id, type);
    await createEventProcessor(claim)(event);
    return await finishEvent(claim, 'completed');
  } catch (error) {
    const disposition = recoveryFailure(error);
    await finishEvent(claim, disposition.state, disposition.code);
    return false;
  }
}
if (import.meta.main) Deno.serve(handleStripeWebhook);
async function eventCompleted(claim: EventClaim) {
  const status = await supabase.rpc('lifecycle_work_status', { p_id: claim.id });
  if (status.error || !status.data) throw new Error('event_completion_status_unavailable');
  return status.data.state === 'completed';
}
function requireBindingResult(result: { error: unknown; data: unknown }) {
  if (result.error || result.data !== true) throw new Error('event_binding_failed');
}
function eventObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new PermanentError('invalid_event_object');
  return value as Record<string, unknown>;
}
function clientReference(object: Record<string, unknown>): string | null {
  return typeof object.client_reference_id === 'string' ? object.client_reference_id : null;
}
function eventCustomer(event: StripeEvent, object: Record<string, unknown>) {
  const customer = 'customer' in object ? stripeReference(object.customer) : null;
  if (customer) return customer;
  if (event.type === 'charge.dispute.created') return resolveDisputeCustomerId(object);
  return null;
}
function validateOwnerHint(
  supporter: Awaited<ReturnType<typeof findSupporterBy>>,
  hint: string | null
) {
  if (!supporter || !hint) return;
  if (supporter.user_id !== hint) throw new PermanentError('conflicting_event_owner');
}
function eventSupporter(processor: EventProcessor, customer: string | null) {
  return customer ? findSupporterBy(processor, 'stripe_customer_id', customer) : null;
}
function validateRecoveryLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25)
    throw new Error('invalid_recovery_limit');
}
async function recoveryCandidates(limit: number) {
  const due = await supabase.rpc('stripe_lifecycle_recovery_candidates', { p_limit: limit });
  if (due.error || !Array.isArray(due.data)) throw new Error('event_recovery_unavailable');
  return due.data;
}
async function recoveryEvent(id: string, type: string): Promise<StripeEvent> {
  const event = await stripeGet<StripeEvent>(`/events/${encodeURIComponent(id)}`);
  if (!event || event.id !== id || event.type !== type)
    throw new PermanentError('event_recovery_mismatch');
  return event;
}
function recoveryFailure(error: unknown) {
  const blocked = terminalProviderError(error);
  return {
    state: blocked ? 'blocked' : 'retryable',
    code: blocked ? 'provider_review_required' : 'provider_retry_required',
  };
}
function resolvedEventUser(
  supporter: Awaited<ReturnType<typeof findSupporterBy>>,
  hint: string | null
): string | null {
  return supporter?.user_id ?? hint;
}
function validEventIdentity(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}
