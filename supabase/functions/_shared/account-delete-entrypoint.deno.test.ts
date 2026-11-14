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
    let failures = 0;
    let attempts = 0;
    let stripeCalls = 0;
    let liveSession = true;
    let teamMode = 'none';
    let cleanupFails = false;
    let transfers = 0;
    let teamDeletes = 0;
    let ownsFailureTransition = true;
    const oauthTime = Math.floor(Date.now() / 1000) - 60;
    const env = stub(Deno.env, 'get', (name) => {
      if (name === 'SUPABASE_URL') return 'http://kong:8000';
      if (name === 'SUPABASE_AUTH_ISSUER') return 'https://supabase.invalid/auth/v1';
      return 'isolated-test-key';
    });
    const serve = stub(Deno, 'serve', ((callback: typeof handler) => {
      handler = callback;
      return {};
    }) as typeof Deno.serve);
    const fetchStub = stub(
      globalThis,
      'fetch',
      async (input: string | URL | Request, init?: RequestInit) => {
        const req = new Request(input, init);
        const url = new URL(req.url);
        if (url.hostname === 'api.stripe.com') {
          stripeCalls++;
          return Promise.resolve(
            json(
              { id: 'sub_test', status: subscriptionStatus },
              subscriptionStatus === 'outage' ? 503 : 200
            )
          );
        }
        if (url.pathname === '/auth/v1/user') {
          if (req.method === 'DELETE') deletes++;
          return Promise.resolve(
            json({ id: userId, email: 'test@example.invalid', identities: [] })
          );
        }
        if (url.pathname.endsWith('/consume_account_deletion_attempt')) {
          attempts++;
          return Promise.resolve(json([{ allowed: true }]));
        }
        if (url.pathname.endsWith('/claim_requested_account_deletion_job')) {
          const body = await req.json();
          assertEquals(body.p_user_id, userId);
          assertEquals(body.p_session_id, '00000000-0000-0000-0000-000000009502');
          assertEquals(body.p_authenticated_at, new Date(oauthTime * 1000).toISOString());
          if (!liveSession)
            return json({ code: '28000', message: 'account_deletion_recent_login_required' }, 403);
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
        if (url.pathname.endsWith('/transfer_team_ownership')) {
          transfers++;
          const body = await req.json();
          assertEquals(body.p_old_owner_id, userId);
          assertEquals(body.p_new_owner_id, 'oldest-member');
          return json(
            teamMode === 'transfer_error' ? { message: 'transfer unavailable' } : null,
            teamMode === 'transfer_error' ? 503 : 200
          );
        }
        if (url.pathname.endsWith('/team_memberships') && req.method === 'GET') {
          assertEquals(url.searchParams.get('order'), 'joined_at.asc');
          if (teamMode === 'members_error') return json({ message: 'members unavailable' }, 503);
          return json(
            ['transfer', 'transfer_error'].includes(teamMode)
              ? [{ user_id: 'oldest-member' }, { user_id: 'newer-member' }]
              : []
          );
        }
        if (url.pathname.endsWith('/teams') && req.method === 'DELETE') {
          teamDeletes++;
          return json(
            teamMode === 'delete_error' ? { message: 'team unavailable' } : null,
            teamMode === 'delete_error' ? 503 : 200
          );
        }
        if (url.pathname.endsWith('/teams')) {
          teamReads++;
          return Promise.resolve(json(teamMode === 'none' ? [] : [{ id: 'owned-team' }]));
        }
        if (url.pathname.startsWith('/auth/v1/admin/users/')) {
          deletes++;
          return Promise.resolve(json({ user: { id: userId } }));
        }
        if (url.pathname.endsWith('/account_deletion_jobs')) {
          if (req.method === 'PATCH') {
            const update = await req.json();
            if (update.last_error === 'billing_verification_changed') {
              assertEquals(update.status, 'failed');
              assertEquals(update.claim_token, null);
              failures++;
              if (!ownsFailureTransition) return json([]);
            }
          }
          return Promise.resolve(json([{ user_id: userId, attempts: 0, max_attempts: 5 }]));
        }
        if (req.method === 'DELETE') {
          if (cleanupFails && url.pathname.endsWith('/api_tokens'))
            return json({ message: 'cleanup unavailable' }, 503);
          return Promise.resolve(json(null));
        }
        throw new Error(`Unexpected test request ${req.method} ${url.pathname}`);
      }
    );
    const token = (overrides: Record<string, unknown>) =>
      [
        { alg: 'HS256', typ: 'JWT' },
        {
          sub: userId,
          email: 'test@example.invalid',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          iss: 'https://supabase.invalid/auth/v1',
          role: 'authenticated',
          aud: 'authenticated',
          is_anonymous: false,
          session_id: '00000000-0000-0000-0000-000000009502',
          amr: [{ method: 'oauth', timestamp: oauthTime }],
          ...overrides,
        },
      ]
        .map((part) =>
          btoa(JSON.stringify(part)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_')
        )
        .join('.') + '.c2lnbmF0dXJl';
    const request = (
      overrides: Record<string, unknown> = {},
      body: unknown = { action: 'delete_account' }
    ) =>
      new Request('https://function.invalid', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token(overrides)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    try {
      await import('../account-delete/index.ts');
      for (const overrides of [
        { amr: [{ method: 'oauth', timestamp: Math.floor(Date.now() / 1000) - 3600 }] },
        { amr: [{ method: 'token_refresh', timestamp: Math.floor(Date.now() / 1000) }] },
        { amr: [] },
        { session_id: null },
      ])
        assertEquals((await handler!(request(overrides))).status, 403);
      for (const body of [null, {}, [], { action: 'wrong' }]) {
        assertEquals((await handler!(request({}, body))).status, 400);
      }
      assertEquals([attempts, stripeCalls, claims, deletes, clears, teamReads], [0, 0, 0, 0, 0, 0]);
      const denied = await handler!(request());
      assertEquals(denied.status, 409);
      assertEquals((await denied.json()).error, 'account_deletion_subscription_active');
      assertEquals([claims, deletes, clears, teamReads], [0, 0, 0, 0]);
      subscriptionStatus = 'outage';
      const unavailable = await handler!(request());
      assertEquals(unavailable.status, 503);
      assertEquals((await unavailable.json()).error, 'account_deletion_billing_unavailable');
      assertEquals([claims, deletes, clears, teamReads], [0, 0, 0, 0]);
      subscriptionStatus = 'canceled';
      assertEquals(
        (
          await handler!(
            request(
              {},
              {
                action: 'delete_account',
                userId: 'another-user',
                sessionId: 'another-session',
                authenticatedAt: '2099-01-01T00:00:00Z',
              }
            )
          )
        ).status,
        200
      );
      assertEquals([claims, deletes, clears, teamReads], [1, 1, 1, 1]);
      clearanceAllowed = false;
      assertEquals((await handler!(request())).status, 503);
      assertEquals([claims, deletes, clears, teamReads], [2, 1, 2, 1]);
      assertEquals(failures, 1);
      ownsFailureTransition = false;
      const lostLease = await handler!(request());
      assertEquals(lostLease.status, 202);
      assertEquals((await lostLease.json()).cleanupScheduled, true);
      assertEquals([claims, deletes, clears, teamReads], [3, 1, 3, 1]);
      ownsFailureTransition = true;
      liveSession = false;
      assertEquals((await handler!(request())).status, 403);
      assertEquals([claims, deletes, clears, teamReads], [3, 1, 3, 1]);
      liveSession = true;
      clearanceAllowed = true;
      for (const [mode, expectedStatus, deleted] of [
        ['transfer', 200, 1],
        ['empty', 200, 1],
        ['members_error', 500, 0],
        ['transfer_error', 500, 0],
        ['delete_error', 500, 0],
      ] as const) {
        teamMode = mode;
        const before = deletes;
        assertEquals((await handler!(request())).status, expectedStatus, mode);
        assertEquals(deletes - before, deleted, mode);
      }
      assertEquals(transfers, 2);
      assertEquals(teamDeletes, 2);
      teamMode = 'none';
      cleanupFails = true;
      const scheduled = await handler!(request());
      assertEquals(scheduled.status, 202);
      assertEquals((await scheduled.json()).cleanupScheduled, true);
    } finally {
      fetchStub.restore();
      serve.restore();
      env.restore();
    }
  }
);
