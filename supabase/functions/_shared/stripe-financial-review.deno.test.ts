import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { verifyStripeFinancialState } from './stripe-financial-review.ts';
import { ProviderFailure } from './provider-http.ts';
Deno.test('Customer without financial obligations passes read-only review', async () => {
  const calls: string[] = [];
  await verifyStripeFinancialState('cus_fake', (path) => {
    calls.push(path);
    return Promise.resolve({ data: [], has_more: false });
  });
  assertEquals(calls.length, 2);
});
for (const status of ['draft', 'open', 'uncollectible', 'unknown'])
  Deno.test(`${status} invoice is operator-blocked`, async () => {
    const failure = await assertRejects(
      () =>
        verifyStripeFinancialState('cus_fake', () =>
          Promise.resolve({ data: [{ status }], has_more: false })
        ),
      ProviderFailure
    );
    assertEquals(failure.retryable, false);
  });
Deno.test('Disputes and incomplete pagination cannot authorize deletion', async () => {
  for (const body of [
    { data: [], has_more: true },
    { data: [{ disputed: true }], has_more: false },
  ]) {
    await assertRejects(
      () =>
        verifyStripeFinancialState('cus_fake', (path) =>
          Promise.resolve(path.startsWith('/invoices') ? { data: [], has_more: false } : body)
        ),
      ProviderFailure
    );
  }
});
