import { describe, expect, it } from 'vitest';
import {
  getTierPriceConfig,
  resolveSubscriptionTier,
  resolveTierFromPriceId,
  TIER_PRICE_ENV_NAMES,
} from './stripeTier.ts';

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

  it('uses the fallback tier when the subscription is not an object', () => {
    expect(resolveSubscriptionTier(null, 'scav', PRICE_IDS)).toBe('scav');
  });
});

describe('getTierPriceConfig', () => {
  it('loads every configured tier price ID', () => {
    const environment = Object.fromEntries(
      Object.values(TIER_PRICE_ENV_NAMES)
        .flat()
        .map((name) => [name, `price_${name.toLowerCase()}`])
    );
    const config = getTierPriceConfig((name) => environment[name]);
    expect(config.missing).toEqual([]);
    expect(config.priceIdsByTier.scav).toHaveLength(3);
    expect(config.priceIdsByTier.timmy).toHaveLength(3);
    expect(config.priceIdsByTier.chad).toHaveLength(3);
  });

  it('reports unset and blank tier price variables', () => {
    const config = getTierPriceConfig((name) =>
      name === 'STRIPE_PRICE_TIMMY_6MONTH' ? ' ' : undefined
    );
    expect(config.missing).toContain('STRIPE_PRICE_TIMMY_6MONTH');
    expect(config.missing).toContain('STRIPE_PRICE_SCAV_MONTHLY');
    expect(Object.values(config.priceIdsByTier).flat()).not.toContain('');
    expect(resolveTierFromPriceId('', config.priceIdsByTier)).toBeNull();
  });
});
