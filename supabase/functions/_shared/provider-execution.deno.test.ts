import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { withProviderBudget, providerExecutionFetch } from './provider-execution.ts';
import { ProviderFailure } from './provider-http.ts';
const request = async () => await providerExecutionFetch()('https://synthetic.invalid');
Deno.test('provider invocation budget refuses thirteenth HTTP call before transport', async () => {
  let requests = 0;
  const mock: typeof fetch = () => {
    requests++;
    return Promise.resolve(new Response('ok'));
  };
  await withProviderBudget(async () => {
    for (let n = 0; n < 12; n++) await request();
    await assertRejects(request, ProviderFailure, 'invocation_budget');
  }, mock);
  assertEquals(requests, 12);
});
Deno.test('concurrent provider budgets do not share counters or transports', async () => {
  const requests = [0, 0];
  await Promise.all(
    requests.map((_, index) =>
      withProviderBudget(
        async () => {
          for (let n = 0; n < 12; n++) await request();
        },
        () => {
          requests[index]++;
          return Promise.resolve(new Response('ok'));
        }
      )
    )
  );
  assertEquals(requests, [12, 12]);
});
