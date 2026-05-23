import { createError, defineEventHandler, readBody } from 'h3';
import Stripe from 'stripe';
const VALID_TIERS = ['supporter', 'scav', 'timmy', 'chad'] as const;
const VALID_INTERVALS = ['monthly', '6month', 'yearly'] as const;
const MIN_ONE_TIME_CENTS = 300;
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const stripeSecretKey = config.stripeSecretKey as string;
  if (!stripeSecretKey) {
    throw createError({ statusCode: 500, message: 'Stripe not configured' });
  }
  const stripe = new Stripe(stripeSecretKey);
  const body = await readBody(event);
  const { mode, tier, interval, amount, userId } = body as {
    mode: 'payment' | 'subscription';
    tier?: string;
    interval?: string;
    amount?: number;
    userId?: string;
  };
  if (!userId) {
    throw createError({ statusCode: 400, message: 'Must be logged in to support' });
  }
  if (!mode || !['payment', 'subscription'].includes(mode)) {
    throw createError({ statusCode: 400, message: 'Invalid mode' });
  }
  const appUrl = (config.public.appUrl as string) || 'https://tarkovtracker.org';
  if (mode === 'payment') {
    // One-time custom amount payment
    const amountCents = Math.round(Number(amount) * 100);
    if (!amountCents || amountCents < MIN_ONE_TIME_CENTS) {
      throw createError({
        statusCode: 400,
        message: `Minimum amount is $${MIN_ONE_TIME_CENTS / 100}`,
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: userId,
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
  }
  // Subscription mode
  if (!tier || !VALID_TIERS.includes(tier as (typeof VALID_TIERS)[number])) {
    throw createError({ statusCode: 400, message: 'Invalid tier' });
  }
  if (!interval || !VALID_INTERVALS.includes(interval as (typeof VALID_INTERVALS)[number])) {
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
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    client_reference_id: userId,
    metadata: { tier, interval, type: 'subscription' },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/supporter?thanks=${tier}`,
    cancel_url: `${appUrl}/supporter`,
  });
  return { url: session.url };
});
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
