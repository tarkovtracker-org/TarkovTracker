import { describe, expect, it } from 'vitest';
import { oneTimePaymentDate } from './stripeOneTime.ts';
describe('oneTimePaymentDate', () => {
  it('uses the successful event timestamp without a processing-time fallback', () => {
    expect(oneTimePaymentDate(1791331200)).toBe('2026-10-07T00:00:00.000Z');
  });
  it.each([undefined, NaN, Infinity, 0, -1])('rejects missing or invalid time: %s', (value) => {
    expect(() => oneTimePaymentDate(value as number)).toThrow();
  });
});
