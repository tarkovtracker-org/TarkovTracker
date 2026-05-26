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
  if (supporter.status === 'active') return true;
  if (supporter.status !== 'past_due' || !supporter.expiresAt) return false;
  const expiresAtMs = Date.parse(supporter.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
}
