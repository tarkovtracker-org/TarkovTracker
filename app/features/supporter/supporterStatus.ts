export type SupporterActivityStatus = 'active' | 'past_due' | 'expired' | 'cancelled';
export interface SupporterActivity {
  status: SupporterActivityStatus;
  expiresAt: string | null;
}
export function isSupporterActivityActive(
  supporter: SupporterActivity | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!supporter) return false;
  if (supporter.status === 'active' && !supporter.expiresAt) return true;
  if (!['active', 'past_due'].includes(supporter.status) || !supporter.expiresAt) return false;
  const expiresAtMs = Date.parse(supporter.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
}
export type BankedSupporterActivity = SupporterActivity & {
  type?: string;
  tier?: string;
  oneTimeTier?: string | null;
  oneTimeRemainingSeconds?: number | null;
};
const hasElapsedExpiry = (expiresAt: string | null, nowMs: number): boolean => {
  const expiry = Date.parse(expiresAt ?? '');
  return Number.isFinite(expiry) && expiry <= nowMs;
};
const hasEndedSubscriptionAccess = (supporter: BankedSupporterActivity, nowMs: number): boolean =>
  supporter.type === 'subscription' &&
  ['active', 'past_due'].includes(supporter.status) &&
  hasElapsedExpiry(supporter.expiresAt, nowMs);
const prepaidExpiry = (supporter: BankedSupporterActivity): string | null => {
  if (supporter.oneTimeRemainingSeconds === null) return null;
  const seconds = supporter.oneTimeRemainingSeconds;
  if (!isPrepaidDuration(seconds)) return '';
  const expiry = Date.parse(supporter.expiresAt!) + seconds * 1000;
  return Number.isFinite(new Date(expiry).getTime()) ? new Date(expiry).toISOString() : '';
};
const isPrepaidDuration = (seconds: unknown): seconds is number =>
  typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
const canResumePrepaid = (supporter: BankedSupporterActivity | null, nowMs: number): boolean => {
  if (!supporter) return false;
  return (
    hasEndedSubscriptionAccess(supporter, nowMs) &&
    ['supporter', 'scav', 'timmy', 'chad'].includes(supporter.oneTimeTier ?? '')
  );
};
const isCurrentCreditExpiry = (expiry: string | null, nowMs: number): boolean =>
  expiry === null || Date.parse(expiry) > nowMs;
/** Mirrors the database entitlement projection while an open page crosses grace expiry. */
export const resolvePrepaidSupporter = <T extends BankedSupporterActivity>(
  supporter: T | null,
  nowMs: number
): T | null => {
  if (!canResumePrepaid(supporter, nowMs)) return supporter;
  const current = supporter!;
  const expiresAt = prepaidExpiry(current);
  return isCurrentCreditExpiry(expiresAt, nowMs)
    ? { ...current, tier: current.oneTimeTier!, type: 'one_time', status: 'active', expiresAt }
    : supporter;
};
