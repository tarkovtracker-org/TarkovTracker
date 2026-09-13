import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { providerJson, ProviderFailure } from './provider-http.ts';
import { executeProviderCleanup } from './provider-cleanup.ts';
import { runLifecycleBatch, type LifecycleWork } from './lifecycle-worker.ts';
const work: LifecycleWork = {
  id: 'synthetic-task',
  claim_token: 'synthetic-claim',
  kind: 'stripe_cleanup',
  resource_id: 'sub_fake',
  user_id: 'fake-user',
  action: 'cancel_at_period_end',
  attempts: 1,
  first_failure_at: null,
};
for (const status of [429, 500, 502, 503]) {
  Deno.test(`Stripe ${status} remains retryable and honors Retry-After`, async () => {
    const error = await assertRejects(
      () =>
        providerJson('https://example.invalid', {}, () =>
          Promise.resolve(new Response('{}', { status, headers: { 'Retry-After': '120' } }))
        ),
      ProviderFailure
    );
    assertEquals(error.retryable, true);
    assertEquals(error.retryAfterSeconds, 120);
  });
}
for (const name of ['AbortError', 'TypeError']) {
  Deno.test(`${name} is not semantic absence`, async () => {
    const error = await assertRejects(
      () =>
        providerJson('https://example.invalid', {}, () =>
          Promise.reject(new DOMException('synthetic', name))
        ),
      ProviderFailure
    );
    assertEquals(error.retryable, true);
  });
}
Deno.test('Malformed JSON and valid absent customer are distinguished', async () => {
  await assertRejects(
    () =>
      providerJson('https://example.invalid', {}, () => Promise.resolve(new Response('not-json'))),
    ProviderFailure
  );
  assertEquals(
    await providerJson('https://example.invalid', {}, () =>
      Promise.resolve(Response.json({ customer: null }))
    ),
    { customer: null }
  );
});
Deno.test('404 is operator-classified rather than universal completion', async () => {
  const error = await assertRejects(
    () =>
      providerJson('https://example.invalid', {}, () =>
        Promise.resolve(new Response('{}', { status: 404 }))
      ),
    ProviderFailure
  );
  assertEquals(error.retryable, false);
});
for (const status of ['active', 'trialing']) {
  Deno.test(
    `${status} subscription schedules period end without refund and remains unfinished`,
    async () => {
      const calls: unknown[][] = [];
      const result = await executeProviderCleanup(work, {
        verifyFinancialState: () => Promise.resolve(),
        validate: () => Promise.resolve(true),
        removeDiscordRoles: () => Promise.resolve(),
        stripe: (...args) => {
          calls.push(args);
          return Promise.resolve({ id: 'sub_fake', status });
        },
      });
      assertEquals(result.state, 'waiting');
      assertEquals(calls[1], [
        '/subscriptions/sub_fake',
        'POST',
        'cancel_at_period_end=true',
        'deletion-synthetic-task-sub_fake',
      ]);
    }
  );
}
for (const status of ['past_due', 'unpaid', 'incomplete', 'unknown']) {
  Deno.test(`${status} subscription blocks for review`, async () => {
    await assertRejects(
      () =>
        executeProviderCleanup(work, {
          verifyFinancialState: () => Promise.resolve(),
          validate: () => Promise.resolve(true),
          removeDiscordRoles: () => Promise.resolve(),
          stripe: () => Promise.resolve({ id: 'sub_fake', status }),
        }),
      ProviderFailure
    );
  });
}
Deno.test('Canceled subscription completes without provider mutation', async () => {
  let calls = 0;
  const result = await executeProviderCleanup(work, {
    verifyFinancialState: () => Promise.resolve(),
    validate: () => Promise.resolve(true),
    removeDiscordRoles: () => Promise.resolve(),
    stripe: () => {
      calls++;
      return Promise.resolve({ id: 'sub_fake', status: 'canceled' });
    },
  });
  assertEquals(result.state, 'completed');
  assertEquals(calls, 1);
});
Deno.test('Fenced worker cannot advance work owned by another claim', async () => {
  const result = await runLifecycleBatch(
    { claim: () => Promise.resolve([work]), finish: () => Promise.resolve(false) },
    'stripe_cleanup',
    () => Promise.resolve({ state: 'completed' })
  );
  assertEquals(result, { claimed: 1, advanced: 0 });
});
Deno.test('Crash/error remains retryable with bounded backoff; no identifiers logged', async () => {
  const transitions: unknown[][] = [];
  await runLifecycleBatch(
    {
      claim: () => Promise.resolve([work]),
      finish: (_w, ...args) => {
        transitions.push(args);
        return Promise.resolve(true);
      },
    },
    'stripe_cleanup',
    () => Promise.reject(new Error('private payload should not persist'))
  );
  assertEquals(transitions, [['retryable', 'worker_failure', 60]]);
});
Deno.test('Preserved historical provider identifiers do not authorize cancellation', async () => {
  let calls = 0;
  const error = await assertRejects(
    () =>
      executeProviderCleanup(
        { ...work, action: 'review_only' },
        {
          verifyFinancialState: () => Promise.resolve(),
          validate: () => Promise.resolve(true),
          removeDiscordRoles: () => Promise.resolve(),
          stripe: () => {
            calls++;
            return Promise.resolve({ id: 'sub_fake', status: 'active' });
          },
        }
      ),
    ProviderFailure
  );
  assertEquals(error.retryable, false);
  assertEquals(calls, 0);
});
Deno.test(
  'Stripe staging adapter rejects live keys and pins request idempotency/API version',
  async () => {
    const { stripeTestTransport } = await import('./provider-cleanup.ts');
    const { assertThrows } = await import('jsr:@std/assert@1');
    assertThrows(() => stripeTestTransport('sk_live_synthetic'), Error);
    let request: RequestInit | undefined;
    const client = stripeTestTransport('sk_test_synthetic', (_url, init) => {
      request = init;
      return Promise.resolve(Response.json({ id: 'sub_synthetic' }));
    });
    await client('/subscriptions/sub_synthetic', 'POST', 'cancel_at_period_end=true', 'stable-key');
    const headers = new Headers(request?.headers);
    assertEquals(headers.get('Idempotency-Key'), 'stable-key');
    assertEquals(headers.get('Stripe-Version'), '2024-06-20');
  }
);
Deno.test('Customer cancellation keys are independent for each subscription', async () => {
  const keys: string[] = [];
  const result = await executeProviderCleanup(
    { ...work, resource_id: 'cus_synthetic' },
    {
      verifyFinancialState: () => Promise.resolve(),
      validate: () => Promise.resolve(true),
      removeDiscordRoles: () => Promise.resolve(),
      stripe: (path, method, _body, key) => {
        if (path.startsWith('/subscriptions?'))
          return Promise.resolve({ data: [{ id: 'sub_one' }, { id: 'sub_two' }], has_more: false });
        if (method === 'POST') keys.push(key!);
        return Promise.resolve({ id: path.split('/').at(-1), status: 'active' });
      },
    }
  );
  assertEquals(result.state, 'waiting');
  assertEquals(keys, ['deletion-synthetic-task-sub_one', 'deletion-synthetic-task-sub_two']);
});
