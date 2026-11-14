import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { it as test } from 'jsr:@std/testing@1.0.19/bdd';
import {
  cancelDeletedUserSubscription,
  clearEndedDeletionSubscription,
  DeletionBillingError,
  endedDeletionSubscription,
} from './account-deletion-billing.ts';
import type { AccountDeletionClient } from './account-deletion-lifecycle.ts';
function client(
  id: string | null,
  error: unknown = null,
  customerId: string | null = null,
  retained: string[] = []
) {
  const query = {
    select: () => query,
    eq: () => query,
    limit: () =>
      Promise.resolve({
        data: [{ stripe_subscription_id: id, stripe_customer_id: customerId }],
        error,
      }),
  };
  const ledger = {
    select: () => ledger,
    eq: () =>
      Promise.resolve({
        data: retained.map((id) => ({ stripe_subscription_id: id })),
        count: retained.length,
        error: null,
      }),
  };
  return {
    from: (table: string) => (table === 'account_billing_subscriptions' ? ledger : query),
  } as unknown as AccountDeletionClient;
}
const billing = { subscriptionId: 'sub_1', customerId: null, subscriptionIds: [] };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
test('deletion blocks every nonterminal subscription, including scheduled cancellation and revoked access', async () => {
  for (const status of [
    'active',
    'past_due',
    'trialing',
    'unpaid',
    'incomplete',
    'paused',
    'unknown',
  ]) {
    await assertRejects(
      () =>
        endedDeletionSubscription(client('sub_1'), 'user', 'test', () =>
          Promise.resolve(response({ id: 'sub_1', status, cancel_at_period_end: true }))
        ),
      DeletionBillingError,
      'account_deletion_subscription_active'
    );
  }
});
test('ended subscriptions and accounts without subscriptions keep their legitimate deletion path', async () => {
  for (const status of ['canceled', 'incomplete_expired']) {
    assertEquals(
      await endedDeletionSubscription(client('sub_1'), 'user', 'test', () =>
        Promise.resolve(response({ id: 'sub_1', status }))
      ),
      billing
    );
  }
  assertEquals(await endedDeletionSubscription(client(null), 'user', ''), {
    subscriptionId: null,
    customerId: null,
    subscriptionIds: [],
  });
});
test('missing keys, lookup errors, Stripe failures and mismatched identities fail closed', async () => {
  await assertRejects(
    () => endedDeletionSubscription(client('sub_1'), 'user', ''),
    DeletionBillingError
  );
  await assertRejects(
    () => endedDeletionSubscription(client(null, new Error('db')), 'user', ''),
    DeletionBillingError
  );
  for (const [value, status] of [
    [{}, 200],
    [{ id: 'other', status: 'canceled' }, 200],
    [{}, 404],
    [{}, 503],
  ] as const) {
    await assertRejects(
      () =>
        endedDeletionSubscription(client('sub_1'), 'user', 'test', () =>
          Promise.resolve(response(value, status))
        ),
      DeletionBillingError
    );
  }
});
test('a replaced lease or changed subscription cannot clear the retained billing reference', async () => {
  const stale = {
    rpc: () => Promise.resolve({ data: false, error: null }),
  } as unknown as AccountDeletionClient;
  await assertRejects(
    () => clearEndedDeletionSubscription(stale, 'user', billing, 'old-claim'),
    DeletionBillingError
  );
  const current = {
    rpc: () => Promise.resolve({ data: true, error: null }),
  } as unknown as AccountDeletionClient;
  await clearEndedDeletionSubscription(current, 'user', billing, 'current-claim');
});
test('a replaced subscription on another customer remains a deletion blocker', async () => {
  const seen: string[] = [];
  await assertRejects(
    () =>
      endedDeletionSubscription(
        client('sub_2', null, null, ['sub_1', 'sub_2']),
        'user',
        'test',
        (url) => {
          const id = String(url).split('/').at(-1)!;
          seen.push(id);
          return Promise.resolve(response({ id, status: id === 'sub_1' ? 'active' : 'canceled' }));
        }
      ),
    DeletionBillingError,
    'account_deletion_subscription_active'
  );
  assertEquals(seen, ['sub_1']);
});
test('customer history catches cleared legacy references and checks every subscription page', async () => {
  const requests: URL[] = [];
  const fetchPage: typeof fetch = (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const second = url.searchParams.get('starting_after') === 'sub_old';
    return Promise.resolve(
      response({
        data: [{ id: second ? 'sub_live' : 'sub_old', status: second ? 'active' : 'canceled' }],
        has_more: !second,
      })
    );
  };
  await assertRejects(
    () => endedDeletionSubscription(client(null, null, 'cus_1'), 'user', 'test', fetchPage),
    DeletionBillingError,
    'account_deletion_subscription_active'
  );
  assertEquals(requests.length, 2);
  assertEquals(requests[0].searchParams.get('status'), 'all');
  const ended = await endedDeletionSubscription(client(null, null, 'cus_1'), 'user', 'test', () =>
    Promise.resolve(response({ data: [], has_more: false }))
  );
  assertEquals(ended.customerId, 'cus_1');
  await assertRejects(
    () =>
      endedDeletionSubscription(client(null, null, 'cus_1'), 'user', 'test', () =>
        Promise.resolve(response({ data: [], has_more: true }))
      ),
    DeletionBillingError,
    'account_deletion_billing_unavailable'
  );
});
test('late Checkout subscriptions are cancelled only for a confirmed deleted account', async () => {
  const subscription = { id: 'sub_1', status: 'active' };
  let cancellations = 0;
  const cancel: typeof fetch = (_input, init) => {
    assertEquals(init?.method, 'DELETE');
    cancellations++;
    return Promise.resolve(response({ id: 'sub_1', status: 'canceled' }));
  };
  const present = {
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: {} }, error: null }) } },
  };
  assertEquals(
    await cancelDeletedUserSubscription(present, 'user', subscription, 'test', cancel),
    false
  );
  assertEquals(cancellations, 0);
  const missing = {
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve({ data: { user: null }, error: { status: 404, code: 'user_not_found' } }),
      },
    },
  };
  assertEquals(
    await cancelDeletedUserSubscription(missing, 'user', subscription, 'test', cancel),
    true
  );
  assertEquals(cancellations, 1);
  const outage = {
    auth: {
      admin: {
        getUserById: () => Promise.resolve({ data: { user: null }, error: { status: 503 } }),
      },
    },
  };
  await assertRejects(
    () => cancelDeletedUserSubscription(outage, 'user', subscription, 'test', cancel),
    DeletionBillingError
  );
  assertEquals(cancellations, 1);
});
