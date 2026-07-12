export type ApiTier = 'free' | 'supporter' | 'scav' | 'timmy' | 'chad';

export interface TierLimits {
  readsPerDay: number;
  writesPerDay: number;
  burstPerMinute: number;
}

/**
 * Tiered API quotas (decision log):
 * Observed free-tier consumers reached ~1.4k requests/day, far above what a
 * single TarkovMonitor + dashboard session needs. Free daily reads are capped
 * at 1,000 (roughly one poll per 90s all day) and writes at 100 (a full quest
 * wipe-to-Kappa run is ~400 task writes spread over weeks, so 100/day covers
 * normal play with batch updates counting as one write). Paid tiers scale
 * roughly 2x/3x/5x so upgrades map to the existing supporter tiers
 * (scav/timmy/chad in public.supporters). Burst limits keep the previous
 * per-minute ceilings but scale by tier and use a sliding window so a
 * TarkovMonitor batch right at a minute boundary is not spuriously throttled.
 * The legacy generic 'supporter' tier maps to scav-level limits.
 */
export const TIER_LIMITS: Record<ApiTier, TierLimits> = {
  free: { readsPerDay: 1000, writesPerDay: 100, burstPerMinute: 30 },
  supporter: { readsPerDay: 2000, writesPerDay: 250, burstPerMinute: 60 },
  scav: { readsPerDay: 2000, writesPerDay: 250, burstPerMinute: 60 },
  timmy: { readsPerDay: 3000, writesPerDay: 400, burstPerMinute: 90 },
  chad: { readsPerDay: 5000, writesPerDay: 600, burstPerMinute: 120 },
};

export const UPGRADE_URL = 'https://tarkovtracker.org/supporter';

export const DAILY_WINDOW_SEC = 86400;
export const BURST_WINDOW_SEC = 60;

export const IP_BACKSTOP_WINDOW_SEC = 3600;
export const IP_BACKSTOP_LIMITS = {
  readsPerHour: 600,
  writesPerHour: 200,
} as const;

export function upgradeMessage(kind: 'read' | 'write'): string {
  return `Daily ${kind} quota exceeded for the free tier. Quotas reset at 00:00 UTC. Upgrade your account for higher limits: ${UPGRADE_URL}`;
}

export function isKnownTier(value: string): value is ApiTier {
  return Object.hasOwn(TIER_LIMITS, value);
}
