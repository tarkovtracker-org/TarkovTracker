import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { DeliveryUnavailable, withLifecycleDelivery } from './lifecycle-delivery.ts';
Deno.test('disabled or unreadable delivery gate never starts work', async () => {
  for (const response of [
    { data: null, error: null },
    { data: null, error: 'unavailable' },
  ]) {
    let executed = false;
    await assertRejects(
      () =>
        withLifecycleDelivery(
          () => Promise.resolve(response),
          'deletion_intake',
          () => {
            executed = true;
            return Promise.resolve();
          }
        ),
      DeliveryUnavailable
    );
    assertEquals(executed, false);
  }
});
Deno.test('admitted work releases admission after success', async () => {
  const calls: string[] = [];
  const result = await withLifecycleDelivery(
    (name) => {
      calls.push(name);
      return Promise.resolve({
        data: name === 'begin_lifecycle_delivery' ? 'synthetic-invocation' : true,
        error: null,
      });
    },
    'provider_processing',
    () => Promise.resolve(42)
  );
  assertEquals(result, 42);
  assertEquals(calls, ['begin_lifecycle_delivery', 'finish_lifecycle_delivery']);
});
Deno.test('failed operation releases admission without hiding original failure', async () => {
  const calls: string[] = [];
  await assertRejects(
    () =>
      withLifecycleDelivery(
        (name) => {
          calls.push(name);
          return Promise.resolve({
            data: name === 'begin_lifecycle_delivery' ? 'synthetic-invocation' : true,
            error: null,
          });
        },
        'deletion_reconcile',
        () => Promise.reject(new Error('synthetic failure'))
      ),
    Error,
    'synthetic failure'
  );
  assertEquals(calls.length, 2);
});
Deno.test('admission transport rejection is temporary unavailability', async () => {
  await assertRejects(
    () =>
      withLifecycleDelivery(
        () => Promise.reject(new Error('offline')),
        'deletion_intake',
        () => Promise.resolve(1)
      ),
    DeliveryUnavailable
  );
});
Deno.test('release transport rejection preserves successful operation result', async () => {
  const result = await withLifecycleDelivery(
    (name) => {
      if (name === 'finish_lifecycle_delivery') return Promise.reject(new Error('offline'));
      return Promise.resolve({ data: 'synthetic', error: null });
    },
    'deletion_intake',
    () => Promise.resolve(7)
  );
  assertEquals(result, 7);
});
Deno.test('release transport rejection preserves original operation failure', async () => {
  await assertRejects(
    () =>
      withLifecycleDelivery(
        (name) => {
          if (name === 'finish_lifecycle_delivery') return Promise.reject(new Error('offline'));
          return Promise.resolve({ data: 'synthetic', error: null });
        },
        'deletion_intake',
        () => Promise.reject(new Error('original'))
      ),
    Error,
    'original'
  );
});
Deno.test('failed renewal aborts a provider request already in flight', async () => {
  const { withProviderBudget, providerExecutionFetch } = await import('./provider-execution.ts');
  let started = false;
  let renewed = false;
  const rpc = (name: string) => {
    if (name === 'begin_lifecycle_delivery')
      return Promise.resolve({ data: 'synthetic', error: null });
    if (name === 'renew_lifecycle_delivery') {
      renewed = true;
      return Promise.resolve({ data: false, error: null });
    }
    return Promise.resolve({ data: true, error: null });
  };
  const transport: typeof fetch = (_input, init) => {
    started = true;
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('provider aborted')), {
        once: true,
      });
    });
  };
  await assertRejects(
    () =>
      withLifecycleDelivery(rpc, 'provider_processing', () =>
        withProviderBudget(() => providerExecutionFetch()('https://synthetic.invalid'), transport)
      ),
    Error,
    'provider aborted'
  );
  assertEquals(started, true);
  assertEquals(renewed, true);
});
