/** Real PostgREST inbox with a mocked Stripe transport. Opt-in, fixed disposable target only. */
import { assertEquals } from 'jsr:@std/assert@1';
const enabled = Deno.env.get('TT_B_LOCAL_AUTH_TEST') === '1';
Deno.test({
  name: 'Signed webhook persists retryable lookup failures and idempotent completed absence',
  ignore: !enabled,
  fn: async () => {
    const config = JSON.parse(await Deno.readTextFile('/tmp/tt-b-status.json'));
    assertEquals(config.API_URL, 'http://127.0.0.1:59321');
    assertEquals(config.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:59322/postgres');
    const env: Record<string, string> = {
      SUPABASE_URL: config.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: config.SERVICE_ROLE_KEY,
      STRIPE_SECRET_KEY: 'sk_test_synthetic',
      STRIPE_WEBHOOK_SECRET: 'whsec_synthetic',
    };
    for (const tier of ['SCAV', 'TIMMY', 'CHAD'])
      for (const term of ['MONTHLY', '6MONTH', 'YEARLY'])
        env[`STRIPE_PRICE_${tier}_${term}`] = `price_${tier}_${term}`;
    for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
    const original = globalThis.fetch;
    let mode: number | string = 503;
    globalThis.fetch = (input, init) => {
      const url = String(input);
      if (url.startsWith('https://api.stripe.com/')) {
        if (mode === 'network')
          return Promise.reject(new TypeError('synthetic connection failure'));
        if (mode === 'timeout')
          return Promise.reject(new DOMException('synthetic timeout', 'AbortError'));
        if (mode === 'malformed')
          return Promise.resolve(Response.json({ id: 'ch_synthetic', customer: 123 }));
        if (typeof mode === 'number') return Promise.resolve(Response.json({}, { status: mode }));
        return Promise.resolve(Response.json({ id: 'ch_synthetic', customer: null }));
      }
      if (!url.startsWith(config.API_URL)) throw new Error('Unexpected network destination');
      return original(input, init);
    };
    try {
      const { handleStripeWebhook } = await import('./index.ts');
      const request = async (id: string, valid = true) => {
        const body = JSON.stringify({
          id,
          type: 'charge.dispute.created',
          data: { object: { id: 'dp_synthetic', charge: 'ch_synthetic' } },
        });
        const timestamp = Math.floor(Date.now() / 1000);
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode('whsec_synthetic'),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signature = [
          ...new Uint8Array(
            await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
          ),
        ]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('');
        return handleStripeWebhook(
          new Request('http://local/stripe-webhook', {
            method: 'POST',
            body,
            headers: { 'stripe-signature': valid ? `t=${timestamp},v1=${signature}` : 'invalid' },
          })
        );
      };
      const invalid = await request('evt_' + crypto.randomUUID(), false);
      assertEquals(invalid.status, 401);
      await invalid.text();
      for (mode of [429, 500, 503, 'network', 'timeout', 'malformed']) {
        const id = 'evt_' + crypto.randomUUID();
        const first = await request(id);
        assertEquals(first.status, 503);
        assertEquals((await first.json()).completed, false);
        const duplicate = await request(id);
        assertEquals(duplicate.status, 503);
        await duplicate.text();
      }
      mode = 'absent';
      const id = 'evt_' + crypto.randomUUID();
      const complete = await request(id);
      assertEquals(complete.status, 200);
      assertEquals((await complete.json()).completed, true);
      const duplicate = await request(id);
      assertEquals(duplicate.status, 200);
      assertEquals((await duplicate.json()).completed, true);
    } finally {
      globalThis.fetch = original;
      for (const key of Object.keys(env)) Deno.env.delete(key);
    }
  },
});
