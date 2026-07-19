export function getStripeReferenceId(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (typeof value !== 'object' || value === null || !('id' in value)) return null;
  const id = value.id;
  return typeof id === 'string' && id ? id : null;
}

export function getInvoiceSubscriptionId(invoice: unknown): string | null {
  if (typeof invoice !== 'object' || invoice === null) return null;
  const value = invoice as {
    parent?: { subscription_details?: { subscription?: unknown } };
    subscription?: unknown;
  };
  return (
    getStripeReferenceId(value.subscription) ||
    getStripeReferenceId(value.parent?.subscription_details?.subscription)
  );
}

export function isFullRefund(charge: unknown): boolean {
  if (typeof charge !== 'object' || charge === null) return false;
  const value = charge as { amount?: unknown; amount_refunded?: unknown; refunded?: unknown };
  if (value.refunded === true) return true;
  return (
    typeof value.amount === 'number' &&
    value.amount > 0 &&
    typeof value.amount_refunded === 'number' &&
    value.amount_refunded >= value.amount
  );
}

export function shouldActivateCheckoutSession(session: unknown): boolean {
  if (typeof session !== 'object' || session === null) return false;
  const value = session as { mode?: unknown; payment_status?: unknown };
  if (value.mode === 'subscription') return true;
  return value.mode === 'payment' && value.payment_status === 'paid';
}

export function getSubscriptionUserId(subscription: unknown): string | null {
  if (typeof subscription !== 'object' || subscription === null) return null;
  const value = subscription as { metadata?: { user_id?: unknown } };
  const userId = value.metadata?.user_id;
  return typeof userId === 'string' && userId ? userId : null;
}
