/**
 * Pure Stripe price/metadata → supporter tier helpers.
 * Kept dependency-free so Vitest can cover the mapping without Deno edge runtime.
 */

export function resolveTierFromPriceId(
  priceId: unknown,
  priceIdsByTier: Record<string, string[]>
): string | null {
  if (typeof priceId !== 'string') return null;
  for (const [tier, priceIds] of Object.entries(priceIdsByTier)) {
    if (priceIds.includes(priceId)) return tier;
  }
  return null;
}

// deno-lint-ignore no-explicit-any
export function resolveSubscriptionTier(
  subscription: any,
  fallbackTier: string,
  priceIdsByTier: Record<string, string[]>
): string {
  const priceId = subscription?.items?.data?.[0]?.price?.id;
  const metadataTier = subscription?.metadata?.tier;
  return (
    resolveTierFromPriceId(priceId, priceIdsByTier) ||
    (typeof metadataTier === 'string' && metadataTier ? metadataTier : fallbackTier)
  );
}
