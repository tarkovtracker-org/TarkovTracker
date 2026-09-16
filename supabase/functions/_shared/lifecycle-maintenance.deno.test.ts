import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deletionMaintenance, stripeMaintenance } from './lifecycle-maintenance.ts';
Deno.test('deletion bridge is fixed maintenance without accepting work', async () => {
  const response = deletionMaintenance();
  assertEquals(response.status, 503);
  assertEquals((await response.json()).completed, false);
});
Deno.test('Stripe bridge rejects missing and malformed signatures', async () => {
  const handle = stripeMaintenance('synthetic-unit-only');
  assertEquals(
    (await handle(new Request('http://localhost', { method: 'POST', body: '{}' }))).status,
    401
  );
  assertEquals(
    (
      await handle(
        new Request('http://localhost', {
          method: 'POST',
          body: '{}',
          headers: { 'stripe-signature': 'invalid' },
        })
      )
    ).status,
    401
  );
});
Deno.test('missing bridge configuration never acknowledges work', async () => {
  const response = await stripeMaintenance(undefined)(
    new Request('http://localhost', { method: 'POST' })
  );
  assertEquals(response.status, 503);
  assertEquals((await response.json()).completed, false);
});
