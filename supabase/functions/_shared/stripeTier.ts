/**
 * Pure Stripe price/metadata → supporter tier helpers.
 * Kept dependency-free so Vitest can cover the mapping without Deno edge runtime.
 */

export const SUPPORTER_TIERS = ['supporter', 'scav', 'timmy', 'chad'] as const;
export type SupporterTier = (typeof SUPPORTER_TIERS)[number];

export const TIER_PRICE_ENV_NAMES = {
  scav: ['STRIPE_PRICE_SCAV_MONTHLY', 'STRIPE_PRICE_SCAV_6MONTH', 'STRIPE_PRICE_SCAV_YEARLY'],
  timmy: ['STRIPE_PRICE_TIMMY_MONTHLY', 'STRIPE_PRICE_TIMMY_6MONTH', 'STRIPE_PRICE_TIMMY_YEARLY'],
  chad: ['STRIPE_PRICE_CHAD_MONTHLY', 'STRIPE_PRICE_CHAD_6MONTH', 'STRIPE_PRICE_CHAD_YEARLY'],
} as const;

type StripeSubscriptionLike = {
  items?: { data?: Array<{ price?: { id?: unknown } }> };
  metadata?: { tier?: unknown };
};

export function isSupporterTier(value: unknown): value is SupporterTier {
  return typeof value === 'string' && SUPPORTER_TIERS.includes(value as SupporterTier);
}

export function resolveTierFromPriceId(
  priceId: unknown,
  priceIdsByTier: Record<string, string[]>
): SupporterTier | null {
  if (typeof priceId !== 'string') return null;
  for (const [tier, priceIds] of Object.entries(priceIdsByTier)) {
    if (priceIds.includes(priceId) && isSupporterTier(tier)) return tier;
  }
  return null;
}

export function getTierPriceConfig(getEnv: (name: string) => string | undefined): {
  missing: string[];
  priceIdsByTier: Record<string, string[]>;
} {
  const missing: string[] = [];
  const priceIdsByTier: Record<string, string[]> = {};
  for (const [tier, envNames] of Object.entries(TIER_PRICE_ENV_NAMES)) {
    priceIdsByTier[tier] = envNames.flatMap((envName) => {
      const value = getEnv(envName)?.trim() ?? '';
      if (!value) {
        missing.push(envName);
        return [];
      }
      return [value];
    });
  }
  return { missing, priceIdsByTier };
}

export function resolveSubscriptionTier(
  subscription: unknown,
  fallbackTier: unknown,
  priceIdsByTier: Record<string, string[]>
): SupporterTier {
  const subscriptionLike =
    typeof subscription === 'object' && subscription !== null
      ? (subscription as StripeSubscriptionLike)
      : null;
  const priceId = subscriptionLike?.items?.data?.[0]?.price?.id;
  const metadataTier = subscriptionLike?.metadata?.tier;
  return (
    resolveTierFromPriceId(priceId, priceIdsByTier) ||
    (isSupporterTier(metadataTier) ? metadataTier : null) ||
    (isSupporterTier(fallbackTier) ? fallbackTier : 'supporter')
  );
}
