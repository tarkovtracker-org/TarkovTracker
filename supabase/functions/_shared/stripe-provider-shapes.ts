import { ProviderFailure } from './provider-http.ts';
function chargeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new ProviderFailure('stripe_invalid_charge', true);
  return value as Record<string, unknown>;
}
function referenceString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new ProviderFailure('stripe_invalid_reference', true);
  return value;
}
export function stripeReference(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return referenceString(value);
  return referenceString(chargeRecord(value).id);
}
export function chargeCustomer(value: unknown, expectedId: string): string | null {
  const charge = chargeRecord(value);
  if (charge.id !== expectedId || !('customer' in charge))
    throw new ProviderFailure('stripe_invalid_charge', true);
  return stripeReference(charge.customer);
}
function validateRefundEvidence(charge: Record<string, unknown>): void {
  if (typeof charge.disputed !== 'boolean')
    throw new ProviderFailure('stripe_invalid_charge', true);
  if (typeof charge.amount_refunded !== 'number')
    throw new ProviderFailure('stripe_invalid_charge', true);
}
export function paymentCanActivate(value: unknown): boolean {
  const charge = chargeRecord(value);
  validateRefundEvidence(charge);
  return !charge.disputed && charge.amount_refunded === 0;
}
