import type { BillingInterval, SupporterTier } from '@/features/supporter/supporterTypes';
export const TIERS: SupporterTier[] = [
  { id: 'scav', baseMonthly: 3 },
  { id: 'timmy', baseMonthly: 7, featured: true },
  { id: 'chad', baseMonthly: 15 },
];
const INTERVAL_MONTHS: Record<BillingInterval, number> = {
  monthly: 1,
  '6month': 6,
  yearly: 12,
};
const INTERVAL_DISCOUNT: Record<BillingInterval, number> = {
  monthly: 0,
  '6month': 0.1,
  yearly: 0.2,
};
const STRIPE_SUB_RATE = 0.029 + 0.007;
export const STRIPE_FIXED = 0.3;
export const STRIPE_ONETIME_RATE = 0.029;
function passThrough(base: number, rate: number, fixed: number): number {
  return Math.ceil(((base + fixed) / (1 - rate)) * 100) / 100;
}
export function calcSubscriptionCharge(baseMonthly: number, interval: BillingInterval): number {
  const months = INTERVAL_MONTHS[interval];
  const discount = INTERVAL_DISCOUNT[interval];
  const discountedMonthly = baseMonthly * (1 - discount);
  const periodBase = discountedMonthly * months;
  return passThrough(periodBase, STRIPE_SUB_RATE, STRIPE_FIXED);
}
export function calcOneTimeCharge(base: number): number {
  return passThrough(base, STRIPE_ONETIME_RATE, STRIPE_FIXED);
}
export function discountPercent(interval: BillingInterval): number {
  return Math.round(INTERVAL_DISCOUNT[interval] * 100);
}
export function calcBaseMonthly(baseMonthly: number, interval: BillingInterval): number {
  return baseMonthly * (1 - INTERVAL_DISCOUNT[interval]);
}
export function calcIntervalMonths(interval: BillingInterval): number {
  return INTERVAL_MONTHS[interval];
}
