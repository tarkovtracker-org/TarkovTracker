import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { stub } from 'jsr:@std/testing@1.0.19/mock';
Deno.test(
  'account-delete maintenance gate returns retryable 503 without backend mutations',
  async () => {
    let handler: ((req: Request) => Response | Promise<Response>) | undefined;
    let backendRequests = 0;
    const env = stub(Deno.env, 'get', (name: string) => {
      if (name === 'SUPABASE_URL') return 'https://account-delete-test.supabase.co';
      if (name === 'SUPABASE_SERVICE_ROLE_KEY' || name === 'SUPABASE_ANON_KEY') {
        return 'test-key';
      }
      return undefined;
    });
    const serve = stub(Deno, 'serve', ((callback: typeof handler) => {
      handler = callback;
      return {};
    }) as typeof Deno.serve);
    const network = stub(globalThis, 'fetch', () => {
      backendRequests += 1;
      return Promise.reject(new Error('Backend access is forbidden during maintenance'));
    });
    try {
      await import('../account-delete/index.ts');
      if (!handler) throw new Error('account-delete did not register its handler');
      const headers = {
        Origin: 'https://tarkovtracker.org',
        Authorization: 'Bearer test-session',
      };
      const response = await handler(
        new Request('https://example.test/account-delete', {
          method: 'POST',
          headers,
        })
      );
      assertEquals(response.status, 503);
      assertEquals(response.headers.get('Retry-After'), '60');
      assertEquals(response.headers.get('Access-Control-Allow-Origin'), headers.Origin);
      assertEquals(await response.json(), {
        error: 'Account deletion is temporarily unavailable. Please try again shortly.',
      });
      assertEquals(backendRequests, 0);
      const preflight = await handler(
        new Request('https://example.test/account-delete', {
          method: 'OPTIONS',
          headers,
        })
      );
      assertEquals(preflight.status, 200);
      const invalidMethod = await handler(
        new Request('https://example.test/account-delete', {
          method: 'GET',
          headers,
        })
      );
      assertEquals(invalidMethod.status, 405);
      assertEquals(backendRequests, 0);
    } finally {
      network.restore();
      serve.restore();
      env.restore();
    }
  }
);
