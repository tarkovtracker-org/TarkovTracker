const CENTS_PER_PERIOD = 300;
const PERIOD_DAYS = 30;
const MAX_PERIODS = 12;
const DAY_MS = 86_400_000;
export type OneTimeSupporter = {
  type?: unknown;
  status?: unknown;
  expires_at?: unknown;
  last_contribution_at?: unknown;
} | null;
function timestampMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
/** One 30-day period per $3 contributed, from one period up to a year. */
export function oneTimePeriods(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.min(MAX_PERIODS, Math.max(1, Math.floor(amountCents / CENTS_PER_PERIOD)));
}
/** Rows granted before one-time perks expired keep their open-ended access. */
function isGrandfathered(existing: OneTimeSupporter): boolean {
  return (
    existing?.type === 'one_time' && existing.status === 'active' && existing.expires_at == null
  );
}
/** A replayed payment must not stack its period twice. */
function isAlreadyApplied(existing: OneTimeSupporter, paidAt: string | null): boolean {
  const lastMs = timestampMs(existing?.last_contribution_at);
  const paidMs = timestampMs(paidAt);
  if (lastMs === null || paidMs === null) return false;
  return (
    existing?.type === 'one_time' && timestampMs(existing.expires_at) !== null && lastMs >= paidMs
  );
}
function remainingExpiryMs(existing: OneTimeSupporter, nowMs: number): number {
  if (existing?.type !== 'one_time' || existing.status !== 'active') return nowMs;
  return Math.max(nowMs, timestampMs(existing.expires_at) ?? nowMs);
}
export function oneTimeExpiresAt(
  existing: OneTimeSupporter,
  amountCents: number,
  paidAt: string | null,
  now: Date
): string | null {
  if (isGrandfathered(existing)) return null;
  if (isAlreadyApplied(existing, paidAt)) return existing!.expires_at as string;
  const startMs = remainingExpiryMs(existing, now.getTime());
  return new Date(startMs + oneTimePeriods(amountCents) * PERIOD_DAYS * DAY_MS).toISOString();
}
