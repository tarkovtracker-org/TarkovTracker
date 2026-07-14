import { describe, expect, it } from 'vitest';
import { resolveSubscriptionTier, resolveTierFromPriceId } from './stripeTier.ts';

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

  it('returns null for unknown price IDs, values, or tier names', () => {
    expect(resolveTierFromPriceId('price_unknown', PRICE_IDS)).toBeNull();
    expect(resolveTierFromPriceId(null, PRICE_IDS)).toBeNull();
    expect(resolveTierFromPriceId('price_admin', { admin: ['price_admin'] })).toBeNull();
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

  it('falls back to valid subscription metadata when the price ID is unknown', () => {
    const subscription = {
      items: { data: [{ price: { id: 'price_unknown' } }] },
      metadata: { tier: 'timmy' },
    };
    expect(resolveSubscriptionTier(subscription, 'scav', PRICE_IDS)).toBe('timmy');
  });

  it('ignores arbitrary metadata and uses a valid stored tier', () => {
    const subscription = { metadata: { tier: 'administrator' }, items: { data: [] } };
    expect(resolveSubscriptionTier(subscription, 'scav', PRICE_IDS)).toBe('scav');
  });

  it('uses supporter when no valid tier source is available', () => {
    expect(resolveSubscriptionTier({}, 'invalid', PRICE_IDS)).toBe('supporter');
  });
});
