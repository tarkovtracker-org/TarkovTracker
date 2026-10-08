// @vitest-environment node
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as billing from './stripeBilling.ts';
import * as retention from './stripeRetention.ts';
import * as oneTime from './stripeOneTime.ts';
import * as tiers from './stripeTier.ts';
type Row = Record<string, unknown>;
const userId = '0bcd1234-1234-1234-1234-123456789abc';
const contributionAt = '2026-09-01T12:00:00.000Z';
const charge = {
  id: 'ch_new',
  status: 'succeeded',
  amount: 100,
  amount_refunded: 100,
  refunded: true,
  disputed: false,
};
const priorCharge = { ...charge, id: 'ch_prior', amount_refunded: 0, refunded: false };
const source = readFileSync(new URL('../stripe-webhook/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(
  `${source}\nexport const dispatchForTest = (event: StripeEvent) => processingClient.run(fencedClient(event.id, 'test_claim'), () => dispatchEvent(event));`,
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }
).outputText;
function createHarness(
  initial: Row,
  resources: Record<string, unknown>,
  options: {
    discord?: boolean;
    grant?: () => Promise<void>;
    remove?: () => Promise<void>;
    readError?: string;
    fulfillmentError?: string;
  } = {}
) {
  let row: Row = { ...initial };
  const writes: Row[] = [];
  const fulfillmentCalls: Row[] = [];
  const roles = new Set<string>();
  const from = (table: string) => {
    let values: Row | null = null;
    let filters: Array<[string, unknown]> = [];
    let action = 'read';
    const result = () => {
      if (table === 'discord_account_links' && options.discord) {
        return { data: { discord_user_id: 'discord_1' }, error: null };
      }
      if (table !== 'supporters') return { data: null, error: null };
      if (options.readError) return { data: null, error: { message: options.readError } };
      if (filters.some(([key, value]) => row[key] !== value)) return { data: null, error: null };
      if (values) {
        writes.push(values);
        row = { ...row, ...values, updated_at: `revision_${writes.length}` };
      }
      return { data: { ...row }, error: null };
    };
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return builder;
      },
      update: (record: Row) => {
        values = record;
        action = 'update';
        return builder;
      },
      upsert: (record: Row) => {
        values = record;
        action = 'upsert';
        filters = [];
        return builder;
      },
      maybeSingle: () => Promise.resolve(result()),
      single: () => Promise.resolve(result()),
      then: (resolve: (value: unknown) => void) => {
        const value = result();
        resolve(action === 'update' ? { ...value, data: value.data ? [value.data] : [] } : value);
      },
    };
    return builder;
  };
  const fetch = vi.fn((url: string) => {
    const path = url.replace('https://api.stripe.com/v1', '');
    if (!(path in resources)) return Promise.resolve(new Response('unavailable', { status: 503 }));
    return Promise.resolve(new Response(JSON.stringify(resources[path]), { status: 200 }));
  });
  const exports: { dispatchForTest?: (event: unknown) => Promise<void> } = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === 'node:async_hooks') return { AsyncLocalStorage };
      if (name.startsWith('npm:')) {
        return {
          createClient: () => ({
            from,
            rpc: (name: string, params: Row) => {
              if (name === 'fulfill_one_time_supporter') {
                fulfillmentCalls.push(params);
                if (options.fulfillmentError)
                  return Promise.resolve({
                    data: null,
                    error: { message: options.fulfillmentError },
                  });
                const record = params.p_record as Row;
                const live =
                  row.type === 'subscription' &&
                  ['active', 'past_due'].includes(String(row.status));
                row = {
                  ...row,
                  ...record,
                  has_ever_supported: true,
                  retention_history_verified: true,
                  status: live ? row.status : 'active',
                  type: live ? 'subscription' : 'one_time',
                  last_contribution_at: params.p_paid_at,
                  updated_at: `revision_${writes.length + 1}`,
                };
                writes.push({ ...row });
                return Promise.resolve({ data: { ...row }, error: null });
              }
              row = { ...row, supporter_disqualified_at: '2026-09-29T12:00:00Z' };
              return Promise.resolve({ error: null });
            },
            auth: { admin: { getUserById: () => Promise.resolve({ data: null }) } },
          }),
        };
      }
      if (name.endsWith('stripeBilling.ts')) return billing;
      if (name.endsWith('stripeRetention.ts')) return retention;
      if (name.endsWith('stripeOneTime.ts')) return oneTime;
      if (name.endsWith('stripeTier.ts')) return tiers;
      if (name.endsWith('cors.ts')) return {};
      return {
        isDiscordNotInGuildError: (error: unknown) =>
          error instanceof Error && error.name === 'DiscordNotInGuildError',
        removeAllTierRoles: async () => {
          await options.remove?.();
          roles.delete('tier');
        },
        removeSupporterRole: () => Promise.resolve(roles.delete('supporter')),
        syncLinkedAccountRole: async () => {},
        syncRolesForSupporter: async (_id: string, tier: string) => {
          await options.grant?.();
          roles.add('supporter');
          if (tier !== 'supporter') roles.add('tier');
        },
      };
    },
    Deno: { env: { get: () => 'test' }, serve: () => {} },
    fetch,
    URLSearchParams,
    Response,
    console: { info: () => {}, warn: () => {}, error: () => {} },
  });
  return {
    dispatch: (type: string, object: unknown, created = Math.floor(Date.now() / 1000)) =>
      exports.dispatchForTest!({ created, id: 'evt_1', type, data: { object } }),
    current: () => row,
    writes,
    fulfillmentCalls,
    fetch,
    roles,
  };
}
const supporter = {
  user_id: userId,
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: null,
  tier: 'supporter',
  type: 'one_time',
  status: 'expired',
  has_ever_supported: true,
  retention_history_verified: true,
  last_contribution_at: contributionAt,
  updated_at: 'revision_0',
};
const subscription = {
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  latest_invoice: 'in_new',
  metadata: { user_id: userId, tier: 'chad' },
};
function resourcesForPayments() {
  return {
    '/payment_intents/pi_new': { latest_charge: 'ch_new' },
    '/charges/ch_new': charge,
    '/charges?customer=cus_1&limit=100': { data: [charge, priorCharge], has_more: false },
    '/invoices/in_new': { id: 'in_new', amount_paid: 100, charge: 'ch_new', subscription: 'sub_1' },
    '/subscriptions/sub_1': subscription,
  };
}
const session = {
  id: 'cs_new',
  mode: 'payment',
  payment_status: 'paid',
  customer: 'cus_1',
  payment_intent: 'pi_new',
  client_reference_id: userId,
  metadata: { tier: 'chad' },
  created: 1789992000,
};
const invoice = { id: 'in_new', subscription: 'sub_1', amount_paid: 100 };
describe('payment-specific webhook fulfillment', () => {
  it.each(['checkout.session.completed', 'invoice.paid', 'customer.subscription.updated'])(
    'preserves old valid history without granting the refunded newer tier for %s',
    async (type) => {
      const harness = createHarness(supporter, resourcesForPayments());
      const object =
        type === 'checkout.session.completed'
          ? session
          : type === 'invoice.paid'
            ? invoice
            : subscription;
      await harness.dispatch(type, object);
      expect(harness.current()).toMatchObject({
        tier: 'supporter',
        status: 'expired',
        has_ever_supported: true,
        last_contribution_at: contributionAt,
      });
      expect(harness.writes).toHaveLength(1);
      expect(harness.roles.has('tier')).toBe(false);
    }
  );
  it('checks a subscription checkout own invoice even when other customer history is valid', async () => {
    const harness = createHarness(supporter, resourcesForPayments());
    await harness.dispatch('checkout.session.completed', {
      ...session,
      mode: 'subscription',
      subscription: 'sub_1',
      invoice: 'in_new',
    });
    expect(harness.current()).toMatchObject({
      tier: 'supporter',
      status: 'expired',
      has_ever_supported: true,
    });
    expect(harness.writes).toHaveLength(1);
  });
  it.each(['checkout.session.completed', 'invoice.paid'])(
    'leaves a newer active valid subscription intact for delayed reversed %s',
    async (type) => {
      const resources: Record<string, unknown> = resourcesForPayments();
      resources['/subscriptions/sub_live'] = {
        ...subscription,
        id: 'sub_live',
        latest_invoice: 'in_live',
      };
      resources['/invoices/in_live'] = { id: 'in_live', amount_paid: 100, charge: 'ch_prior' };
      resources['/charges/ch_prior'] = priorCharge;
      const harness = createHarness(
        {
          ...supporter,
          stripe_subscription_id: 'sub_live',
          type: 'subscription',
          status: 'active',
          tier: 'timmy',
        },
        resources
      );
      await harness.dispatch(type, type === 'invoice.paid' ? invoice : session);
      expect(harness.current()).toMatchObject({
        stripe_subscription_id: 'sub_live',
        tier: 'timmy',
        status: 'active',
        last_contribution_at: contributionAt,
      });
      expect(harness.writes).toHaveLength(0);
    }
  );
  it('does not revoke a newer paid renewal of the same subscription for a delayed reversed invoice', async () => {
    const resources: Record<string, unknown> = resourcesForPayments();
    resources['/subscriptions/sub_1'] = { ...subscription, latest_invoice: 'in_live' };
    resources['/invoices/in_live'] = { id: 'in_live', amount_paid: 100, charge: 'ch_prior' };
    resources['/charges/ch_prior'] = priorCharge;
    const harness = createHarness(
      {
        ...supporter,
        stripe_subscription_id: 'sub_1',
        type: 'subscription',
        status: 'active',
        tier: 'timmy',
      },
      resources
    );
    await harness.dispatch('invoice.paid', invoice);
    expect(harness.writes).toHaveLength(0);
    expect(harness.current().tier).toBe('timmy');
  });
  it.each(['checkout.session.completed', 'invoice.paid', 'customer.subscription.updated'])(
    'retries unknown payment evidence for %s without writes',
    async (type) => {
      const resources: Record<string, unknown> = resourcesForPayments();
      delete resources['/charges/ch_new'];
      const harness = createHarness(supporter, resources);
      const object =
        type === 'checkout.session.completed'
          ? session
          : type === 'invoice.paid'
            ? invoice
            : subscription;
      await expect(harness.dispatch(type, object)).rejects.toThrow('Unable to verify');
      expect(harness.writes).toHaveLength(0);
    }
  );
  it('grants a partially refunded new payment using its own PaymentIntent without a customer', async () => {
    const resources = resourcesForPayments();
    resources['/charges/ch_new'] = { ...charge, refunded: false, amount_refunded: 20 };
    const harness = createHarness({ ...supporter, stripe_customer_id: null }, resources);
    await harness.dispatch('checkout.session.completed', { ...session, customer: null });
    expect(harness.current()).toMatchObject({
      tier: 'chad',
      status: 'active',
      has_ever_supported: true,
    });
    expect(harness.fetch.mock.calls.some(([url]) => url.includes('/charges?'))).toBe(false);
  });
  it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])(
    'fulfills %s with stable payment identity and successful event date, not checkout creation',
    async (type) => {
      const resources = resourcesForPayments();
      resources['/charges/ch_new'] = { ...priorCharge, id: 'ch_new' };
      const harness = createHarness(supporter, resources);
      const paidAt = Date.parse('2026-10-07T01:00:00Z') / 1000;
      await harness.dispatch(type, { ...session, amount_total: 400 }, paidAt);
      expect(harness.fulfillmentCalls).toEqual([
        {
          p_payment_id: 'pi_new',
          p_paid_at: '2026-10-07T01:00:00.000Z',
          p_record: {
            user_id: userId,
            tier: 'chad',
            stripe_customer_id: 'cus_1',
            discord_user_id: null,
            amount_total: 400,
          },
        },
      ]);
    }
  );
  it('preserves the successful event date on a late delivery from before the cutoff', async () => {
    const resources = resourcesForPayments();
    resources['/charges/ch_new'] = { ...priorCharge, id: 'ch_new' };
    const harness = createHarness(supporter, resources);
    await harness.dispatch(
      'checkout.session.completed',
      { ...session, amount_total: 400 },
      Date.parse('2026-10-06T23:59:59Z') / 1000
    );
    expect(harness.fulfillmentCalls[0]?.p_paid_at).toBe('2026-10-06T23:59:59.000Z');
  });
  it('does not write when the existing supporter lookup fails', async () => {
    const harness = createHarness(supporter, resourcesForPayments(), { readError: 'offline' });
    await expect(harness.dispatch('checkout.session.completed', session)).rejects.toThrow(
      'Lookup by user_id failed'
    );
    expect(harness.writes).toEqual([]);
    expect(harness.fulfillmentCalls).toEqual([]);
  });
  it('propagates failed atomic fulfillment for retry without a fallback upsert', async () => {
    const resources = resourcesForPayments();
    resources['/charges/ch_new'] = { ...priorCharge, id: 'ch_new' };
    const harness = createHarness(supporter, resources, {
      fulfillmentError: 'database unavailable',
    });
    await expect(
      harness.dispatch('checkout.session.completed', { ...session, amount_total: 400 })
    ).rejects.toThrow('One-time fulfillment failed');
    expect(harness.writes).toEqual([]);
  });
});
describe('webhook Discord chargeback fencing', () => {
  it.each(['checkout.session.completed', 'customer.subscription.updated'])(
    'finishes without roles when chargeback completes during %s role grant',
    async (type) => {
      let startGrant!: () => void;
      let resumeGrant!: () => void;
      const started = new Promise<void>((resolve) => {
        startGrant = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        resumeGrant = resolve;
      });
      const resources: Record<string, unknown> = resourcesForPayments();
      resources['/charges/ch_new'] = {
        ...priorCharge,
        id: 'ch_new',
        customer: 'cus_1',
        metadata: { user_id: userId },
      };
      const harness = createHarness(supporter, resources, {
        discord: true,
        grant: async () => {
          startGrant();
          await resume;
        },
      });
      const pending = harness.dispatch(
        type,
        type === 'checkout.session.completed' ? session : subscription
      );
      await started;
      await harness.dispatch('charge.dispute.created', { charge: 'ch_new', customer: 'cus_1' });
      expect(harness.roles.size).toBe(0);
      resumeGrant();
      await pending;
      expect(harness.roles.size).toBe(0);
      expect(harness.current().has_ever_supported).toBe(false);
    }
  );
  it('retries a chargeback after Discord removal fails', async () => {
    const resources: Record<string, unknown> = resourcesForPayments();
    resources['/charges/ch_new'] = { ...charge, customer: 'cus_1', metadata: { user_id: userId } };
    const harness = createHarness(supporter, resources, {
      discord: true,
      remove: () => Promise.reject(new Error('Discord unavailable')),
    });
    await expect(
      harness.dispatch('charge.dispute.created', { charge: 'ch_new', customer: 'cus_1' })
    ).rejects.toThrow('Discord unavailable');
    expect(harness.current().has_ever_supported).toBe(false);
  });
  it('acknowledges a chargeback for an absent Discord guild member', async () => {
    const resources: Record<string, unknown> = resourcesForPayments();
    resources['/charges/ch_new'] = { ...charge, customer: 'cus_1', metadata: { user_id: userId } };
    const harness = createHarness(supporter, resources, {
      discord: true,
      remove: () => {
        const error = new Error('not in guild');
        error.name = 'DiscordNotInGuildError';
        return Promise.reject(error);
      },
    });
    await expect(
      harness.dispatch('charge.dispute.created', { charge: 'ch_new', customer: 'cus_1' })
    ).resolves.toBeUndefined();
    expect(harness.current().has_ever_supported).toBe(false);
  });
});
describe('subscription grace contribution fence', () => {
  it.each(['customer.subscription.updated', 'invoice.payment_failed'])(
    'keeps the sole fully refunded supporter cancelled without roles after %s',
    async (type) => {
      const resources: Record<string, unknown> = resourcesForPayments();
      resources['/charges?customer=cus_1&limit=100'] = { data: [charge], has_more: false };
      const harness = createHarness(
        {
          ...supporter,
          type: 'subscription',
          status: 'active',
          tier: 'chad',
          stripe_subscription_id: 'sub_1',
        },
        resources,
        { discord: true }
      );
      harness.roles.add('supporter');
      harness.roles.add('tier');
      await harness.dispatch('charge.refunded', {
        ...charge,
        customer: 'cus_1',
        invoice: 'in_new',
      });
      expect(harness.current()).toMatchObject({
        status: 'cancelled',
        has_ever_supported: false,
        retention_history_verified: true,
      });
      expect(harness.roles.size).toBe(0);
      resources['/subscriptions/sub_1'] = {
        ...subscription,
        status: 'past_due',
        latest_invoice: 'in_failed',
      };
      await harness.dispatch(
        type,
        type === 'invoice.payment_failed'
          ? { id: 'in_failed', subscription: 'sub_1', amount_paid: 0 }
          : subscription
      );
      expect(harness.current()).toMatchObject({
        status: 'cancelled',
        tier: 'supporter',
        has_ever_supported: false,
        stripe_subscription_id: null,
      });
      expect(harness.roles.size).toBe(0);
      expect(new Date(String(harness.current().expires_at)).getTime()).toBeLessThanOrEqual(
        Date.now()
      );
    }
  );
  it.each(['customer.subscription.updated', 'invoice.payment_failed'])(
    'preserves previously paid subscription grace after %s even with an unpaid latest invoice',
    async (type) => {
      const resources: Record<string, unknown> = resourcesForPayments();
      resources['/subscriptions/sub_1'] = {
        ...subscription,
        status: 'past_due',
        latest_invoice: 'in_failed',
      };
      const harness = createHarness(
        {
          ...supporter,
          type: 'subscription',
          status: 'active',
          tier: 'timmy',
          stripe_subscription_id: 'sub_1',
        },
        resources,
        { discord: true }
      );
      await harness.dispatch(
        type,
        type === 'invoice.payment_failed'
          ? { id: 'in_failed', subscription: 'sub_1', amount_paid: 0 }
          : subscription
      );
      expect(harness.current()).toMatchObject({
        status: 'past_due',
        tier: 'timmy',
        has_ever_supported: true,
        stripe_subscription_id: 'sub_1',
      });
      expect(new Date(String(harness.current().expires_at)).getTime()).toBeGreaterThan(Date.now());
      expect(harness.roles.has('tier')).toBe(true);
      expect(harness.roles.has('supporter')).toBe(true);
      expect(harness.fetch.mock.calls.some(([url]) => url.includes('/invoices/in_failed'))).toBe(
        false
      );
    }
  );
  it('holds revoked grace without a subscription-specific paid event', async () => {
    const resources: Record<string, unknown> = resourcesForPayments();
    resources['/subscriptions/sub_1'] = {
      ...subscription,
      status: 'past_due',
      latest_invoice: 'in_failed',
    };
    delete resources['/charges?customer=cus_1&limit=100'];
    const harness = createHarness(
      { ...supporter, status: 'cancelled', has_ever_supported: false },
      resources,
      { discord: true }
    );
    await harness.dispatch('customer.subscription.updated', subscription);
    expect(harness.writes).toHaveLength(0);
    expect(harness.roles.size).toBe(0);
  });
  it('holds grace when a previously paid subscription episode is missing', async () => {
    const resources: Record<string, unknown> = resourcesForPayments();
    resources['/subscriptions/sub_1'] = {
      ...subscription,
      status: 'past_due',
      latest_invoice: 'in_failed',
    };
    resources['/charges?customer=cus_1&limit=100'] = { data: [], has_more: false };
    const harness = createHarness({ ...supporter, has_ever_supported: undefined }, resources, {
      discord: true,
    });
    await harness.dispatch('customer.subscription.updated', subscription);
    expect(harness.current()).toMatchObject({ status: 'expired', has_ever_supported: undefined });
    expect(harness.writes).toHaveLength(0);
    expect(harness.roles.size).toBe(0);
  });
});
describe('webhook Discord full-refund fencing', () => {
  it.each(['checkout.session.completed', 'customer.subscription.updated'])(
    'finishes without roles when a sole refund completes during %s role grant',
    async (type) => {
      let startGrant!: () => void;
      let resumeGrant!: () => void;
      const started = new Promise<void>((resolve) => {
        startGrant = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        resumeGrant = resolve;
      });
      const resources: Record<string, unknown> = resourcesForPayments();
      resources['/charges/ch_new'] = { ...priorCharge, id: 'ch_new' };
      const harness = createHarness(supporter, resources, {
        discord: true,
        grant: async () => {
          startGrant();
          await resume;
        },
      });
      const pending = harness.dispatch(
        type,
        type === 'checkout.session.completed' ? session : subscription
      );
      await started;
      resources['/charges/ch_new'] = charge;
      resources['/charges?customer=cus_1&limit=100'] = { data: [charge], has_more: false };
      await harness.dispatch('charge.refunded', {
        ...charge,
        customer: 'cus_1',
        invoice: 'in_new',
      });
      expect(harness.roles.size).toBe(0);
      resumeGrant();
      await pending;
      expect(harness.roles.size).toBe(0);
      expect(harness.current()).toMatchObject({ status: 'cancelled', has_ever_supported: false });
    }
  );
});
describe('stored subscription grace preservation', () => {
  it.each(['checkout.session.completed', 'invoice.paid'])(
    'leaves bounded paid grace untouched after delayed refunded %s with an unpaid latest invoice',
    async (type) => {
      const resources: Record<string, unknown> = resourcesForPayments();
      resources['/subscriptions/sub_1'] = {
        ...subscription,
        status: 'past_due',
        latest_invoice: 'in_failed',
      };
      resources['/invoices/in_failed'] = { id: 'in_failed', amount_paid: 0 };
      const expiresAt = new Date(Date.now() + 2 * 86400000).toISOString();
      const harness = createHarness(
        {
          ...supporter,
          type: 'subscription',
          status: 'past_due',
          tier: 'timmy',
          stripe_subscription_id: 'sub_1',
          expires_at: expiresAt,
        },
        resources,
        { discord: true }
      );
      harness.roles.add('tier');
      harness.roles.add('supporter');
      await harness.dispatch(type, type === 'invoice.paid' ? invoice : session);
      expect(harness.current()).toMatchObject({
        status: 'past_due',
        tier: 'timmy',
        stripe_subscription_id: 'sub_1',
        expires_at: expiresAt,
        has_ever_supported: true,
        last_contribution_at: contributionAt,
      });
      expect(harness.writes).toHaveLength(0);
      expect([...harness.roles].sort()).toEqual(['supporter', 'tier']);
      expect(harness.fetch.mock.calls.some(([url]) => url.includes('/invoices/in_failed'))).toBe(
        false
      );
    }
  );
  it.each(['customer.subscription.updated', 'invoice.payment_failed'])(
    'does not grant new unpaid subscription grace from prior one-time support for %s',
    async (type) => {
      const resources: Record<string, unknown> = resourcesForPayments();
      resources['/subscriptions/sub_1'] = {
        ...subscription,
        status: 'past_due',
        latest_invoice: 'in_failed',
      };
      const harness = createHarness(supporter, resources, { discord: true });
      harness.roles.add('supporter');
      await harness.dispatch(
        type,
        type === 'invoice.payment_failed'
          ? { id: 'in_failed', subscription: 'sub_1' }
          : subscription
      );
      expect(harness.current()).toMatchObject({
        status: 'expired',
        type: 'one_time',
        tier: 'supporter',
        stripe_subscription_id: null,
        has_ever_supported: true,
        last_contribution_at: contributionAt,
      });
      expect(harness.writes).toHaveLength(0);
      expect([...harness.roles]).toEqual(['supporter']);
    }
  );
  it('keeps an expired same-episode grace deadline instead of issuing another window', async () => {
    const resources: Record<string, unknown> = resourcesForPayments();
    resources['/subscriptions/sub_1'] = {
      ...subscription,
      status: 'past_due',
      latest_invoice: 'in_failed',
    };
    const expiresAt = new Date(Date.now() - 86400000).toISOString();
    const harness = createHarness(
      {
        ...supporter,
        type: 'subscription',
        status: 'expired',
        tier: 'supporter',
        stripe_subscription_id: 'sub_1',
        expires_at: expiresAt,
      },
      resources,
      { discord: true }
    );
    await harness.dispatch('customer.subscription.updated', subscription);
    expect(harness.current()).toMatchObject({
      status: 'expired',
      tier: 'supporter',
      expires_at: expiresAt,
    });
    expect(harness.roles.has('tier')).toBe(false);
  });
  it.each([null, 'invalid', '2099-01-01T00:00:00Z'])(
    'holds expired episodes without a bounded existing deadline (%s)',
    async (expires_at) => {
      const resources: Record<string, unknown> = resourcesForPayments();
      resources['/subscriptions/sub_1'] = {
        ...subscription,
        status: 'past_due',
        latest_invoice: 'in_failed',
      };
      const harness = createHarness(
        {
          ...supporter,
          type: 'subscription',
          status: 'expired',
          stripe_subscription_id: 'sub_1',
          expires_at,
        },
        resources,
        { discord: true }
      );
      await harness.dispatch('customer.subscription.updated', subscription);
      expect(harness.writes).toHaveLength(0);
      expect(harness.roles.size).toBe(0);
    }
  );
});
describe('rejected guest checkout retained history', () => {
  it.each([true, false])(
    'preserves existing support history %s without granting a refunded guest payment',
    async (has_ever_supported) => {
      const harness = createHarness(
        {
          ...supporter,
          stripe_customer_id: null,
          has_ever_supported,
          retention_history_verified: false,
          status: 'active',
          tier: 'chad',
        },
        resourcesForPayments(),
        { discord: true }
      );
      harness.roles.add('tier');
      if (has_ever_supported) harness.roles.add('supporter');
      await harness.dispatch('checkout.session.completed', { ...session, customer: null });
      expect(harness.current()).toMatchObject({
        status: has_ever_supported ? 'expired' : 'cancelled',
        tier: 'supporter',
        has_ever_supported,
        retention_history_verified: false,
        last_contribution_at: contributionAt,
      });
      expect(harness.roles.has('tier')).toBe(false);
      expect(harness.roles.has('supporter')).toBe(has_ever_supported);
      expect(harness.fetch.mock.calls.some(([url]) => url.includes('/charges?'))).toBe(false);
    }
  );
  it('holds missing guest history instead of inventing revoked or verified evidence', async () => {
    const harness = createHarness(
      {
        ...supporter,
        stripe_customer_id: null,
        has_ever_supported: undefined,
        retention_history_verified: false,
      },
      resourcesForPayments()
    );
    await expect(
      harness.dispatch('checkout.session.completed', { ...session, customer: null })
    ).rejects.toThrow('Unable to verify preserved');
    expect(harness.writes).toHaveLength(0);
  });
  it('still removes all support for a disqualified guest regardless of retained history', async () => {
    const harness = createHarness(
      {
        ...supporter,
        stripe_customer_id: null,
        supporter_disqualified_at: '2026-09-29T12:00:00Z',
      },
      resourcesForPayments(),
      { discord: true }
    );
    harness.roles.add('supporter');
    harness.roles.add('tier');
    await harness.dispatch('checkout.session.completed', { ...session, customer: null });
    expect(harness.current()).toMatchObject({ status: 'cancelled', has_ever_supported: false });
    expect(harness.roles.size).toBe(0);
  });
});
