import { createError, defineEventHandler, readBody } from 'h3';
import Stripe from 'stripe';
import { createLogger } from '@/server/utils/logger';
const logger = createLogger('StripeCheckout');
const VALID_TIERS = ['supporter', 'scav', 'timmy', 'chad'] as const;
const VALID_INTERVALS = ['monthly', '6month', 'yearly'] as const;
const VALID_MODES = ['payment', 'subscription'] as const;
const MIN_ONE_TIME_CENTS = 300;
type CheckoutBody = {
  mode: (typeof VALID_MODES)[number];
  userId: string;
  email?: string;
  tier?: (typeof VALID_TIERS)[number];
  interval?: (typeof VALID_INTERVALS)[number];
  amount?: number;
};
function validateBody(raw: unknown): CheckoutBody {
  if (!raw || typeof raw !== 'object') {
    throw createError({ statusCode: 400, message: 'Invalid request body' });
  }
  const body = raw as Record<string, unknown>;
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    throw createError({ statusCode: 400, message: 'Must be logged in to support' });
  }
  const mode = body.mode;
  if (typeof mode !== 'string' || !VALID_MODES.includes(mode as (typeof VALID_MODES)[number])) {
    throw createError({ statusCode: 400, message: 'Invalid mode' });
  }
  const result: CheckoutBody = {
    mode: mode as (typeof VALID_MODES)[number],
    userId,
  };
  if (typeof body.email === 'string' && body.email.includes('@')) {
    result.email = body.email.trim().toLowerCase();
  }
  if (body.tier !== undefined) {
    if (
      typeof body.tier !== 'string' ||
      !VALID_TIERS.includes(body.tier as (typeof VALID_TIERS)[number])
    ) {
      throw createError({ statusCode: 400, message: 'Invalid tier' });
    }
    result.tier = body.tier as (typeof VALID_TIERS)[number];
  }
  if (body.interval !== undefined) {
    if (
      typeof body.interval !== 'string' ||
      !VALID_INTERVALS.includes(body.interval as (typeof VALID_INTERVALS)[number])
    ) {
      throw createError({ statusCode: 400, message: 'Invalid interval' });
    }
    result.interval = body.interval as (typeof VALID_INTERVALS)[number];
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw createError({ statusCode: 400, message: 'Invalid amount' });
    }
    result.amount = amount;
  }
  return result;
}
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const stripeSecretKey = config.stripeSecretKey as string;
  if (!stripeSecretKey) {
    throw createError({ statusCode: 500, message: 'Stripe not configured' });
  }
  const stripe = new Stripe(stripeSecretKey);
  const rawBody = await readBody(event);
  const { mode, tier, interval, amount, userId, email } = validateBody(rawBody);
  const appUrl = (config.public.appUrl as string) || 'https://tarkovtracker.org';
  if (mode === 'payment') {
    // One-time custom amount payment
    const amountFloat = Number(amount);
    if (!Number.isFinite(amountFloat) || amountFloat * 100 < MIN_ONE_TIME_CENTS) {
      throw createError({
        statusCode: 400,
        message: `Minimum amount is $${MIN_ONE_TIME_CENTS / 100}`,
      });
    }
    const amountCents = Math.round(amountFloat * 100);
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: userId,
        customer_email: email || undefined,
        metadata: { tier: 'supporter', type: 'one_time' },
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
  if (!tier) {
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
      customer_email: email || undefined,
      metadata: { tier, interval, type: 'subscription' },
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
