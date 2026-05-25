import { describe, expect, it } from 'vitest';
import {
  MAX_ONE_TIME_CENTS,
  MIN_ONE_TIME_CENTS,
  validateCheckoutBody,
  validateOneTimeAmount,
} from '@/server/utils/stripeCheckoutValidation';
function expectH3Error(fn: () => void, statusCode: number) {
  try {
    fn();
    throw new Error('Expected validator to throw');
  } catch (err) {
    expect((err as { statusCode?: number }).statusCode).toBe(statusCode);
  }
}
describe('validateCheckoutBody', () => {
  it('rejects non-object payloads', () => {
    expectH3Error(() => validateCheckoutBody(null), 400);
    expectH3Error(() => validateCheckoutBody('payment'), 400);
    expectH3Error(() => validateCheckoutBody(42), 400);
  });
  it('rejects unknown modes', () => {
    expectH3Error(() => validateCheckoutBody({ mode: 'gift' }), 400);
  });
  it('accepts payment mode without other fields', () => {
    const result = validateCheckoutBody({ mode: 'payment' });
    expect(result.mode).toBe('payment');
    expect(result.tier).toBeUndefined();
  });
  it('rejects unknown tiers', () => {
    expectH3Error(() => validateCheckoutBody({ mode: 'subscription', tier: 'whale' }), 400);
  });
  it('rejects unknown intervals', () => {
    expectH3Error(
      () => validateCheckoutBody({ mode: 'subscription', tier: 'timmy', interval: 'weekly' }),
      400
    );
  });
  it('rejects non-positive amounts', () => {
    expectH3Error(() => validateCheckoutBody({ mode: 'payment', amount: 0 }), 400);
    expectH3Error(() => validateCheckoutBody({ mode: 'payment', amount: -5 }), 400);
    expectH3Error(() => validateCheckoutBody({ mode: 'payment', amount: 'abc' }), 400);
  });
  it('returns the canonical body shape', () => {
    expect(
      validateCheckoutBody({
        mode: 'subscription',
        tier: 'chad',
        interval: 'yearly',
      })
    ).toEqual({ mode: 'subscription', tier: 'chad', interval: 'yearly' });
  });
});
describe('validateOneTimeAmount', () => {
  it('rejects undefined', () => {
    expectH3Error(() => validateOneTimeAmount(undefined), 400);
  });
  it('rejects amounts below the minimum', () => {
    const minDollars = MIN_ONE_TIME_CENTS / 100;
    expectH3Error(() => validateOneTimeAmount(minDollars - 0.01), 400);
  });
  it('rejects amounts above the maximum to limit fraud blast radius', () => {
    const maxDollars = MAX_ONE_TIME_CENTS / 100;
    expectH3Error(() => validateOneTimeAmount(maxDollars + 1), 400);
  });
  it('rejects non-finite values', () => {
    expectH3Error(() => validateOneTimeAmount(Number.POSITIVE_INFINITY), 400);
    expectH3Error(() => validateOneTimeAmount(Number.NaN), 400);
  });
  it('returns rounded cents inside the allowed band', () => {
    expect(validateOneTimeAmount(MIN_ONE_TIME_CENTS / 100)).toBe(MIN_ONE_TIME_CENTS);
    expect(validateOneTimeAmount(MAX_ONE_TIME_CENTS / 100)).toBe(MAX_ONE_TIME_CENTS);
    expect(validateOneTimeAmount(7.005)).toBe(701);
  });
});
