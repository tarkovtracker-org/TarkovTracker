import { getStripeReferenceId } from './stripeBilling.ts';
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
type StripeGraceSupporter = {
  type?: unknown;
  status?: unknown;
  has_ever_supported?: unknown;
  retention_history_verified?: unknown;
  stripe_subscription_id?: unknown;
  expires_at?: unknown;
};
function isPaidStripeSubscriptionEpisode(
  supporter: StripeGraceSupporter | null,
  subscriptionId: string
): boolean {
  return (
    supporter?.type === 'subscription' &&
    supporter.stripe_subscription_id === subscriptionId &&
    supporter.has_ever_supported === true
  );
}
/** Generic customer history cannot establish grace for a different unpaid subscription. */
export function hasPaidStripeSubscriptionEpisode(
  supporter: StripeGraceSupporter | null,
  subscriptionId: string,
  now: Date,
  graceDays: number
): boolean {
  if (!isPaidStripeSubscriptionEpisode(supporter, subscriptionId)) return false;
  if (supporter?.status === 'expired') {
    return existingGraceDate(supporter.expires_at, now, graceDays) !== null;
  }
  return ['active', 'past_due'].includes(String(supporter?.status));
}
/** Preserve the stored grace deadline; a failed latest renewal does not reverse earlier access. */
export function isPreservedStripeSubscriptionGrace(
  supporter: StripeGraceSupporter | null,
  subscription: { id: string; status?: unknown },
  now: Date,
  graceDays: number
): boolean {
  if (!hasPaidStripeSubscriptionEpisode(supporter, subscription.id, now, graceDays)) return false;
  if (supporter?.status !== 'past_due') return false;
  if (subscription.status !== 'past_due') return false;
  return hasVerifiedFutureStripeGrace(supporter, now, graceDays);
}
function hasVerifiedFutureStripeGrace(
  supporter: StripeGraceSupporter,
  now: Date,
  graceDays: number
): boolean {
  if (supporter.retention_history_verified !== true) return false;
  const deadline = existingGraceDate(supporter.expires_at, now, graceDays);
  return deadline !== null && deadline > now.toISOString();
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
/** Grant only from the specific payment being fulfilled, independently of historical support. */
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
/** A lost expiration fence retries only while the same subscription still owns the row. */
export async function confirmSubscriptionExpiration(
  updated: boolean,
  lookup: () => Promise<{ stripe_subscription_id?: unknown } | null>,
  subscriptionId: string
): Promise<boolean> {
  if (updated) return true;
  const latest = await lookup();
  if (latest?.stripe_subscription_id === subscriptionId) {
    throw new Error('Subscription expiration lost its update fence; will retry');
  }
  return false;
}
export type StripeEvidenceLookup = <T>(path: string) => Promise<T | null>;
type StripeInvoiceEvidence = {
  id?: string;
  amount_paid?: number;
  charge?: unknown;
  payment_intent?: unknown;
};
type StripeInvoicePayment = {
  id: string;
  invoice?: unknown;
  status?: string;
  payment?: { type?: string; payment_intent?: unknown; charge?: unknown };
};
type StripeInvoicePaymentPage = { data: StripeInvoicePayment[]; has_more: boolean };
/** Missing charge evidence is retryable; a known full reversal cannot grant access. */
function stripeChargePaymentCount(
  charge: Parameters<typeof isRetainedStripeContribution>[0],
  chargeId: string
): number | null {
  if (charge.id !== chargeId) return null;
  if (isReversedStripeCharge(charge)) return 0;
  if (charge.status === 'failed') return 0;
  return completeStripeChargePaymentCount(charge);
}
function isReversedStripeCharge(
  charge: Parameters<typeof isRetainedStripeContribution>[0]
): boolean {
  return charge.disputed === true || charge.refunded === true;
}
function completeStripeChargePaymentCount(
  charge: Parameters<typeof isRetainedStripeContribution>[0]
): number | null {
  if (!hasCompleteStripeChargeStatus(charge)) return null;
  if (!isFiniteNumber(charge.amount) || !isFiniteNumber(charge.amount_refunded)) return null;
  return isRetainedStripeContribution(charge, '') ? 1 : 0;
}
function hasCompleteStripeChargeStatus(
  charge: Parameters<typeof isRetainedStripeContribution>[0]
): boolean {
  return charge.status === 'succeeded' && charge.disputed === false && charge.refunded === false;
}
async function directStripeChargePaymentCount(
  chargeId: string | null,
  lookup: StripeEvidenceLookup
): Promise<number | null> {
  if (!chargeId) return null;
  const charge = await lookup<Parameters<typeof isRetainedStripeContribution>[0]>(
    `/charges/${encodeURIComponent(chargeId)}`
  );
  return charge ? stripeChargePaymentCount(charge, chargeId) : null;
}
export async function stripePaymentIntentPaymentCount(
  reference: unknown,
  lookup: StripeEvidenceLookup
): Promise<number | null> {
  const intentId = getStripeReferenceId(reference);
  if (!intentId) return null;
  const intent = await lookup<{ latest_charge?: unknown }>(
    `/payment_intents/${encodeURIComponent(intentId)}`
  );
  return await directStripeChargePaymentCount(getStripeReferenceId(intent?.latest_charge), lookup);
}
/** Retrieve the invoice afresh; the webhook's paid snapshot predates any reversal. */
export async function stripeInvoicePaymentCount(
  reference: unknown,
  lookup: StripeEvidenceLookup
): Promise<number | null> {
  const invoiceId = getStripeReferenceId(reference);
  if (!invoiceId) return null;
  const invoice = await lookup<StripeInvoiceEvidence>(`/invoices/${encodeURIComponent(invoiceId)}`);
  if (!invoice || invoice.id !== invoiceId) return null;
  if (!isFiniteNumber(invoice.amount_paid)) return null;
  if (invoice.amount_paid <= 0) return 0;
  return await stripeInvoiceChargePaymentCount(invoice, lookup);
}
async function stripeInvoiceChargePaymentCount(
  invoice: StripeInvoiceEvidence,
  lookup: StripeEvidenceLookup
): Promise<number | null> {
  const chargeId = getStripeReferenceId(invoice.charge);
  if (chargeId) return await directStripeChargePaymentCount(chargeId, lookup);
  if (getStripeReferenceId(invoice.payment_intent)) {
    return await stripePaymentIntentPaymentCount(invoice.payment_intent, lookup);
  }
  return await stripeInvoicePaymentPages(invoice.id!, lookup, 5);
}
async function stripeInvoicePaymentCountForEntry(
  entry: StripeInvoicePayment,
  invoiceId: string,
  lookup: StripeEvidenceLookup
): Promise<number | null> {
  if (entry.status !== 'paid' || getStripeReferenceId(entry.invoice) !== invoiceId) return null;
  if (entry.payment?.type === 'payment_intent') {
    return await stripePaymentIntentPaymentCount(entry.payment.payment_intent, lookup);
  }
  if (entry.payment?.type === 'charge') {
    return await directStripeChargePaymentCount(getStripeReferenceId(entry.payment.charge), lookup);
  }
  return null;
}
async function stripeInvoicePagePaymentCount(
  entries: StripeInvoicePayment[],
  invoiceId: string,
  lookup: StripeEvidenceLookup
): Promise<number | null> {
  let count = 0;
  for (const entry of entries) {
    const valid = await stripeInvoicePaymentCountForEntry(entry, invoiceId, lookup);
    if (valid === null) return null;
    count += valid;
  }
  return count;
}
async function stripeInvoicePaymentPages(
  invoiceId: string,
  lookup: StripeEvidenceLookup,
  pagesLeft: number,
  startingAfter?: string
): Promise<number | null> {
  const params = new URLSearchParams({ invoice: invoiceId, status: 'paid', limit: '100' });
  if (startingAfter) params.set('starting_after', startingAfter);
  const page = await lookup<StripeInvoicePaymentPage>(`/invoice_payments?${params.toString()}`);
  if (!page || !isCompleteStripeInvoicePaymentPage(page)) return null;
  return await completeStripeInvoicePage(page, invoiceId, lookup, pagesLeft);
}
function isCompleteStripeInvoicePaymentPage(page: StripeInvoicePaymentPage): boolean {
  return Array.isArray(page.data) && typeof page.has_more === 'boolean' && page.data.length > 0;
}
async function completeStripeInvoicePage(
  page: StripeInvoicePaymentPage,
  invoiceId: string,
  lookup: StripeEvidenceLookup,
  pagesLeft: number
): Promise<number | null> {
  const count = await stripeInvoicePagePaymentCount(page.data, invoiceId, lookup);
  if (count === null) return null;
  if (!page.has_more) return count;
  return await remainingStripeInvoicePaymentCount(page, invoiceId, lookup, pagesLeft, count);
}
async function remainingStripeInvoicePaymentCount(
  page: StripeInvoicePaymentPage,
  invoiceId: string,
  lookup: StripeEvidenceLookup,
  pagesLeft: number,
  count: number
): Promise<number | null> {
  if (pagesLeft <= 1) return null;
  const remaining = await stripeInvoicePaymentPages(
    invoiceId,
    lookup,
    pagesLeft - 1,
    page.data[page.data.length - 1].id
  );
  return remaining === null ? null : count + remaining;
}
export async function stripeCheckoutPaymentCount(
  session: { id?: string; mode?: string; invoice?: unknown; payment_intent?: unknown },
  lookup: StripeEvidenceLookup
): Promise<number | null> {
  if (session.mode === 'payment') {
    return await stripePaymentIntentPaymentCount(session.payment_intent, lookup);
  }
  if (session.mode !== 'subscription') return null;
  return await stripeCheckoutInvoicePaymentCount(session, lookup);
}
async function stripeCheckoutInvoicePaymentCount(
  session: { id?: string; invoice?: unknown },
  lookup: StripeEvidenceLookup
): Promise<number | null> {
  if (getStripeReferenceId(session.invoice)) {
    return await stripeInvoicePaymentCount(session.invoice, lookup);
  }
  if (!session.id) return null;
  const latest = await lookup<{ id?: string; invoice?: unknown }>(
    `/checkout/sessions/${encodeURIComponent(session.id)}`
  );
  if (latest?.id !== session.id) return null;
  return await stripeInvoicePaymentCount(latest.invoice, lookup);
}
/** A grant concurrent with durable chargeback denial must finish by removing the roles. */
export async function withFreshStripeRoleGrant(
  lookup: () => Promise<{
    supporter_disqualified_at?: unknown;
    has_ever_supported?: unknown;
  } | null>,
  grant: () => Promise<void>,
  revoke: () => Promise<void>
): Promise<void> {
  if (isStripeRoleGrantDenied(await lookup())) {
    await revoke();
    return;
  }
  await grant();
  if (isStripeRoleGrantDenied(await lookup())) await revoke();
}
function isStripeRoleGrantDenied(
  supporter: { supporter_disqualified_at?: unknown; has_ever_supported?: unknown } | null
): boolean {
  return (
    supporter === null ||
    supporter.has_ever_supported === false ||
    isSupporterDisqualified(supporter)
  );
}
