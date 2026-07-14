/**
 * Imports TarkovTracker Stripe products + prices into test mode.
 * Usage: STRIPE_TEST_KEY=sk_test_... node scripts/stripe-import-test.mjs
 *
 * Outputs a .env snippet with the generated price IDs at the end.
 */

import Stripe from 'stripe';

const TEST_KEY = process.env.STRIPE_TEST_KEY;
if (!TEST_KEY || !TEST_KEY.startsWith('sk_test_')) {
  console.error('Set STRIPE_TEST_KEY=sk_test_... before running.');
  process.exit(1);
}

const stripe = new Stripe(TEST_KEY);

// ── Pricing logic (mirrors supporterPricing.ts) ──────────────────────────────

const STRIPE_SUB_RATE = 0.029 + 0.007;
const STRIPE_FIXED = 0.3;

function passThrough(base, rate, fixed) {
  return Math.ceil(((base + fixed) / (1 - rate)) * 100) / 100;
}

function calcSubscriptionCharge(baseMonthly, interval) {
  const months = { monthly: 1, '6month': 6, yearly: 12 }[interval];
  const discount = { monthly: 0, '6month': 0.1, yearly: 0.2 }[interval];
  const periodBase = baseMonthly * (1 - discount) * months;
  return passThrough(periodBase, STRIPE_SUB_RATE, STRIPE_FIXED);
}

// ── Config ────────────────────────────────────────────────────────────────────

const PRODUCT_CSV = {
  id: 'prod_UZCzdayOHdcWjh',
  name: 'TarkovTracker Supporter',
  description: 'TarkovTracker supporter subscription tiers.',
};

const TIERS = [
  { id: 'scav', baseMonthly: 3 },
  { id: 'timmy', baseMonthly: 7 },
  { id: 'chad', baseMonthly: 15 },
];

const INTERVALS = ['monthly', '6month', 'yearly'];

const STRIPE_INTERVAL = {
  monthly: { interval: 'month', interval_count: 1 },
  '6month': { interval: 'month', interval_count: 6 },
  yearly: { interval: 'year', interval_count: 1 },
};

// ── Import ────────────────────────────────────────────────────────────────────

console.log('Creating product…');
let product;
try {
  product = await stripe.products.create({
    name: PRODUCT_CSV.name,
    description: PRODUCT_CSV.description,
    metadata: { source_prod_id: PRODUCT_CSV.id },
  });
} catch (err) {
  console.error(`  ✗ Failed to create product (source ${PRODUCT_CSV.id}):`, err);
  process.exit(1);
}
console.log(`  ✓ ${product.name} → ${product.id}`);

const envLines = [`STRIPE_PRODUCT_ID=${product.id}`];

console.log('\nCreating prices…');
let failed = 0;
for (const tier of TIERS) {
  for (const interval of INTERVALS) {
    const amountDollars = calcSubscriptionCharge(tier.baseMonthly, interval);
    const amountCents = Math.round(amountDollars * 100);
    const { interval: stripeInterval, interval_count } = STRIPE_INTERVAL[interval];

    let price;
    try {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: amountCents,
        currency: 'usd',
        recurring: { interval: stripeInterval, interval_count },
        nickname: `${tier.id} ${interval}`,
        metadata: { tier: tier.id, interval },
      });
    } catch (err) {
      failed += 1;
      console.error(
        `  ✗ ${tier.id} ${interval.padEnd(7)} (product ${product.id}) failed:`,
        err
      );
      continue;
    }

    const normalizedKey =
      interval === '6month'
        ? `STRIPE_PRICE_${tier.id.toUpperCase()}_6MONTH`
        : `STRIPE_PRICE_${tier.id.toUpperCase()}_${interval.toUpperCase()}`;

    envLines.push(`${normalizedKey}=${price.id}`);
    console.log(`  ✓ ${tier.id} ${interval.padEnd(7)} $${amountDollars.toFixed(2)} → ${price.id}`);
  }
}

console.log('\n── .env snippet (' + 'copy into your .env.test or local .env) ──────────────');
console.log(envLines.join('\n'));
console.log('────────────────────────────────────────────────────────────────────');

if (failed > 0) {
  console.error(`\n${failed} price(s) failed to create. See errors above.`);
  process.exit(1);
}
