import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { stub } from 'jsr:@std/testing@1.0.19/mock';
const userId = '00000000-0000-0000-0000-000000009501';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
Deno.test(
  'account-delete checks Stripe before claiming jobs, transferring teams or deleting Auth',
  async () => {
    let handler: (req: Request) => Promise<Response>;
    let subscriptionStatus = 'active';
    let claims = 0;
    let deletes = 0;
    let clears = 0;
    let teamReads = 0;
    let clearanceAllowed = true;
    const env = stub(Deno.env, 'get', (name) =>
      name === 'SUPABASE_URL' ? 'https://supabase.invalid' : 'isolated-test-key'
    );
    const serve = stub(Deno, 'serve', ((callback: typeof handler) => {
      handler = callback;
      return {};
    }) as typeof Deno.serve);
    const fetchStub = stub(
      globalThis,
      'fetch',
      (input: string | URL | Request, init?: RequestInit) => {
        const req = new Request(input, init);
        const url = new URL(req.url);
        if (url.hostname === 'api.stripe.com')
          return Promise.resolve(
            json(
              { id: 'sub_test', status: subscriptionStatus },
              subscriptionStatus === 'outage' ? 503 : 200
            )
          );
        if (url.pathname === '/auth/v1/user') {
          if (req.method === 'DELETE') deletes++;
          return Promise.resolve(
            json({ id: userId, email: 'test@example.invalid', identities: [] })
          );
        }
        if (url.pathname.endsWith('/consume_account_deletion_attempt'))
          return Promise.resolve(json([{ allowed: true }]));
        if (url.pathname.endsWith('/claim_account_deletion_job')) {
          claims++;
          return Promise.resolve(
            json([{ claimed: true, status: 'in_progress', claim_token: crypto.randomUUID() }])
          );
        }
        if (url.pathname.endsWith('/clear_ended_deletion_subscription')) {
          clears++;
          return Promise.resolve(json(clearanceAllowed));
        }
        if (url.pathname.endsWith('/supporters'))
          return Promise.resolve(
            json([{ stripe_subscription_id: 'sub_test', stripe_customer_id: null }])
          );
        if (url.pathname.endsWith('/account_billing_subscriptions'))
          return Promise.resolve(
            new Response('[]', {
              headers: { 'content-type': 'application/json', 'content-range': '*/0' },
            })
          );
        if (url.pathname.endsWith('/teams')) {
          teamReads++;
          return Promise.resolve(json([]));
        }
        if (url.pathname.startsWith('/auth/v1/admin/users/')) {
          deletes++;
          return Promise.resolve(json({ user: { id: userId } }));
        }
        if (url.pathname.endsWith('/account_deletion_jobs'))
          return Promise.resolve(json([{ user_id: userId }]));
        if (req.method === 'DELETE') return Promise.resolve(json(null));
        throw new Error(`Unexpected test request ${req.method} ${url.pathname}`);
      }
    );
    const token =
      [
        { alg: 'HS256', typ: 'JWT' },
        { sub: userId, email: 'test@example.invalid', exp: Math.floor(Date.now() / 1000) + 3600 },
      ]
        .map((part) =>
          btoa(JSON.stringify(part)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_')
        )
        .join('.') + '.c2lnbmF0dXJl';
    const request = () =>
      new Request('https://function.invalid', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
    try {
      await import('../account-delete/index.ts');
      assertEquals((await handler!(request())).status, 409);
      assertEquals([claims, deletes, clears, teamReads], [0, 0, 0, 0]);
      subscriptionStatus = 'outage';
      assertEquals((await handler!(request())).status, 503);
      assertEquals([claims, deletes, clears, teamReads], [0, 0, 0, 0]);
      subscriptionStatus = 'canceled';
      assertEquals((await handler!(request())).status, 200);
      assertEquals([claims, deletes, clears, teamReads], [1, 1, 1, 1]);
      clearanceAllowed = false;
      assertEquals((await handler!(request())).status, 503);
      assertEquals([claims, deletes, clears, teamReads], [2, 1, 2, 1]);
    } finally {
      fetchStub.restore();
      serve.restore();
      env.restore();
    }
  }
);
