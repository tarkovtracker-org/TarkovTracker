import { ProviderFailure } from './provider-http.ts';
import { stripeReference } from './stripe-provider-shapes.ts';
type StripeRead = (path: string) => Promise<unknown>;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object')
    throw new ProviderFailure('financial_response_invalid', true);
  return value as Record<string, unknown>;
}
function boundedList(value: unknown): Record<string, unknown>[] {
  const row = record(value);
  if (!Array.isArray(row.data) || typeof row.has_more !== 'boolean')
    throw new ProviderFailure('financial_list_invalid', true);
  if (row.has_more) throw new ProviderFailure('financial_history_requires_review', false);
  return row.data.map(record);
}
async function customerFor(resource: string, stripe: StripeRead): Promise<string> {
  if (resource.startsWith('cus_')) return resource;
  const subscription = record(await stripe(`/subscriptions/${encodeURIComponent(resource)}`));
  if (subscription.id !== resource)
    throw new ProviderFailure('subscription_identity_mismatch', false);
  const customer = stripeReference(subscription.customer);
  if (!customer) throw new ProviderFailure('subscription_customer_missing', false);
  return customer;
}
/** Conservative bounded proof. Large histories and financial ambiguity require operator review. */
export async function verifyStripeFinancialState(
  resource: string,
  stripe: StripeRead
): Promise<void> {
  const customer = encodeURIComponent(await customerFor(resource, stripe));
  const invoices = boundedList(await stripe(`/invoices?customer=${customer}&limit=100`));
  if (invoices.some((invoice) => !['paid', 'void'].includes(String(invoice.status))))
    throw new ProviderFailure('invoice_requires_review', false);
  const charges = boundedList(await stripe(`/charges?customer=${customer}&limit=100`));
  if (charges.some((charge) => charge.disputed !== false))
    throw new ProviderFailure('charge_requires_review', false);
}
