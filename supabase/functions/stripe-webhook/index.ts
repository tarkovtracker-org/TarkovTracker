import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import {
  removeAllTierRoles,
  removeSupporterRole,
  syncLinkedAccountRole,
  syncRolesForSupporter,
} from '../_shared/discord.ts';
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
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = sigHeader.split(',').map((part) => part.split('=', 2));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;

  // Reject signatures whose timestamp is older than 5 minutes OR set in the future
  // (negative age means the signed timestamp is in the future, which Stripe never produces).
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (age > 300 || age < -30) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedBytes = new Uint8Array(sig);
  return signatures.some((signature) => {
    const signatureBytes = hexToBytes(signature);
    if (!signatureBytes || signatureBytes.length !== expectedBytes.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expectedBytes.length; i += 1) {
      mismatch |= expectedBytes[i] ^ signatureBytes[i];
    }
    return mismatch === 0;
  });
}

function hexToBytes(hex: string): Uint8Array | null {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Atomically claim a Stripe event by ID. Returns true if this is the first
 * time we've seen this event (caller should process it), false if it's a
 * duplicate (caller should ack and skip). Idempotency is the contract:
 * regardless of how many retries Stripe sends, side effects run once.
 */
async function claimEvent(eventId: string, eventType: string): Promise<boolean> {
  const { error } = await supabase
    .from('stripe_events')
    .insert({ event_id: eventId, event_type: eventType });
  if (!error) return true;
  // Postgres unique violation = already processed
  if (error.code === '23505') return false;
  console.error('[stripe-webhook] Failed to record event:', { eventId, error });
  // Treat unknown DB errors as transient so Stripe retries
  throw new Error(`Event claim failed: ${error.message}`);
}

/**
 * Extract Discord user ID from Supabase auth identities.
 * Prefer identity_data.provider_id (Discord snowflake) and fall back to
 * identity_data.sub. Avoid identity.id, which can be the Supabase row UUID
 * depending on auth client version, not the Discord-side user id.
 */
async function getDiscordUserId(userId: string): Promise<string | null> {
  const { data: linkedAccount, error: linkedAccountError } = await supabase
    .from('discord_account_links')
    .select('discord_user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (linkedAccount?.discord_user_id) return linkedAccount.discord_user_id;
  if (linkedAccountError) {
    console.warn('[stripe-webhook] Discord link lookup failed:', {
      userId,
      error: linkedAccountError,
    });
  }

  const { data } = await supabase.auth.admin.getUserById(userId);
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
// deno-lint-ignore no-explicit-any
async function resolveDiscordUserIdForSupporter(supporter: any): Promise<string | null> {
  const userId = typeof supporter?.user_id === 'string' ? supporter.user_id : null;
  if (!userId) return null;

  const persisted =
    typeof supporter.discord_user_id === 'string' && supporter.discord_user_id
      ? supporter.discord_user_id
      : null;
  const resolved = await getDiscordUserId(userId);
  if (!resolved) return persisted;

  if (supporter.discord_user_id !== resolved) {
    const { error } = await supabase
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

/**
 * Wrap a Discord role sync call so failures don't break the payment path.
 *
 * Policy: Discord role sync is treated as eventual consistency. A Discord
 * outage or 5xx must NOT cause the whole Stripe webhook to retry, because
 * Stripe would replay the payment event repeatedly and risk duplicate side
 * effects. Operators can reconcile drift via admin role-sync tooling.
 */
async function safeDiscordCall(
  label: string,
  context: Record<string, unknown>,
  fn: () => Promise<unknown>
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[stripe-webhook] Discord ${label} failed:`, { ...context, err });
  }
}

/**
 * Activate (or re-activate) a supporter from a completed/cleared checkout
 * session. Shared by checkout.session.completed and async_payment_succeeded.
 *
 * When an active subscriber makes a one-time payment, the subscription fields
 * are preserved — only tier is upgraded if the new tier outranks the current.
 */
// deno-lint-ignore no-explicit-any
async function activateSupporterFromSession(session: any, source: string): Promise<void> {
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
  const discordUserId = await getDiscordUserId(userId);

  // Preserve started_at across re-subscriptions so renewal/upgrade flows
  // don't reset the original support date. Only set it when the row is new.
  const { data: existing } = await supabase
    .from('supporters')
    .select(
      'started_at, status, type, stripe_subscription_id, stripe_customer_id, tier, expires_at'
    )
    .eq('user_id', userId)
    .maybeSingle();
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

  const { error } = await supabase.from('supporters').upsert(record, { onConflict: 'user_id' });

  if (error) {
    throw new Error(`Failed to upsert supporter for ${userId}: ${error.message}`);
  }

  if (discordUserId) {
    await safeDiscordCall(`linked role sync (${source})`, { userId, discordUserId }, () =>
      syncLinkedAccountRole(discordUserId)
    );
    await safeDiscordCall(
      `role sync (${source})`,
      { userId, discordUserId, tier: effectiveTier },
      () => syncRolesForSupporter(discordUserId, effectiveTier, true)
    );
  }

  console.info(
    `[stripe-webhook] Supporter activated (${source}): ${userId} tier=${effectiveTier} type=${record.type}`
  );
}

/**
 * Look up a supporter by an exact column match. Returns null if not found
 * (caller decides whether that's permanent or expected).
 */
async function findSupporterBy(
  column: 'stripe_subscription_id' | 'stripe_customer_id' | 'user_id',
  value: string
) {
  const { data, error } = await supabase
    .from('supporters')
    .select('*')
    .eq(column, value)
    .maybeSingle();
  if (error) {
    throw new Error(`Lookup by ${column} failed: ${error.message}`);
  }
  return data;
}

// deno-lint-ignore no-explicit-any
async function handleCheckoutCompleted(session: any): Promise<void> {
  if (session?.mode !== 'payment' && session?.mode !== 'subscription') {
    throw new PermanentError('checkout.session.completed with invalid mode');
  }
  if (!shouldActivateCheckoutSession(session)) {
    console.info(
      `[stripe-webhook] Payment not yet paid, deferring: ${session.client_reference_id}`
    );
    return;
  }
  await activateSupporterFromSession(session, 'checkout.session.completed');
}

// deno-lint-ignore no-explicit-any
async function handleAsyncPaymentSucceeded(session: any): Promise<void> {
  await activateSupporterFromSession(session, 'async_payment_succeeded');
}

// deno-lint-ignore no-explicit-any
async function handleSubscriptionUpdated(subscription: any): Promise<void> {
  const subscriptionId = getStripeReferenceId(subscription);
  if (!subscriptionId) return;
  const latestSubscription = await fetchLatestSubscription(subscriptionId);
  await reconcileSubscription(latestSubscription);
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
  subscription: StripeSubscription,
  paymentConfirmed = false
): Promise<void> {
  let supporter = await findSupporterBy('stripe_subscription_id', subscription.id);
  const metadataUserId = getSubscriptionUserId(subscription);
  if (!supporter && metadataUserId) {
    supporter = await findSupporterBy('user_id', metadataUserId);
  }
  const userId = supporter?.user_id || metadataUserId;
  if (!userId) return;
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
    expiresAt = grace.toISOString();
  } else if (!isActive) {
    status = 'expired';
    expiresAt = new Date().toISOString();
  }

  const entitlementTier = isActive
    ? newTier
    : isPastDue
      ? supporter?.tier || newTier
      : 'supporter';
  const hasEverSupported = supporter?.has_ever_supported === true || paymentConfirmed;
  const discordUserId = await getDiscordUserId(userId);
  const { error } = await supabase.from('supporters').upsert(
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
      ? await resolveDiscordUserIdForSupporter({ ...supporter, user_id: userId })
      : null);
  if (resolvedDiscordUserId) {
    if (isActive) {
      await safeDiscordCall(
        'role sync (subscription updated)',
        { userId, discordUserId: resolvedDiscordUserId, tier: newTier },
        () => syncRolesForSupporter(resolvedDiscordUserId, newTier, true)
      );
    } else if (isPastDue) {
      await safeDiscordCall(
        'role sync (subscription grace period)',
        { userId, discordUserId: resolvedDiscordUserId, tier: entitlementTier },
        () => syncRolesForSupporter(resolvedDiscordUserId, entitlementTier, true)
      );
    } else if (hasEverSupported) {
      await safeDiscordCall(
        'lifetime role sync (subscription inactive)',
        { userId, discordUserId: resolvedDiscordUserId },
        () => syncRolesForSupporter(resolvedDiscordUserId, 'supporter', true)
      );
    } else {
      await safeDiscordCall(
        'remove tier roles (subscription updated)',
        { userId, discordUserId: resolvedDiscordUserId },
        () => removeAllTierRoles(resolvedDiscordUserId)
      );
      await safeDiscordCall(
        'remove supporter role (subscription updated)',
        { userId, discordUserId: resolvedDiscordUserId },
        () => removeSupporterRole(resolvedDiscordUserId)
      );
    }
  }
}

// deno-lint-ignore no-explicit-any
async function handleSubscriptionDeleted(subscription: any): Promise<void> {
  const supporter = await findSupporterBy('stripe_subscription_id', subscription.id);
  if (!supporter) return;

  const { error } = await supabase
    .from('supporters')
    .update({
      status: 'expired',
      tier: 'supporter',
      expires_at: new Date().toISOString(),
      stripe_subscription_id: null,
    })
    .eq('user_id', supporter.user_id);

  if (error) {
    throw new Error(`Failed to expire subscription for ${supporter.user_id}: ${error.message}`);
  }

  const discordUserId = await resolveDiscordUserIdForSupporter(supporter);
  if (discordUserId) {
    await safeDiscordCall(
      'remove tier roles (subscription deleted)',
      { userId: supporter.user_id, discordUserId },
      () => removeAllTierRoles(discordUserId)
    );
  }

  console.info(`[stripe-webhook] Subscription expired: ${supporter.user_id}`);
}

// deno-lint-ignore no-explicit-any
async function handleInvoicePaymentFailed(invoice: any): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  await reconcileSubscription(await fetchLatestSubscription(subscriptionId));
}

// deno-lint-ignore no-explicit-any
async function handleInvoicePaid(invoice: any): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  await reconcileSubscription(await fetchLatestSubscription(subscriptionId), true);
}

/**
 * Authenticated GET against the Stripe REST API. Returns parsed JSON, or null
 * on HTTP error (caller decides how to fall back).
 */
async function stripeGet<T>(path: string): Promise<T | null> {
  if (!STRIPE_SECRET_KEY) return null;
  try {
    const resp = await fetch(`${STRIPE_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Stripe-Version': STRIPE_API_VERSION,
      },
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(
        `[stripe-webhook] Stripe GET ${path} failed (${resp.status}): ${body.slice(0, 500)}`
      );
      return null;
    }
    return (await resp.json()) as T;
  } catch (err) {
    console.error(`[stripe-webhook] Stripe GET ${path} threw:`, err);
    return null;
  }
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
async function handleAsyncPaymentFailed(session: any): Promise<void> {
  const userId = session.client_reference_id;
  if (!userId) {
    throw new PermanentError('async_payment_failed without client_reference_id');
  }

  console.warn(
    `[stripe-webhook] Async payment failed (ACH/delayed): user=${userId} session=${session.id}`
  );

  const supporter = await findSupporterBy('user_id', userId);
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

  const { error } = await supabase
    .from('supporters')
    .update({ status: 'expired', expires_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) {
    throw new Error(`Failed to expire async-failed supporter for ${userId}: ${error.message}`);
  }

  const discordUserId = await resolveDiscordUserIdForSupporter(supporter);
  if (discordUserId) {
    await safeDiscordCall(
      'remove tier roles (async payment failed)',
      { userId, discordUserId },
      () => removeAllTierRoles(discordUserId)
    );
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

  const { data, error } = await supabase
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

  const discordUserId = await resolveDiscordUserIdForSupporter(supporter);
  if (!discordUserId) return;

  await safeDiscordCall(
    `remove tier roles (${reason})`,
    { userId: supporter.user_id, discordUserId },
    () => removeAllTierRoles(discordUserId)
  );

  if (fullRevoke) {
    await safeDiscordCall(
      `remove supporter role (${reason})`,
      { userId: supporter.user_id, discordUserId },
      () => removeSupporterRole(discordUserId)
    );
  }
}

// deno-lint-ignore no-explicit-any
async function handleChargeRefunded(charge: any): Promise<void> {
  if (!isFullRefund(charge)) {
    console.info(`[stripe-webhook] Partial refund for charge ${charge?.id}; keeping entitlement`);
    return;
  }
  const customerId = typeof charge?.customer === 'string' ? charge.customer : null;
  if (!customerId) return;

  const supporter = await findSupporterBy('stripe_customer_id', customerId);
  if (!supporter) {
    // Stripe webhook ordering is not guaranteed: a refund can arrive before
    // checkout.session.completed activates the supporter row. If we ack the
    // refund here, the activation event would later create the row as if no
    // refund happened. Throw transient so the idempotency claim rolls back
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
  await revokeSupporter(supporter, fullRevoke, fullRevoke ? 'refund (first)' : 'refund (partial)');
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
  if (!chargeId) return null;
  const charge = await stripeGet<{ customer?: string | null }>(
    `/charges/${encodeURIComponent(chargeId)}`
  );
  return typeof charge?.customer === 'string' && charge.customer ? charge.customer : null;
}

// deno-lint-ignore no-explicit-any
async function handleChargeDisputeCreated(dispute: any): Promise<void> {
  const customerId = await resolveDisputeCustomerId(dispute);
  if (!customerId) return;

  const supporter = await findSupporterBy('stripe_customer_id', customerId);
  if (!supporter) {
    // Webhook ordering: a dispute can arrive before activation. Treat as
    // transient so Stripe retries until either the row appears (and we
    // revoke) or the retry window closes. See handleChargeRefunded note.
    throw new Error(
      `charge.dispute.created for customer=${customerId} dispute=${dispute.id} has no supporter row yet; deferring`
    );
  }

  // Chargeback = adversarial. Full revoke always.
  await revokeSupporter(supporter, true, 'chargeback');
  console.warn(`[stripe-webhook] Full revoke on chargeback: ${supporter.user_id}`);
}

type StripeEvent = { id: string; type: string; data: { object: unknown } };

function dispatchEvent(event: StripeEvent): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event.data.object);
    case 'checkout.session.async_payment_succeeded':
      return handleAsyncPaymentSucceeded(event.data.object);
    case 'checkout.session.async_payment_failed':
      return handleAsyncPaymentFailed(event.data.object);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(event.data.object);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event.data.object);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event.data.object);
    case 'invoice.paid':
      return handleInvoicePaid(event.data.object);
    case 'charge.refunded':
      return handleChargeRefunded(event.data.object);
    case 'charge.dispute.created':
      return handleChargeDisputeCreated(event.data.object);
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(req) });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req);
  }

  const body = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';

  const valid = await verifyStripeSignature(body, sigHeader, STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.warn('[stripe-webhook] Invalid signature');
    return jsonResponse({ error: 'Invalid signature' }, 401, req);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(body);
  } catch (err) {
    console.warn('[stripe-webhook] Invalid JSON payload:', err);
    return jsonResponse({ error: 'Invalid JSON' }, 400, req);
  }

  if (!event?.id || !event?.type) {
    console.warn('[stripe-webhook] Missing event id/type');
    return jsonResponse({ error: 'Malformed event' }, 400, req);
  }

  // Idempotency: claim the event ID before any side effects. Duplicates are
  // ack'd 200 with no further work.
  let claimed: boolean;
  try {
    claimed = await claimEvent(event.id, event.type);
  } catch (err) {
    console.error('[stripe-webhook] Event claim transient failure, retrying:', err);
    return jsonResponse({ error: 'Event claim failed' }, 500, req);
  }
  if (!claimed) {
    console.info(`[stripe-webhook] Duplicate event ignored: ${event.id} (${event.type})`);
    return jsonResponse({ received: true, duplicate: true }, 200, req);
  }

  try {
    await dispatchEvent(event);
  } catch (err) {
    if (err instanceof PermanentError) {
      // Permanent failures: log and ack 200 so Stripe stops retrying. Ops
      // can investigate via the stripe_events row already inserted.
      console.error(`[stripe-webhook] Permanent failure for ${event.type}:`, err.message);
      return jsonResponse({ received: true, error: 'permanent' }, 200, req);
    }
    // Transient failure: roll back the idempotency claim so the next retry
    // can process. If rollback fails, log and let Stripe retry the dedup
    // row will block re-processing — better than double-side-effects.
    console.error(`[stripe-webhook] Transient failure for ${event.type}:`, err);
    const { error: rollbackErr } = await supabase
      .from('stripe_events')
      .delete()
      .eq('event_id', event.id);
    if (rollbackErr) {
      console.error('[stripe-webhook] Idempotency rollback failed:', rollbackErr);
    }
    return jsonResponse({ error: 'Processing failed' }, 500, req);
  }

  return jsonResponse({ received: true }, 200, req);
});
