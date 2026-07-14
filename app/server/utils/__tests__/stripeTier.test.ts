import { describe, expect, it } from 'vitest';
import {
  resolveSubscriptionTier,
  resolveTierFromPriceId,
} from '../../../../supabase/functions/_shared/stripeTier';
const PRICE_IDS: Record<string, string[]> = {
  scav: ['price_scav_monthly', 'price_scav_yearly'],
  timmy: ['price_timmy_monthly'],
  chad: ['price_chad_monthly', 'price_chad_6month', 'price_chad_yearly'],
};
describe('resolveTierFromPriceId', () => {
  it('maps known Stripe price IDs to supporter tiers', () => {
    expect(resolveTierFromPriceId('price_scav_monthly', PRICE_IDS)).toBe('scav');
    expect(resolveTierFromPriceId('price_timmy_monthly', PRICE_IDS)).toBe('timmy');
    expect(resolveTierFromPriceId('price_chad_yearly', PRICE_IDS)).toBe('chad');
  });
  it('returns null for unknown or non-string price IDs', () => {
    expect(resolveTierFromPriceId('price_unknown', PRICE_IDS)).toBeNull();
    expect(resolveTierFromPriceId(null, PRICE_IDS)).toBeNull();
    expect(resolveTierFromPriceId(undefined, PRICE_IDS)).toBeNull();
  });
});
describe('resolveSubscriptionTier', () => {
  it('prefers the Stripe price ID over subscription metadata', () => {
    const subscription = {
      items: { data: [{ price: { id: 'price_chad_monthly' } }] },
      metadata: { tier: 'scav' },
    };
    expect(resolveSubscriptionTier(subscription, 'timmy', PRICE_IDS)).toBe('chad');
  });
  it('falls back to subscription metadata when the price ID is unknown', () => {
    const subscription = {
      items: { data: [{ price: { id: 'price_unknown' } }] },
      metadata: { tier: 'timmy' },
    };
    expect(resolveSubscriptionTier(subscription, 'scav', PRICE_IDS)).toBe('timmy');
  });
  it('falls back to the stored tier when price and metadata are unavailable', () => {
    expect(resolveSubscriptionTier({}, 'scav', PRICE_IDS)).toBe('scav');
    expect(
      resolveSubscriptionTier({ metadata: { tier: '' }, items: { data: [] } }, 'chad', PRICE_IDS)
    ).toBe('chad');
  });
});
