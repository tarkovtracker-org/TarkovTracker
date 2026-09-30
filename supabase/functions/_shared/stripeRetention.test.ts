import { describe, expect, it, vi } from 'vitest';
import {
  checkoutContributionDate,
  hasVerifiedRevokedHistory,
  getStripeBillingUserId,
  isSupporterDisqualified,
  supporterDisqualificationDate,
  supporterRevocationEvidence,
  withVerifiedStripeContribution,
  elapsedStripeDate,
  invoiceContributionDate,
  isRetainedStripeContribution,
  subscriptionEndDate,
  subscriptionEndEvidence,
  subscriptionGraceDate,
} from './stripeRetention.ts';
const now = new Date('2026-09-29T12:00:00.000Z');
const paidAt = new Date('2026-09-28T12:00:00.000Z');
const seconds = paidAt.getTime() / 1000;
describe('Stripe retention evidence', () => {
  it('records paid one-time checkout creation only', () => {
    const checkout = { mode: 'payment', payment_status: 'paid', created: seconds };
    expect(checkoutContributionDate(checkout, now)).toBe(paidAt.toISOString());
    expect(checkoutContributionDate({ ...checkout, payment_status: 'unpaid' }, now)).toBeNull();
    expect(checkoutContributionDate({ ...checkout, mode: 'subscription' }, now)).toBeNull();
  });
  it('records actual invoice payments, with a processing-time fallback', () => {
    expect(
      invoiceContributionDate({ amount_paid: 100, status_transitions: { paid_at: seconds } }, now)
    ).toBe(paidAt.toISOString());
    expect(invoiceContributionDate({ amount_paid: 0 }, now)).toBeNull();
    expect(invoiceContributionDate({ amount_paid: -10 }, now)).toBeNull();
    expect(invoiceContributionDate({ amount_paid: Infinity }, now)).toBeNull();
    expect(invoiceContributionDate({ amount_paid: 100 }, now)).toBe(now.toISOString());
  });
  it('rejects malformed and future dates without throwing', () => {
    for (const value of [null, '123', NaN, Infinity, -1, 0, now.getTime() / 1000 + 1]) {
      expect(elapsedStripeDate(value, now)).toBeNull();
      expect(subscriptionEndDate({ ended_at: value, current_period_end: value }, now)).toBe(
        now.toISOString()
      );
    }
  });
  it('preserves a repeated grace deadline, including after it expires', () => {
    const row = {
      status: 'past_due',
      stripe_subscription_id: 'sub_1',
      expires_at: paidAt.toISOString(),
    };
    expect(subscriptionGraceDate(row, 'sub_1', now, 7)).toBe(paidAt.toISOString());
    expect(subscriptionGraceDate({ ...row, status: 'expired' }, 'sub_1', now, 7)).toBe(
      paidAt.toISOString()
    );
    expect(subscriptionEndDate({}, now, row.expires_at)).toBe(paidAt.toISOString());
    expect(subscriptionGraceDate(row, 'sub_2', now, 7)).toBe('2026-10-06T12:00:00.000Z');
    expect(subscriptionGraceDate({ ...row, status: 'active' }, 'sub_1', now, 7)).toBe(
      '2026-10-06T12:00:00.000Z'
    );
  });
  it('uses verified end dates and includes later granted grace access', () => {
    expect(subscriptionEndDate({ ended_at: seconds }, now)).toBe(paidAt.toISOString());
    expect(subscriptionEndDate({ current_period_end: seconds }, now)).toBe(paidAt.toISOString());
    expect(subscriptionEndDate({ ended_at: seconds - 86400 }, now, paidAt.toISOString())).toBe(
      paidAt.toISOString()
    );
    expect(
      subscriptionEndDate(
        { ended_at: now.getTime() / 1000 + 100, current_period_end: seconds },
        now
      )
    ).toBe(paidAt.toISOString());
  });
  it('does not start retention at a cancellation request or during live grace', () => {
    const subscription = { cancel_at_period_end: true, current_period_end: seconds };
    expect(subscriptionEndEvidence(subscription, 'active', now)).toBeNull();
    expect(subscriptionEndEvidence(subscription, 'past_due', now)).toBeNull();
    expect(subscriptionEndEvidence(subscription, 'expired', now)).toBe(paidAt.toISOString());
  });
  it('retains only earlier contributions that are not fully refunded or disputed', () => {
    const charge = {
      id: 'ch_prior',
      status: 'succeeded',
      disputed: false,
      refunded: false,
      amount: 100,
      amount_refunded: 0,
    };
    expect(isRetainedStripeContribution(charge, 'ch_current')).toBe(true);
    expect(isRetainedStripeContribution({ ...charge, amount_refunded: 20 }, 'ch_current')).toBe(
      true
    );
    expect(isRetainedStripeContribution(charge, 'ch_prior')).toBe(false);
    expect(isRetainedStripeContribution({ ...charge, refunded: true }, 'ch_current')).toBe(false);
    expect(isRetainedStripeContribution({ ...charge, amount_refunded: 100 }, 'ch_current')).toBe(
      false
    );
    expect(isRetainedStripeContribution({ ...charge, disputed: true }, 'ch_current')).toBe(false);
    expect(isRetainedStripeContribution({ ...charge, disputed: undefined }, 'ch_current')).toBe(
      false
    );
    expect(isRetainedStripeContribution({ ...charge, status: 'failed' }, 'ch_current')).toBe(false);
  });
  it('repairs invalid grace deadlines without accepting arbitrary future access', () => {
    for (const expires_at of ['invalid', '2099-01-01T00:00:00Z']) {
      expect(
        subscriptionGraceDate(
          { status: 'past_due', stripe_subscription_id: 'sub_1', expires_at },
          'sub_1',
          now,
          7
        )
      ).toBe('2026-10-06T12:00:00.000Z');
    }
  });
});
describe('paid webhook grant gate with current Stripe lookup', () => {
  it.each(['checkout', 'invoice'])(
    'rejects delayed %s after a sole refund or dispute',
    async () => {
      for (const reversal of [{ refunded: true }, { disputed: true }]) {
        const charge = {
          id: 'ch_only',
          status: 'succeeded',
          disputed: false,
          refunded: false,
          amount: 100,
          amount_refunded: 0,
          ...reversal,
        };
        const lookup = vi.fn(() =>
          Promise.resolve([charge].filter((item) => isRetainedStripeContribution(item, '')).length)
        );
        const state = {
          has_ever_supported: false,
          retention_history_verified: true,
          status: 'cancelled',
        };
        const grant = vi.fn(() => {
          state.has_ever_supported = true;
          state.status = 'active';
          return Promise.resolve();
        });
        const reject = vi.fn(() => {
          state.has_ever_supported = false;
          state.status = 'cancelled';
          return Promise.resolve();
        });
        await withVerifiedStripeContribution(lookup, grant, reject);
        expect(lookup).toHaveBeenCalledOnce();
        expect(grant).not.toHaveBeenCalled();
        expect(reject).toHaveBeenCalledOnce();
        expect(state.has_ever_supported).toBe(false);
        expect(state.status).toBe('cancelled');
      }
    }
  );
  it('allows a new valid payment to restore support after reversal', async () => {
    const lookup = vi.fn(() => Promise.resolve(1));
    const grant = vi.fn(() => {});
    const reject = vi.fn(() => {});
    await withVerifiedStripeContribution(lookup, grant, reject);
    expect(grant).toHaveBeenCalledOnce();
    expect(reject).not.toHaveBeenCalled();
  });
  it('retries unknown or incomplete history without granting or revoking', async () => {
    const grant = vi.fn(() => {});
    const reject = vi.fn(() => {});
    await expect(
      withVerifiedStripeContribution(() => Promise.resolve(null), grant, reject)
    ).rejects.toThrow('Unable to verify');
    expect(grant).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });
  it('rechecks verified revoked history on subscription status updates', () => {
    expect(
      hasVerifiedRevokedHistory({ has_ever_supported: false, retention_history_verified: true })
    ).toBe(true);
    expect(
      hasVerifiedRevokedHistory({ has_ever_supported: true, retention_history_verified: true })
    ).toBe(false);
    expect(
      hasVerifiedRevokedHistory({ has_ever_supported: false, retention_history_verified: false })
    ).toBe(false);
    expect(hasVerifiedRevokedHistory(null)).toBe(false);
  });
});
describe('durable chargeback disqualification', () => {
  const disqualifiedAt = '2026-09-29T11:00:00.000Z';
  it('clears all support history despite earlier valid contributions', () => {
    const evidence = supporterRevocationEvidence(
      true,
      supporterDisqualificationDate(null, true, now)
    );
    expect(evidence).toEqual({
      status: 'cancelled',
      has_ever_supported: false,
      retention_history_verified: true,
      supporter_disqualified_at: now.toISOString(),
    });
  });
  it.each(['checkout', 'invoice', 'subscription status'])(
    'blocks later %s grants despite valid prior or new payments',
    async () => {
      const lookup = vi.fn(() => Promise.resolve(3));
      const grant = vi.fn(() => {});
      const reject = vi.fn(() => {});
      await withVerifiedStripeContribution(lookup, grant, reject, {
        supporter_disqualified_at: disqualifiedAt,
      });
      expect(lookup).not.toHaveBeenCalled();
      expect(grant).not.toHaveBeenCalled();
      expect(reject).toHaveBeenCalledOnce();
    }
  );
  it('preserves disqualification through later refund and repeated dispute reconciliation', () => {
    expect(supporterDisqualificationDate(disqualifiedAt, false, now)).toBe(disqualifiedAt);
    expect(supporterDisqualificationDate(disqualifiedAt, true, now)).toBe(disqualifiedAt);
    expect(supporterRevocationEvidence(false, disqualifiedAt).has_ever_supported).toBe(false);
  });
  it('retains prior valid support for a refund without a chargeback', () => {
    expect(supporterRevocationEvidence(false, null)).toEqual({
      status: 'expired',
      has_ever_supported: true,
      retention_history_verified: true,
      supporter_disqualified_at: null,
    });
    expect(supporterDisqualificationDate(null, false, now)).toBeNull();
    expect(isSupporterDisqualified({ supporter_disqualified_at: null })).toBe(false);
    expect(isSupporterDisqualified(null)).toBe(false);
    expect(isSupporterDisqualified({ supporter_disqualified_at: disqualifiedAt })).toBe(true);
  });
});
describe('trusted Stripe billing user attribution', () => {
  it('accepts checkout UUIDs and rejects malformed metadata before the RPC', () => {
    expect(getStripeBillingUserId('0bcd1234-1234-1234-1234-123456789abc')).toBe(
      '0bcd1234-1234-1234-1234-123456789abc'
    );
    for (const value of [undefined, null, 123, '', 'user-1', '12345678']) {
      expect(getStripeBillingUserId(value)).toBeNull();
    }
  });
});
