import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { lifecycleWorkerHandler } from './lifecycle-worker-http.ts';
import { DeliveryUnavailable } from './lifecycle-delivery.ts';
const secret = 'synthetic-worker-secret-not-a-real-credential';
const url = 'http://localhost/lifecycle-worker?kind=stripe_cleanup';
Deno.test(
  'worker denies anon, user/admin JWT and missing configuration without invoking work',
  async () => {
    let calls = 0;
    const run = async () => {
      calls++;
    };
    for (const token of ['', 'Bearer synthetic-user-jwt', 'Bearer synthetic-admin-jwt']) {
      const response = await lifecycleWorkerHandler(
        secret,
        run
      )(new Request(url, { method: 'POST', headers: { authorization: token } }));
      assertEquals(response.status, 401);
    }
    const missing = await lifecycleWorkerHandler(
      undefined,
      run
    )(new Request(url, { method: 'POST', headers: { authorization: `Bearer ${secret}` } }));
    assertEquals(missing.status, 401);
    assertEquals(calls, 0);
  }
);
Deno.test(
  'worker authorized invocation has fixed kind and no caller batch or identity payload',
  async () => {
    const kinds: string[] = [];
    const handler = lifecycleWorkerHandler(secret, async (kind) => {
      kinds.push(kind);
      return { claimed: 1, advanced: 1 };
    });
    const headers = { authorization: `Bearer ${secret}` };
    assertEquals((await handler(new Request(url, { method: 'POST', headers }))).status, 200);
    assertEquals(
      (await handler(new Request(url, { method: 'POST', headers, body: '{"limit":1000}' }))).status,
      400
    );
    assertEquals(
      (
        await handler(
          new Request(url.replace('stripe_cleanup', 'account_delete'), { method: 'POST', headers })
        )
      ).status,
      400
    );
    assertEquals(kinds, ['stripe_cleanup']);
  }
);
Deno.test('quiesced worker returns intentional temporary unavailable', async () => {
  const handler = lifecycleWorkerHandler(secret, async () => {
    throw new DeliveryUnavailable();
  });
  const result = await handler(
    new Request(url, { method: 'POST', headers: { authorization: `Bearer ${secret}` } })
  );
  assertEquals(result.status, 503);
  assertEquals(result.headers.get('retry-after'), '60');
});
Deno.test(
  'worker authentication and disabled response through real local HTTP transport',
  async () => {
    let admitted = 0;
    const handler = lifecycleWorkerHandler(secret, () => {
      admitted++;
      return Promise.reject(new DeliveryUnavailable());
    });
    const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, handler);
    try {
      const endpoint = `http://127.0.0.1:${server.addr.port}/?kind=stripe_cleanup`;
      const denied = await fetch(endpoint, { method: 'POST' });
      assertEquals(denied.status, 401);
      await denied.body?.cancel();
      const paused = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      });
      assertEquals(paused.status, 503);
      await paused.body?.cancel();
      assertEquals(admitted, 1);
    } finally {
      await server.shutdown();
    }
  }
);
Deno.test('worker rejects prototype names before admission', async () => {
  let calls = 0;
  const handler = lifecycleWorkerHandler(secret, () => {
    calls++;
    return Promise.resolve({});
  });
  for (const kind of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const response = await handler(
      new Request(`http://localhost/?kind=${kind}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      })
    );
    assertEquals(response.status, 400);
  }
  assertEquals(calls, 0);
});
