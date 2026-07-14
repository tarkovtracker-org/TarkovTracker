import { describe, expect, it } from 'vitest';
import { getInvoiceSubscriptionId, getStripeReferenceId, isFullRefund } from './stripeBilling.ts';

describe('getStripeReferenceId', () => {
  it('supports string and expanded Stripe references', () => {
    expect(getStripeReferenceId('sub_123')).toBe('sub_123');
    expect(getStripeReferenceId({ id: 'sub_456' })).toBe('sub_456');
    expect(getStripeReferenceId(null)).toBeNull();
  });
});

describe('getInvoiceSubscriptionId', () => {
  it('supports legacy and current Stripe invoice shapes', () => {
    expect(getInvoiceSubscriptionId({ subscription: 'sub_legacy' })).toBe('sub_legacy');
    expect(
      getInvoiceSubscriptionId({
        parent: { subscription_details: { subscription: 'sub_current' } },
      })
    ).toBe('sub_current');
  });
});

describe('isFullRefund', () => {
  it('distinguishes full and partial refunds', () => {
    expect(isFullRefund({ refunded: true, amount: 1000, amount_refunded: 1000 })).toBe(true);
    expect(isFullRefund({ refunded: false, amount: 1000, amount_refunded: 1000 })).toBe(true);
    expect(isFullRefund({ refunded: false, amount: 1000, amount_refunded: 500 })).toBe(false);
  });
});
