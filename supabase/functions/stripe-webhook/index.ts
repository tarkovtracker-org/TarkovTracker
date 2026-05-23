import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import {
  getDiscordRoleConfig,
  removeAllTierRoles,
  removeRole,
  syncRolesForSupporter,
} from '../_shared/discord.ts';

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GRACE_PERIOD_DAYS = 7;

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

  // Reject timestamps older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (Math.abs(age) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return expectedHex === signature;
}

/**
 * Extract Discord user ID from Supabase auth identities.
 */
async function getDiscordUserId(userId: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  if (!data?.user?.identities) return null;
  const discordIdentity = data.user.identities.find((i) => i.provider === 'discord');
  return discordIdentity?.identity_data?.provider_id || discordIdentity?.id || null;
}

/**
 * Map Stripe price metadata to tier name.
 * Falls back to metadata.tier from the checkout session.
 */
function resolveTier(metadata: Record<string, string>): string {
  return metadata?.tier || 'supporter';
}

// deno-lint-ignore no-explicit-any
async function handleCheckoutCompleted(session: any): Promise<void> {
  const userId = session.client_reference_id;
  if (!userId) {
    console.warn('[stripe-webhook] checkout.session.completed without client_reference_id');
    return;
  }

  const tier = resolveTier(session.metadata || {});
  const isSubscription = session.mode === 'subscription';
  const discordUserId = await getDiscordUserId(userId);

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
    started_at: new Date().toISOString(),
    expires_at: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('supporters')
    .upsert(record, { onConflict: 'user_id' });

  if (error) {
    console.error('[stripe-webhook] Failed to upsert supporter:', error);
    return;
  }

  // Sync Discord roles
  if (discordUserId) {
    await syncRolesForSupporter(discordUserId, tier, true);
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
      tier: isActive ? newTier : supporter.tier,
      status,
      expires_at: expiresAt,
    })
    .eq('user_id', supporter.user_id);

  if (error) {
    console.error('[stripe-webhook] Failed to update subscription:', error);
    return;
  }

  // Sync Discord roles
  if (supporter.discord_user_id) {
    if (isActive) {
      await syncRolesForSupporter(supporter.discord_user_id, newTier, true);
    } else if (!isActive && !isPastDue) {
      await removeAllTierRoles(supporter.discord_user_id);
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
    return;
  }

  // Remove tier roles but keep base Supporter role
  if (supporter.discord_user_id) {
    await removeAllTierRoles(supporter.discord_user_id);
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

  await supabase
    .from('supporters')
    .update({
      status: 'past_due',
      expires_at: grace.toISOString(),
    })
    .eq('user_id', supporter.user_id);

  console.warn(`[stripe-webhook] Payment failed for ${supporter.user_id}, grace until ${grace.toISOString()}`);
}

/**
 * Count successful payments for a Stripe customer to determine supporter history.
 */
async function getCustomerPaymentCount(stripeCustomerId: string): Promise<number> {
  // Query the supporters table for historical context.
  // A more robust approach would query Stripe API for charges, but for now
  // we track via the amount_total and started_at to infer history.
  // If started_at is more than 30 days ago OR amount_total indicates multiple payments,
  // they have payment history.
  const { data } = await supabase
    .from('supporters')
    .select('started_at, amount_total')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  if (!data) return 0;

  // If they've been a supporter for more than 30 days, they have history
  const startedAt = new Date(data.started_at);
  const daysSinceStart = (Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceStart > 30) return 2; // Indicates multiple billing cycles

  return 1; // Only one payment period
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
      return;
    }

    // Remove ALL roles including base Supporter
    if (supporter.discord_user_id) {
      await removeAllTierRoles(supporter.discord_user_id);
      await removeRole({
        guildId: getDiscordRoleConfig().guildId,
        userId: supporter.discord_user_id,
        roleId: getDiscordRoleConfig().supporterRoleId,
      });
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
      return;
    }

    // Remove tier roles but keep base Supporter
    if (supporter.discord_user_id) {
      await removeAllTierRoles(supporter.discord_user_id);
    }

    console.info(`[stripe-webhook] Partial revoke on refund (kept Supporter): ${supporter.user_id}`);
  }
}

// deno-lint-ignore no-explicit-any
async function handleChargeDisputeCreated(dispute: any): Promise<void> {
  const customerId = dispute.customer || dispute.charge?.customer;
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
    return;
  }

  // Remove ALL roles
  if (supporter.discord_user_id) {
    await removeAllTierRoles(supporter.discord_user_id);
    await removeRole({
      guildId: getDiscordRoleConfig().guildId,
      userId: supporter.discord_user_id,
      roleId: getDiscordRoleConfig().supporterRoleId,
    });
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

  const event = JSON.parse(body);

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
