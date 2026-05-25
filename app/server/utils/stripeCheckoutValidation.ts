import { createError } from 'h3';
export const VALID_TIERS = ['supporter', 'scav', 'timmy', 'chad'] as const;
export const VALID_INTERVALS = ['monthly', '6month', 'yearly'] as const;
export const VALID_MODES = ['payment', 'subscription'] as const;
export const MIN_ONE_TIME_CENTS = 300;
export const MAX_ONE_TIME_CENTS = 100_000;
export type CheckoutTier = (typeof VALID_TIERS)[number];
export type CheckoutInterval = (typeof VALID_INTERVALS)[number];
export type CheckoutMode = (typeof VALID_MODES)[number];
export type CheckoutBody = {
  mode: CheckoutMode;
  tier?: CheckoutTier;
  interval?: CheckoutInterval;
  amount?: number;
};
/**
 * Validate and normalize a Stripe checkout request body. Throws an h3 400 on
 * any invalid field. Mode-specific shape (e.g. amount required for payment,
 * tier+interval required for subscription) is enforced by the caller after
 * resolving config.
 */
export function validateCheckoutBody(raw: unknown): CheckoutBody {
  if (!raw || typeof raw !== 'object') {
    throw createError({ statusCode: 400, message: 'Invalid request body' });
  }
  const body = raw as Record<string, unknown>;
  const mode = body.mode;
  if (typeof mode !== 'string' || !VALID_MODES.includes(mode as CheckoutMode)) {
    throw createError({ statusCode: 400, message: 'Invalid mode' });
  }
  const result: CheckoutBody = { mode: mode as CheckoutMode };
  if (body.tier !== undefined) {
    if (typeof body.tier !== 'string' || !VALID_TIERS.includes(body.tier as CheckoutTier)) {
      throw createError({ statusCode: 400, message: 'Invalid tier' });
    }
    result.tier = body.tier as CheckoutTier;
  }
  if (body.interval !== undefined) {
    if (
      typeof body.interval !== 'string' ||
      !VALID_INTERVALS.includes(body.interval as CheckoutInterval)
    ) {
      throw createError({ statusCode: 400, message: 'Invalid interval' });
    }
    result.interval = body.interval as CheckoutInterval;
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
/**
 * Validate the dollar amount for a one-time payment. Returns rounded cents.
 * Throws an h3 400 if the amount is outside the allowed band.
 */
export function validateOneTimeAmount(amount: number | undefined): number {
  if (amount === undefined) {
    throw createError({
      statusCode: 400,
      message: 'Amount is required for one-time payments',
    });
  }
  const amountFloat = Number(amount);
  if (!Number.isFinite(amountFloat)) {
    throw createError({ statusCode: 400, message: 'Invalid amount' });
  }
  const amountCents = Math.round(amountFloat * 100);
  if (amountCents < MIN_ONE_TIME_CENTS) {
    throw createError({
      statusCode: 400,
      message: `Minimum amount is $${MIN_ONE_TIME_CENTS / 100}`,
    });
  }
  if (amountCents > MAX_ONE_TIME_CENTS) {
    throw createError({
      statusCode: 400,
      message: `Maximum amount is $${MAX_ONE_TIME_CENTS / 100}`,
    });
  }
  return amountCents;
}
