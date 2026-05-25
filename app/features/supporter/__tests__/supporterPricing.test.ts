import { describe, expect, it } from 'vitest';
import {
  calcBaseMonthly,
  calcIntervalMonths,
  calcOneTimeCharge,
  calcSubscriptionCharge,
  discountPercent,
  STRIPE_FIXED,
  STRIPE_ONETIME_RATE,
  TIERS,
} from '@/features/supporter/supporterPricing';
describe('supporterPricing', () => {
  describe('TIERS', () => {
    it('exposes the three subscription tiers in display order', () => {
      expect(TIERS.map((t) => t.id)).toEqual(['scav', 'timmy', 'chad']);
    });
    it('flags timmy as the featured tier', () => {
      expect(TIERS.find((t) => t.id === 'timmy')?.featured).toBe(true);
    });
  });
  describe('discountPercent', () => {
    it('returns the integer percent for each interval', () => {
      expect(discountPercent('monthly')).toBe(0);
      expect(discountPercent('6month')).toBe(10);
      expect(discountPercent('yearly')).toBe(20);
    });
  });
  describe('calcIntervalMonths', () => {
    it('maps interval ids to their month counts', () => {
      expect(calcIntervalMonths('monthly')).toBe(1);
      expect(calcIntervalMonths('6month')).toBe(6);
      expect(calcIntervalMonths('yearly')).toBe(12);
    });
  });
  describe('calcBaseMonthly', () => {
    it('returns the base price for monthly billing', () => {
      expect(calcBaseMonthly(7, 'monthly')).toBe(7);
    });
    it('applies the 6-month discount', () => {
      expect(calcBaseMonthly(10, '6month')).toBeCloseTo(9, 5);
    });
    it('applies the yearly discount', () => {
      expect(calcBaseMonthly(10, 'yearly')).toBeCloseTo(8, 5);
    });
  });
  describe('calcSubscriptionCharge', () => {
    it('rounds up to the next cent so we never undercharge fees', () => {
      const charge = calcSubscriptionCharge(7, 'monthly');
      expect(charge).toBeGreaterThan(7);
      expect(Math.round(charge * 100)).toBe(charge * 100);
    });
    it('produces the same charge for identical inputs', () => {
      expect(calcSubscriptionCharge(3, 'monthly')).toEqual(calcSubscriptionCharge(3, 'monthly'));
    });
    it('charges more for monthly than the per-month rate of yearly', () => {
      const monthly = calcSubscriptionCharge(10, 'monthly');
      const yearly = calcSubscriptionCharge(10, 'yearly');
      expect(yearly / 12).toBeLessThan(monthly);
    });
    it('passes through Stripe fees so net is at least the discounted base', () => {
      const base = 7;
      const charge = calcSubscriptionCharge(base, 'monthly');
      const stripeFee = charge * 0.036 + 0.3;
      expect(charge - stripeFee).toBeGreaterThanOrEqual(base - 0.01);
    });
  });
  describe('calcOneTimeCharge', () => {
    it('rounds up to the next cent', () => {
      const charge = calcOneTimeCharge(5);
      expect(charge).toBeGreaterThan(5);
      expect(Math.round(charge * 100)).toBe(charge * 100);
    });
    it('passes through Stripe fees so net is at least the requested base', () => {
      const base = 5;
      const charge = calcOneTimeCharge(base);
      const stripeFee = charge * STRIPE_ONETIME_RATE + STRIPE_FIXED;
      expect(charge - stripeFee).toBeGreaterThanOrEqual(base - 0.01);
    });
  });
});
