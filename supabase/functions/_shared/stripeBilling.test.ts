import { describe, expect, it } from 'vitest';
import {
  getInvoiceSubscriptionId,
  getStripeReferenceId,
  getSubscriptionUserId,
  isFullRefund,
  shouldActivateCheckoutSession,
} from './stripeBilling.ts';

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

describe('shouldActivateCheckoutSession', () => {
  it('requires confirmed funds for one-time payments', () => {
    expect(shouldActivateCheckoutSession({ mode: 'payment', payment_status: 'paid' })).toBe(true);
    expect(shouldActivateCheckoutSession({ mode: 'payment', payment_status: 'unpaid' })).toBe(
      false
    );
  });

  it('allows subscriptions to be verified from their Stripe status', () => {
    expect(shouldActivateCheckoutSession({ mode: 'subscription', payment_status: 'unpaid' })).toBe(
      true
    );
    expect(shouldActivateCheckoutSession({ mode: 'invalid', payment_status: 'paid' })).toBe(false);
  });
});

describe('getSubscriptionUserId', () => {
  it('reads the authenticated user reference from subscription metadata', () => {
    expect(getSubscriptionUserId({ metadata: { user_id: 'user-1' } })).toBe('user-1');
    expect(getSubscriptionUserId({ metadata: {} })).toBeNull();
    expect(getSubscriptionUserId(null)).toBeNull();
  });
});
