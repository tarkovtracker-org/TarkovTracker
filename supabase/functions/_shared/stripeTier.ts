/**
 * Pure Stripe price/metadata → supporter tier helpers.
 * Kept dependency-free so Vitest can cover the mapping without Deno edge runtime.
 */

export const SUPPORTER_TIERS = ['supporter', 'scav', 'timmy', 'chad'] as const;
export type SupporterTier = (typeof SUPPORTER_TIERS)[number];

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

// deno-lint-ignore no-explicit-any
export function resolveSubscriptionTier(
  subscription: any,
  fallbackTier: unknown,
  priceIdsByTier: Record<string, string[]>
): SupporterTier {
  const priceId = subscription?.items?.data?.[0]?.price?.id;
  const metadataTier = subscription?.metadata?.tier;
  return (
    resolveTierFromPriceId(priceId, priceIdsByTier) ||
    (isSupporterTier(metadataTier) ? metadataTier : null) ||
    (isSupporterTier(fallbackTier) ? fallbackTier : 'supporter')
  );
}
