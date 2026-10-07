const CENTS_PER_PERIOD = 400;
const PERIOD_DAYS = 30;
const MAX_PERIODS = 12;
const DAY_MS = 86_400_000;
const EFFECTIVE_MS = Date.parse('2026-10-07T00:00:00.000Z');
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
/** One 30-day period per full $4 contributed, up to twelve periods. */
export function oneTimePeriods(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.min(MAX_PERIODS, Math.floor(amountCents / CENTS_PER_PERIOD));
}
/** Rows and payments from before one-time perks expired keep open-ended access. */
function isGrandfathered(existing: OneTimeSupporter, paidAt: string | null): boolean {
  const paidMs = timestampMs(paidAt);
  if (paidMs !== null && paidMs < EFFECTIVE_MS) return true;
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
    existing?.type === 'one_time' && timestampMs(existing.expires_at) !== null && lastMs === paidMs
  );
}
function remainingExpiryMs(existing: OneTimeSupporter, paidMs: number): number {
  if (existing?.type !== 'one_time' || existing.status !== 'active') return paidMs;
  return Math.max(paidMs, timestampMs(existing.expires_at) ?? paidMs);
}
export function oneTimeExpiresAt(
  existing: OneTimeSupporter,
  amountCents: number,
  paidAt: string | null,
  now: Date
): string | null {
  if (isGrandfathered(existing, paidAt)) return null;
  if (isAlreadyApplied(existing, paidAt)) return existing!.expires_at as string;
  const startMs = remainingExpiryMs(existing, timestampMs(paidAt) ?? now.getTime());
  return new Date(startMs + oneTimePeriods(amountCents) * PERIOD_DAYS * DAY_MS).toISOString();
}
