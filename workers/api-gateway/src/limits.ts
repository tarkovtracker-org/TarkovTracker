export type ApiTier = 'free' | 'supporter' | 'scav' | 'timmy' | 'chad';
export interface TierLimits {
  readsPerDay: number;
  writesPerDay: number;
}
/**
 * Tiered API quotas (decision log):
 * Observed free-tier consumers reached ~1.4k requests/day, far above what a
 * single TarkovMonitor + dashboard session needs. Free daily reads are capped
 * at 1,000 (roughly one poll per 90s all day) and writes at 100 (a full quest
 * wipe-to-Kappa run is ~400 task writes spread over weeks, so 100/day covers
 * normal play with batch updates counting as one write). Paid tiers scale
 * roughly 2x/3x/5x so upgrades map to the existing supporter tiers
 * (scav/timmy/chad in public.supporters). The legacy generic 'supporter' tier
 * maps to scav-level limits.
 *
 * Per-tier burst ceilings were removed: burst is now a flat infrastructure
 * abuse gate (see ABUSE_GATE_*), not a per-tier entitlement. Supporter
 * differentiation lives entirely in the daily read/write quotas.
 */
export const TIER_LIMITS: Record<ApiTier, TierLimits> = {
  free: { readsPerDay: 1000, writesPerDay: 100 },
  supporter: { readsPerDay: 2000, writesPerDay: 250 },
  scav: { readsPerDay: 2000, writesPerDay: 250 },
  timmy: { readsPerDay: 3000, writesPerDay: 400 },
  chad: { readsPerDay: 5000, writesPerDay: 600 },
};
export const UPGRADE_URL = 'https://tarkovtracker.org/supporter';
export const DAILY_WINDOW_SEC = 86400;
/**
 * Pre-authentication abuse gate, enforced by the native Workers rate limiting
 * binding keyed on CF-Connecting-IP. Deliberately coarse: it exists to shield
 * the api_tokens lookup (and therefore Supabase) from floods, not to meter
 * legitimate users. Counters are per-Cloudflare-location and eventually
 * consistent, so this is never advertised as a customer quota.
 *
 * ABUSE_GATE_PERIOD_SEC must match `period` in the [[ratelimits]] block of
 * wrangler.toml; it is only used here to derive Retry-After.
 */
export const ABUSE_GATE_PERIOD_SEC = 60;
export function upgradeMessage(kind: 'read' | 'write'): string {
  return `Daily ${kind} quota exceeded for the free tier. Quotas reset at 00:00 UTC. Upgrade your account for higher limits: ${UPGRADE_URL}`;
}
export function isKnownTier(value: string): value is ApiTier {
  return Object.hasOwn(TIER_LIMITS, value);
}
