function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
/** Accept only finite, elapsed Stripe timestamps; future dates are not end evidence. */
export function elapsedStripeDate(value: unknown, now: Date): string | null {
  if (!isFiniteNumber(value)) return null;
  const milliseconds = value * 1000;
  if (milliseconds <= 0 || milliseconds > now.getTime()) return null;
  return new Date(milliseconds).toISOString();
}
export function checkoutContributionDate(
  session: { mode?: unknown; payment_status?: unknown; created?: unknown },
  now: Date
): string | null {
  if (session.mode !== 'payment' || session.payment_status !== 'paid') return null;
  return elapsedStripeDate(session.created, now) ?? now.toISOString();
}
export function invoiceContributionDate(
  invoice: { amount_paid?: unknown; status_transitions?: { paid_at?: unknown } },
  now: Date
): string | null {
  if (!isFiniteNumber(invoice.amount_paid) || invoice.amount_paid <= 0) return null;
  return elapsedStripeDate(invoice.status_transitions?.paid_at, now) ?? now.toISOString();
}
function existingGraceDate(value: unknown, now: Date, graceDays: number): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (date.getTime() > now.getTime() + graceDays * 86400000) return null;
  return date.toISOString();
}
export function subscriptionGraceDate(
  supporter: { status?: unknown; expires_at?: unknown; stripe_subscription_id?: unknown } | null,
  subscriptionId: string,
  now: Date,
  graceDays: number
): string {
  const sameEpisode =
    ['past_due', 'expired'].includes(String(supporter?.status)) &&
    supporter?.stripe_subscription_id === subscriptionId;
  const existing = sameEpisode ? existingGraceDate(supporter?.expires_at, now, graceDays) : null;
  return existing ?? new Date(now.getTime() + graceDays * 86400000).toISOString();
}
function laterEndDate(ended: string, grace: string | null): string {
  return grace && grace > ended ? grace : ended;
}
export function subscriptionEndDate(
  subscription: { ended_at?: unknown; current_period_end?: unknown },
  now: Date,
  expiredGrace: string | null = null
): string {
  const grace = existingGraceDate(expiredGrace, now, 0);
  const ended =
    elapsedStripeDate(subscription.ended_at, now) ??
    elapsedStripeDate(subscription.current_period_end, now) ??
    grace ??
    now.toISOString();
  return laterEndDate(ended, grace);
}
export function subscriptionEndEvidence(
  subscription: { ended_at?: unknown; current_period_end?: unknown },
  status: string,
  now: Date,
  expiredGrace: string | null = null
): string | null {
  return status === 'expired' ? subscriptionEndDate(subscription, now, expiredGrace) : null;
}
export function isRetainedStripeContribution(
  charge: {
    id: string;
    status: string;
    disputed?: boolean;
    refunded?: boolean;
    amount?: number;
    amount_refunded?: number;
  },
  excludedChargeId: string
): boolean {
  if (charge.id === excludedChargeId || charge.status !== 'succeeded') return false;
  return isUnreversedContribution(charge);
}
function isUnreversedContribution(charge: {
  disputed?: boolean;
  refunded?: boolean;
  amount?: number;
  amount_refunded?: number;
}): boolean {
  if (charge.disputed !== false || charge.refunded === true) return false;
  return Number(charge.amount) > Number(charge.amount_refunded);
}
/** A delayed paid event can grant access only while current charge history is valid. */
export async function withVerifiedStripeContribution(
  lookup: () => Promise<number | null>,
  apply: () => Promise<void>,
  reject: () => Promise<void>,
  supporter: { supporter_disqualified_at?: unknown } | null = null
): Promise<void> {
  if (isSupporterDisqualified(supporter)) {
    await reject();
    return;
  }
  const count = await lookup();
  if (count === null) throw new Error('Unable to verify current valid Stripe contribution history');
  if (count > 0) await apply();
  else await reject();
}
export function hasVerifiedRevokedHistory(
  supporter: { has_ever_supported?: unknown; retention_history_verified?: unknown } | null
): boolean {
  return supporter?.has_ever_supported === false && supporter.retention_history_verified === true;
}
export function isSupporterDisqualified(
  supporter: { supporter_disqualified_at?: unknown } | null
): boolean {
  return supporter?.supporter_disqualified_at != null;
}
export function supporterDisqualificationDate(
  existing: string | null,
  chargeback: boolean,
  now: Date
): string | null {
  if (!chargeback) return existing;
  return existing ?? now.toISOString();
}
export function supporterRevocationEvidence(fullRevoke: boolean, disqualifiedAt: string | null) {
  const removeHistory = fullRevoke || disqualifiedAt !== null;
  return {
    status: removeHistory ? 'cancelled' : 'expired',
    has_ever_supported: !removeHistory,
    retention_history_verified: true,
    supporter_disqualified_at: disqualifiedAt,
  };
}
/** Stripe metadata was written by authenticated checkout; still validate the database UUID. */
export function getStripeBillingUserId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
