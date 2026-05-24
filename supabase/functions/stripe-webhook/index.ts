import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import {
  getDiscordRoleConfig,
  removeAllTierRoles,
  removeRole,
  syncRolesForSupporter,
} from '../_shared/discord.ts';

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GRACE_PERIOD_DAYS = 7;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    '[stripe-webhook] Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

/**
 * Verify Stripe webhook signature using Web Crypto API (no stripe npm dependency).
 */
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k, v];
    })
  );
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

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
  const signatureBytes = hexToBytes(signature);
  if (!signatureBytes || signatureBytes.length !== expectedBytes.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedBytes.length; i += 1) {
    mismatch |= expectedBytes[i] ^ signatureBytes[i];
  }
  return mismatch === 0;
}

/**
 * Decode a hex string to a byte array. Returns null on invalid input.
 */
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
 * Extract Discord user ID from Supabase auth identities.
 * Prefer identity_data.provider_id (Discord snowflake) and fall back to
 * identity_data.sub. Avoid identity.id, which can be the Supabase row UUID
 * depending on auth client version, not the Discord-side user id.
 */
async function getDiscordUserId(userId: string): Promise<string | null> {
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
 * Map Stripe price metadata to tier name.
 * Falls back to metadata.tier from the checkout session.
 */
function resolveTier(metadata: Record<string, string>): string {
  return metadata?.tier || 'supporter';
}

/**
 * Wrap a Discord role sync call so failures don't break the payment path.
 * Logs the error with context but still allows the webhook to return 200.
 *
 * Policy: Discord role sync is treated as eventual consistency. A Discord
 * outage or 5xx must NOT cause the whole Stripe webhook to retry, because
 * Stripe would replay the payment event repeatedly and risk duplicate side
 * effects (notifications, audit logs). Operators can reconcile drift via the
 * admin role-sync tooling. If a fully consistent path is required, build a
 * dedicated reconcile queue rather than blocking the payment ack.
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

// deno-lint-ignore no-explicit-any
async function handleCheckoutCompleted(session: any): Promise<void> {
  const userId = session.client_reference_id;
  if (!userId) {
    console.warn('[stripe-webhook] checkout.session.completed without client_reference_id');
    return;
  }

  // ACH Direct Debit and other delayed methods complete the session before funds clear.
  // Defer activation until async_payment_succeeded fires.
  if (session.payment_status === 'processing') {
    console.info(
      `[stripe-webhook] Payment processing (delayed method), deferring activation: ${userId}`
    );
    return;
  }

  const tier = resolveTier(session.metadata || {});
  const isSubscription = session.mode === 'subscription';
  const discordUserId = await getDiscordUserId(userId);

  // Preserve started_at across re-subscriptions so renewal/upgrade flows
  // don't reset the original support date. Only set it when the row is new.
  const { data: existing } = await supabase
    .from('supporters')
    .select('started_at')
    .eq('user_id', userId)
    .maybeSingle();
  const startedAt = existing?.started_at ?? new Date().toISOString();

  const record = {
    user_id: userId,
    tier,
    status: 'active',
    type: isSubscription ? 'subscription' : 'one_time',
    stripe_customer_id: session.customer || null,
    stripe_subscription_id: session.subscription || null,
    has_ever_supported: true,
    discord_user_id: discordUserId,
    amount_total: session.amount_total || 0,
    started_at: startedAt,
    expires_at: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('supporters')
    .upsert(record, { onConflict: 'user_id' });

  if (error) {
    console.error('[stripe-webhook] Failed to upsert supporter:', error);
    throw new Error(`Failed to upsert supporter for ${userId}: ${error.message}`);
  }

  // Sync Discord roles (best-effort — Discord failures must not retry payment events)
  if (discordUserId) {
    await safeDiscordCall('role sync', { userId, discordUserId, tier }, () =>
      syncRolesForSupporter(discordUserId, tier, true)
    );
  }

  console.info(`[stripe-webhook] Supporter activated: ${userId} tier=${tier} type=${record.type}`);
}

// deno-lint-ignore no-explicit-any
async function handleSubscriptionUpdated(subscription: any): Promise<void> {
  // Find supporter by subscription ID
  const { data: supporter } = await supabase
    .from('supporters')
    .select('*')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();

  if (!supporter) return;

  const newTier = subscription.metadata?.tier || supporter.tier;
  const isActive = subscription.status === 'active' || subscription.status === 'trialing';
  const isPastDue = subscription.status === 'past_due';

  let status = 'active';
  let expiresAt: string | null = null;

  if (isPastDue) {
    status = 'past_due';
    // Set grace period expiration
    const grace = new Date();
    grace.setDate(grace.getDate() + GRACE_PERIOD_DAYS);
    expiresAt = grace.toISOString();
  } else if (!isActive) {
    status = 'expired';
    expiresAt = new Date().toISOString();
  }

  const { error } = await supabase
    .from('supporters')
    .update({
      tier: isActive ? newTier : isPastDue ? supporter.tier : 'supporter',
      status,
      expires_at: expiresAt,
    })
    .eq('user_id', supporter.user_id);

  if (error) {
    console.error('[stripe-webhook] Failed to update subscription:', error);
    throw new Error(
      `Failed to update subscription for ${supporter.user_id}: ${error.message}`
    );
  }

  // Sync Discord roles (best-effort)
  if (supporter.discord_user_id) {
    if (isActive) {
      await safeDiscordCall(
        'role sync',
        { userId: supporter.user_id, discordUserId: supporter.discord_user_id, tier: newTier },
        () => syncRolesForSupporter(supporter.discord_user_id, newTier, true)
      );
    } else if (!isActive && !isPastDue) {
      await safeDiscordCall(
        'remove tier roles',
        { userId: supporter.user_id, discordUserId: supporter.discord_user_id },
        () => removeAllTierRoles(supporter.discord_user_id)
      );
    }
  }
}

// deno-lint-ignore no-explicit-any
async function handleSubscriptionDeleted(subscription: any): Promise<void> {
  const { data: supporter } = await supabase
    .from('supporters')
    .select('*')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();

  if (!supporter) return;

  // Mark as expired but keep has_ever_supported = true
  const { error } = await supabase
    .from('supporters')
    .update({
      status: 'expired',
      tier: 'supporter', // Downgrade to base supporter (permanent)
      expires_at: new Date().toISOString(),
      stripe_subscription_id: null,
    })
    .eq('user_id', supporter.user_id);

  if (error) {
    console.error('[stripe-webhook] Failed to expire subscription:', error);
    throw new Error(
      `Failed to expire subscription for ${supporter.user_id}: ${error.message}`
    );
  }

  // Remove tier roles but keep base Supporter role (best-effort)
  if (supporter.discord_user_id) {
    await safeDiscordCall(
      'remove tier roles',
      { userId: supporter.user_id, discordUserId: supporter.discord_user_id },
      () => removeAllTierRoles(supporter.discord_user_id)
    );
  }

  console.info(`[stripe-webhook] Subscription expired: ${supporter.user_id}`);
}

// deno-lint-ignore no-explicit-any
async function handleInvoicePaymentFailed(invoice: any): Promise<void> {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const { data: supporter } = await supabase
    .from('supporters')
    .select('*')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!supporter) return;

  // Set grace period
  const grace = new Date();
  grace.setDate(grace.getDate() + GRACE_PERIOD_DAYS);

  const { error } = await supabase
    .from('supporters')
    .update({
      status: 'past_due',
      expires_at: grace.toISOString(),
    })
    .eq('user_id', supporter.user_id);

  if (error) {
    console.error('[stripe-webhook] Failed to mark past_due on payment failure:', error);
    throw new Error(
      `Failed to mark past_due for ${supporter.user_id}: ${error.message}`
    );
  }

  console.warn(`[stripe-webhook] Payment failed for ${supporter.user_id}, grace until ${grace.toISOString()}`);
}

/**
 * Count successful charges for a Stripe customer via the Stripe Charges API.
 * Falls back to a conservative count of 1 (treats the refund as the only payment)
 * if Stripe is unreachable or unauthorized, which is the safer default for refunds.
 */
async function getCustomerPaymentCount(stripeCustomerId: string): Promise<number> {
  if (!STRIPE_SECRET_KEY) {
    console.warn(
      '[stripe-webhook] STRIPE_SECRET_KEY missing; cannot determine charge history. Defaulting to 1.'
    );
    return 1;
  }

  try {
    let count = 0;
    let startingAfter: string | undefined;
    // Page through up to 5 pages of 100 to keep the worst case bounded for noisy customers
    for (let page = 0; page < 5; page += 1) {
      const params = new URLSearchParams({
        customer: stripeCustomerId,
        limit: '100',
      });
      if (startingAfter) params.set('starting_after', startingAfter);

      const resp = await fetch(`https://api.stripe.com/v1/charges?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Stripe-Version': '2024-06-20',
        },
      });

      if (!resp.ok) {
        const body = await resp.text();
        console.error(
          `[stripe-webhook] Stripe charges lookup failed (${resp.status}) for ${stripeCustomerId}: ${body.slice(0, 500)}`
        );
        return 1;
      }

      const json = (await resp.json()) as {
        data: Array<{ id: string; status: string }>;
        has_more: boolean;
      };

      for (const charge of json.data) {
        if (charge.status === 'succeeded') count += 1;
      }

      if (!json.has_more || json.data.length === 0) break;
      startingAfter = json.data[json.data.length - 1].id;
    }

    return count;
  } catch (err) {
    console.error('[stripe-webhook] Charge history lookup threw:', { stripeCustomerId, err });
    return 1;
  }
}

// deno-lint-ignore no-explicit-any
async function handleAsyncPaymentSucceeded(session: any): Promise<void> {
  const userId = session.client_reference_id;
  if (!userId) {
    console.warn('[stripe-webhook] async_payment_succeeded without client_reference_id');
    return;
  }

  const tier = resolveTier(session.metadata || {});
  const isSubscription = session.mode === 'subscription';
  const discordUserId = await getDiscordUserId(userId);

  // Preserve started_at across re-subscriptions (see handleCheckoutCompleted).
  const { data: existing } = await supabase
    .from('supporters')
    .select('started_at')
    .eq('user_id', userId)
    .maybeSingle();
  const startedAt = existing?.started_at ?? new Date().toISOString();

  const record = {
    user_id: userId,
    tier,
    status: 'active',
    type: isSubscription ? 'subscription' : 'one_time',
    stripe_customer_id: session.customer || null,
    stripe_subscription_id: session.subscription || null,
    has_ever_supported: true,
    discord_user_id: discordUserId,
    amount_total: session.amount_total || 0,
    started_at: startedAt,
    expires_at: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('supporters').upsert(record, { onConflict: 'user_id' });

  if (error) {
    console.error('[stripe-webhook] Failed to upsert supporter (async payment):', error);
    throw new Error(
      `Failed to upsert supporter (async) for ${userId}: ${error.message}`
    );
  }

  if (discordUserId) {
    await safeDiscordCall('role sync (async)', { userId, discordUserId, tier }, () =>
      syncRolesForSupporter(discordUserId, tier, true)
    );
  }

  console.info(
    `[stripe-webhook] Supporter activated (async payment cleared): ${userId} tier=${tier} type=${record.type}`
  );
}

// deno-lint-ignore no-explicit-any
async function handleAsyncPaymentFailed(session: any): Promise<void> {
  const userId = session.client_reference_id;
  if (!userId) {
    console.warn('[stripe-webhook] async_payment_failed without client_reference_id');
    return;
  }

  console.warn(
    `[stripe-webhook] Async payment failed (ACH/delayed), no activation: ${userId}`
  );

  // Ensure no lingering active record exists from a prior partial state.
  const { data: supporter } = await supabase
    .from('supporters')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();

  // Only update if somehow the record was set active (guard against duplicate events).
  if (supporter?.status === 'active') {
    const { error } = await supabase
      .from('supporters')
      .update({ status: 'expired', expires_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) {
      console.error('[stripe-webhook] Failed to expire on async payment failure:', error);
      throw new Error(
        `Failed to expire async-failed supporter for ${userId}: ${error.message}`
      );
    }
  }
}

// deno-lint-ignore no-explicit-any
async function handleChargeRefunded(charge: any): Promise<void> {
  const customerId = charge.customer;
  if (!customerId) return;

  const { data: supporter } = await supabase
    .from('supporters')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!supporter) return;

  const paymentCount = await getCustomerPaymentCount(customerId);

  if (paymentCount <= 1) {
    // First/only payment refunded — not a real supporter
    const { error } = await supabase
      .from('supporters')
      .update({
        status: 'cancelled',
        has_ever_supported: false,
        tier: 'supporter',
        expires_at: new Date().toISOString(),
        stripe_subscription_id: null,
      })
      .eq('user_id', supporter.user_id);

    if (error) {
      console.error('[stripe-webhook] Failed to revoke on refund:', error);
      throw new Error(`Failed to revoke supporter on refund for ${supporter.user_id}: ${error.message}`);
    }

    // Remove ALL roles including base Supporter (best-effort)
    if (supporter.discord_user_id) {
      await safeDiscordCall(
        'remove tier roles (refund)',
        { userId: supporter.user_id, discordUserId: supporter.discord_user_id },
        () => removeAllTierRoles(supporter.discord_user_id)
      );
      await safeDiscordCall(
        'remove supporter role (refund)',
        { userId: supporter.user_id, discordUserId: supporter.discord_user_id },
        () =>
          removeRole({
            guildId: getDiscordRoleConfig().guildId,
            userId: supporter.discord_user_id,
            roleId: getDiscordRoleConfig().supporterRoleId,
          })
      );
    }

    console.info(`[stripe-webhook] Full revoke on refund (first payment): ${supporter.user_id}`);
  } else {
    // Long-time supporter refunding latest — keep base Supporter, expire tier
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
      console.error('[stripe-webhook] Failed to downgrade on refund:', error);
      throw new Error(`Failed to downgrade supporter on refund for ${supporter.user_id}: ${error.message}`);
    }

    // Remove tier roles but keep base Supporter (best-effort)
    if (supporter.discord_user_id) {
      await safeDiscordCall(
        'remove tier roles (partial refund)',
        { userId: supporter.user_id, discordUserId: supporter.discord_user_id },
        () => removeAllTierRoles(supporter.discord_user_id)
      );
    }

    console.info(`[stripe-webhook] Partial revoke on refund (kept Supporter): ${supporter.user_id}`);
  }
}

/**
 * Resolve the customer for a dispute. `dispute.charge` is a charge ID string
 * (Stripe webhooks send unexpanded refs), and disputes don't always carry a
 * top-level customer field, so fetch the charge directly when needed.
 */
async function resolveDisputeCustomerId(
  // deno-lint-ignore no-explicit-any
  dispute: any
): Promise<string | null> {
  if (typeof dispute?.customer === 'string' && dispute.customer) return dispute.customer;
  const chargeId = typeof dispute?.charge === 'string' ? dispute.charge : null;
  if (!chargeId) return null;
  if (!STRIPE_SECRET_KEY) {
    console.warn(
      '[stripe-webhook] Cannot resolve dispute charge customer: STRIPE_SECRET_KEY missing'
    );
    return null;
  }
  try {
    const resp = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(chargeId)}`, {
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Stripe-Version': '2024-06-20',
      },
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(
        `[stripe-webhook] Stripe charge lookup failed for dispute (${resp.status}) ${chargeId}: ${body.slice(0, 500)}`
      );
      return null;
    }
    const charge = (await resp.json()) as { customer?: string | null };
    return typeof charge.customer === 'string' && charge.customer ? charge.customer : null;
  } catch (err) {
    console.error('[stripe-webhook] Charge retrieve threw for dispute:', { chargeId, err });
    return null;
  }
}

// deno-lint-ignore no-explicit-any
async function handleChargeDisputeCreated(dispute: any): Promise<void> {
  const customerId = await resolveDisputeCustomerId(dispute);
  if (!customerId) return;

  const { data: supporter } = await supabase
    .from('supporters')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!supporter) return;

  // Chargeback = adversarial. Full revoke always.
  const { error } = await supabase
    .from('supporters')
    .update({
      status: 'cancelled',
      has_ever_supported: false,
      tier: 'supporter',
      expires_at: new Date().toISOString(),
      stripe_subscription_id: null,
    })
    .eq('user_id', supporter.user_id);

  if (error) {
    console.error('[stripe-webhook] Failed to revoke on dispute:', error);
    throw new Error(`Failed to revoke supporter on dispute for ${supporter.user_id}: ${error.message}`);
  }

  // Remove ALL roles (best-effort)
  if (supporter.discord_user_id) {
    await safeDiscordCall(
      'remove tier roles (dispute)',
      { userId: supporter.user_id, discordUserId: supporter.discord_user_id },
      () => removeAllTierRoles(supporter.discord_user_id)
    );
    await safeDiscordCall(
      'remove supporter role (dispute)',
      { userId: supporter.user_id, discordUserId: supporter.discord_user_id },
      () =>
        removeRole({
          guildId: getDiscordRoleConfig().guildId,
          userId: supporter.discord_user_id,
          roleId: getDiscordRoleConfig().supporterRoleId,
        })
    );
  }

  console.warn(`[stripe-webhook] Full revoke on chargeback: ${supporter.user_id}`);
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(req) });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
    });
  }

  const body = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const valid = await verifyStripeSignature(body, sigHeader, STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.warn('[stripe-webhook] Invalid signature');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let event: { type: string; data: { object: unknown } };
  try {
    event = JSON.parse(body);
  } catch (err) {
    console.warn('[stripe-webhook] Invalid JSON payload:', err);
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case 'checkout.session.async_payment_succeeded':
        await handleAsyncPaymentSucceeded(event.data.object);
        break;
      case 'checkout.session.async_payment_failed':
        await handleAsyncPaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;
      case 'charge.dispute.created':
        await handleChargeDisputeCreated(event.data.object);
        break;
      default:
        console.info(`[stripe-webhook] Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error processing ${event.type}:`, err);
    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
