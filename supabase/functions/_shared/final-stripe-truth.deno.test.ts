import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { verifyFinalStripeTruth } from './final-stripe-truth.ts';
import { ProviderFailure } from './provider-http.ts';
import { verifyAccountBilling } from './final-billing-verification.ts';
import type { AccountDeletionClient } from './account-deletion-lifecycle.ts';
const empty = { data: [], has_more: false };
for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'unknown']) {
  Deno.test(`fresh truth rejects ${status} despite completed local work`, async () => {
    await assertRejects(
      () =>
        verifyFinalStripeTruth('synthetic', ['cus_synthetic'], false, async () => ({
          data: [
            { id: 'sub_synthetic', customer: 'cus_synthetic', status, cancel_at_period_end: true },
          ],
          has_more: false,
        })),
      ProviderFailure
    );
  });
}
for (const status of ['canceled', 'incomplete_expired']) {
  Deno.test(`fresh truth permits terminal ${status} only after financial reads`, async () => {
    const paths: string[] = [];
    await verifyFinalStripeTruth('synthetic', ['cus_synthetic'], false, async (path) => {
      paths.push(path);
      return path.startsWith('/subscriptions')
        ? { data: [{ id: 'sub_synthetic', customer: 'cus_synthetic', status }], has_more: false }
        : empty;
    });
    assertEquals(paths.length, 3);
    assertEquals(
      paths.some((p) => p.startsWith('/invoices')),
      true
    );
    assertEquals(
      paths.some((p) => p.startsWith('/charges')),
      true
    );
  });
}
Deno.test('legacy discovery paginates and sees later active subscription', async () => {
  let calls = 0;
  await assertRejects(
    () =>
      verifyFinalStripeTruth('synthetic', [], true, async () => {
        calls++;
        if (calls === 1)
          return { data: [{ id: 'sub_unrelated', status: 'canceled' }], has_more: true };
        if (calls === 2)
          return {
            data: [{ id: 'sub_synthetic', metadata: { user_id: 'synthetic' }, status: 'active' }],
            has_more: false,
          };
        return empty;
      }),
    ProviderFailure
  );
  assertEquals(calls, 3);
});
Deno.test('discovery fails closed at bounded pagination limit', async () => {
  let calls = 0;
  await assertRejects(
    () =>
      verifyFinalStripeTruth('synthetic', [], true, async () => {
        calls++;
        return { data: [{ id: `sub_${calls}` }], has_more: true };
      }),
    ProviderFailure,
    'stripe_truth_pagination_review'
  );
  assertEquals(calls, 4);
});
for (const value of [{}, { data: [], has_more: 'false' }, { data: [{}], has_more: false }]) {
  Deno.test(`malformed current list never proves clear ${JSON.stringify(value)}`, async () => {
    await assertRejects(
      () => verifyFinalStripeTruth('synthetic', ['cus_synthetic'], false, async () => value),
      ProviderFailure
    );
  });
}
Deno.test('unresolved legacy checkout cannot be cleared by age or completed task', async () => {
  await assertRejects(
    () =>
      verifyFinalStripeTruth('synthetic', [], true, async (path) =>
        path.startsWith('/checkout')
          ? {
              data: [
                {
                  id: 'cs_synthetic',
                  client_reference_id: 'synthetic',
                  status: 'open',
                  customer: null,
                },
              ],
              has_more: false,
            }
          : empty
      ),
    ProviderFailure
  );
});
function client(finish: boolean, calls: string[]) {
  return {
    rpc: async (name: string) => {
      calls.push(name);
      return {
        data:
          name === 'begin_final_billing_verification'
            ? {
                status: 'checking',
                token: 'synthetic-token',
                resources: ['cus_synthetic'],
                discover_legacy: false,
              }
            : finish,
        error: null,
      };
    },
  } as AccountDeletionClient;
}
Deno.test('Stripe unavailability persists blocked outcome, never old CLEAR', async () => {
  const calls: string[] = [];
  assertEquals(
    await verifyAccountBilling(client(false, calls), 'synthetic', 'claim', async () => {
      throw new ProviderFailure('provider_http_503', true);
    }),
    'provider_wait'
  );
  assertEquals(calls, ['begin_final_billing_verification', 'finish_final_billing_verification']);
});
Deno.test('clear provider result cannot override failed generation/claim CAS', async () => {
  assertEquals(
    await verifyAccountBilling(client(false, []), 'synthetic', 'claim', async () => empty),
    'lease_lost'
  );
});
Deno.test('financial ambiguity remains operator blocked', async () => {
  assertEquals(
    await verifyAccountBilling(client(false, []), 'synthetic', 'claim', async (path) =>
      path.startsWith('/invoices')
        ? { data: [{ id: 'in_synthetic', status: 'open' }], has_more: false }
        : empty
    ),
    'operator_review'
  );
});
Deno.test('mismatched customer is rejected before durable resource preservation', async () => {
  const preserved: string[] = [];
  await assertRejects(
    () =>
      verifyFinalStripeTruth(
        'synthetic',
        ['cus_synthetic'],
        false,
        async () => ({
          data: [{ id: 'sub_other', customer: 'cus_other', status: 'active' }],
          has_more: false,
        }),
        async (id) => {
          preserved.push(id);
        }
      ),
    ProviderFailure
  );
  assertEquals(preserved, []);
});
Deno.test(
  'new active subscription is preserved before reporting blocked provider truth',
  async () => {
    const preserved: string[] = [];
    await assertRejects(
      () =>
        verifyFinalStripeTruth(
          'synthetic',
          ['cus_synthetic'],
          false,
          async () => ({
            data: [{ id: 'sub_new', customer: 'cus_synthetic', status: 'active' }],
            has_more: false,
          }),
          async (id) => {
            preserved.push(id);
          }
        ),
      ProviderFailure
    );
    assertEquals(preserved, ['sub_new']);
  }
);
