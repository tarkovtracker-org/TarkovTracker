import { assertEquals, assertExists } from 'jsr:@std/assert@1.0.19';
import { stub } from 'jsr:@std/testing@1.0.19/mock';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
const userId = '00000000-0000-0000-0000-000000001491';
const json = (value: unknown, status = 200) => Response.json(value, { status });
Deno.test('admin-cache-purge reports the cache and audit outcomes', async (t) => {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let isAdmin = true;
  let purgeSucceeds = true;
  let audit: 'saved' | 'error' | 'reject' = 'saved';
  const operations: string[] = [];
  const env = stub(Deno.env, 'get', (key) => {
    if (key === 'SUPABASE_URL') return 'https://supabase.invalid';
    return 'isolated-test-value';
  });
  const serve = stub(Deno, 'serve', ((callback: typeof handler) => {
    handler = callback;
    return {};
  }) as typeof Deno.serve);
  const fetchMock = stub(globalThis, 'fetch', async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    switch (url.href) {
      case 'https://supabase.invalid/auth/v1/user':
        operations.push('authenticate');
        return json({ id: userId });
      case 'https://api.cloudflare.com/client/v4/zones/isolated-test-value/purge_cache':
        operations.push('purge');
        assertEquals(await req.json(), { purge_everything: true });
        return json({ success: purgeSucceeds, result: { id: 'mock-purge' } });
      case 'https://supabase.invalid/rest/v1/admin_audit_log': {
        operations.push('audit');
        const record = await req.json();
        assertEquals(record.admin_user_id, userId);
        assertEquals(record.action, 'cache_purge');
        assertEquals(record.details.success, purgeSucceeds);
        return audit === 'error'
          ? json({ message: 'private audit detail' }, 503)
          : new Response(null, { status: 201 });
      }
    }
    if (url.origin === 'https://supabase.invalid' && url.pathname === '/rest/v1/user_system') {
      operations.push('authorize');
      assertEquals(url.searchParams.get('user_id'), `eq.${userId}`);
      return json({ is_admin: isAdmin });
    }
    throw new Error(`Unexpected request to ${url.href}`);
  });
  const originalFrom = SupabaseClient.prototype.from;
  const from = stub(SupabaseClient.prototype, 'from', function (
    this: SupabaseClient,
    relation: string
  ) {
    // PostgREST converts transport errors into an error result by default.
    if (relation === 'admin_audit_log' && audit === 'reject') {
      return {
        insert: () => {
          operations.push('audit');
          return Promise.reject(new Error('private audit detail'));
        },
      };
    }
    return originalFrom.call(this, relation);
  } as typeof originalFrom);
  const errorLog = stub(console, 'error', () => {});
  const token =
    [
      { alg: 'HS256', typ: 'JWT' },
      { sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 },
    ]
      .map((part) => btoa(JSON.stringify(part)).replace(/=+$/, ''))
      .join('.') + '.c2lnbmF0dXJl';
  const request = (authenticated = true) =>
    new Request('https://function.invalid', {
      method: 'POST',
      headers: authenticated ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ purgeType: 'all' }),
    });
  try {
    await import('./index.ts');
    assertExists(handler);
    const invoke = handler;
    await t.step('requires authentication and admin status before side effects', async () => {
      assertEquals((await invoke(request(false))).status, 401);
      assertEquals(operations.splice(0), []);
      isAdmin = false;
      assertEquals((await invoke(request())).status, 403);
      assertEquals(operations.splice(0), ['authenticate', 'authorize']);
      isAdmin = true;
    });
    await t.step('records a successful purge exactly once', async () => {
      const response = await invoke(request());
      assertEquals(operations.splice(0), ['authenticate', 'authorize', 'purge', 'audit']);
      assertEquals(response.status, 200);
      const body = await response.json();
      assertEquals(body.success, true);
      assertEquals(body.auditWriteFailed, undefined);
    });
    for (const failure of ['error', 'reject'] as const) {
      const outcome = failure === 'error' ? 'returns an error' : 'rejects';
      await t.step(`reports a partial failure when the audit insert ${outcome}`, async () => {
        audit = failure;
        const logsBefore = errorLog.calls.length;
        const response = await invoke(request());
        assertEquals(operations.splice(0), ['authenticate', 'authorize', 'purge', 'audit']);
        assertEquals(response.status, 200);
        const body = await response.json();
        assertEquals(body.success, true);
        assertEquals(body.auditWriteFailed, true);
        assertEquals(JSON.stringify(body).includes('private audit detail'), false);
        assertEquals(errorLog.calls.length, logsBefore + 1);
      });
    }
    await t.step(
      'keeps the purge error when Cloudflare and the audit write both fail',
      async () => {
        purgeSucceeds = false;
        audit = 'error';
        const response = await invoke(request());
        assertEquals(operations.splice(0), ['authenticate', 'authorize', 'purge', 'audit']);
        assertEquals(response.status, 502);
        assertEquals(await response.json(), {
          error: 'cache_purge_failed',
          code: 'cache_purge_failed',
        });
      }
    );
  } finally {
    errorLog.restore();
    from.restore();
    fetchMock.restore();
    serve.restore();
    env.restore();
  }
});
