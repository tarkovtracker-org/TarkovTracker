import { createError, defineEventHandler, readBody } from 'h3';
import Stripe from 'stripe';
import { createLogger } from '@/server/utils/logger';
import {
  validateCheckoutBody,
  validateOneTimeAmount,
} from '@/server/utils/stripeCheckoutValidation';
import type { H3Event } from 'h3';
const logger = createLogger('StripeCheckout');
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const stripeSecretKey = config.stripeSecretKey as string;
  if (!stripeSecretKey) {
    throw createError({ statusCode: 500, message: 'Stripe not configured' });
  }
  // Auth is enforced by the api-protection middleware (publicRoutes does NOT
  // include /api/stripe/*), which sets event.context.auth on success.
  // Always derive userId/email from the authenticated session, never the
  // request body, to prevent attackers from creating Checkout Sessions for
  // other users (impersonation -> client_reference_id mismatch -> stolen tier).
  const authUser = (event.context as { auth?: { user?: { id?: string; email?: string } } }).auth
    ?.user;
  const userId = authUser?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  const email = authUser?.email;
  const stripe = new Stripe(stripeSecretKey);
  const rawBody = await readBody(event);
  const { mode, tier, interval, amount } = validateCheckoutBody(rawBody);
  const appUrl = (config.public.appUrl as string) || 'https://tarkovtracker.org';
  // Reuse the existing Stripe Customer for returning supporters so refund and
  // dispute lookups against stripe_customer_id keep matching after re-subscribe.
  // Falls back to customer_email for first-time supporters (Stripe creates one).
  const existingCustomerId = await getExistingStripeCustomerId(event, userId);
  const customerFields: { customer?: string; customer_email?: string } = existingCustomerId
    ? { customer: existingCustomerId }
    : email
      ? { customer_email: email }
      : {};
  if (mode === 'payment') {
    const amountCents = validateOneTimeAmount(amount);
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: userId,
        ...customerFields,
        metadata: { tier: 'supporter', type: 'one_time', user_id: userId },
        payment_intent_data: { metadata: { user_id: userId } },
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'TarkovTracker One-Time Support' },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/supporter?thanks=one_time`,
        cancel_url: `${appUrl}/supporter`,
      });
      return { url: session.url };
    } catch (err: unknown) {
      logger.error('[Stripe Checkout] One-time session creation failed', { userId, err });
      throw createError({ statusCode: 502, message: 'Failed to create checkout session' });
    }
  }
  // Subscription mode
  if (!tier || tier === 'supporter') {
    throw createError({ statusCode: 400, message: 'Invalid tier' });
  }
  if (!interval) {
    throw createError({ statusCode: 400, message: 'Invalid interval' });
  }
  // Price IDs are configured as env vars: STRIPE_PRICE_{TIER}_{INTERVAL}
  const priceKey = `stripePrice${capitalize(tier)}${capitalize(interval)}` as keyof typeof config;
  const priceId = config[priceKey] as string;
  if (!priceId) {
    throw createError({
      statusCode: 500,
      message: `Price not configured for ${tier}/${interval}`,
    });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: userId,
      ...customerFields,
      metadata: { tier, interval, type: 'subscription', user_id: userId },
      subscription_data: { metadata: { tier, interval, user_id: userId } },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/supporter?thanks=${tier}`,
      cancel_url: `${appUrl}/supporter`,
    });
    return { url: session.url };
  } catch (err: unknown) {
    logger.error('[Stripe Checkout] Subscription session creation failed', {
      userId,
      tier,
      interval,
      err,
    });
    throw createError({ statusCode: 502, message: 'Failed to create subscription' });
  }
});
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/**
 * Look up the user's existing Stripe customer ID via Supabase service role.
 * Returns null on any error or if not found — caller falls back to
 * customer_email so first-time supporters can still check out.
 */
async function getExistingStripeCustomerId(event: H3Event, userId: string): Promise<string | null> {
  const config = useRuntimeConfig(event);
  const supabaseUrl = (config.supabaseUrl as string) || '';
  const serviceKey = (config.supabaseServiceKey as string) || '';
  if (!supabaseUrl || !serviceKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url =
      `${supabaseUrl}/rest/v1/supporters` +
      `?select=stripe_customer_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
    const resp = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      logger.warn('Supporter lookup failed', { userId, status: resp.status });
      return null;
    }
    const rows = (await resp.json()) as Array<{ stripe_customer_id: string | null }>;
    const cid = rows?.[0]?.stripe_customer_id;
    return typeof cid === 'string' && cid.length > 0 ? cid : null;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      logger.warn('Supporter lookup timed out', { userId });
      return null;
    }
    logger.warn('Supporter lookup threw', { userId, err });
    return null;
  }
}
