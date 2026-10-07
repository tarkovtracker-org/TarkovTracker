import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateToken } from '../auth';
import worker from '../index';
import { logger } from '../utils/logger';
import type { Env } from '../types';
const env = {
  SUPABASE_URL: 'https://supabase.example',
  SUPABASE_SERVICE_ROLE_KEY: 'secret-service-key',
} as Env;
const row = {
  token_id: 'token-id',
  user_id: 'user-id',
  permissions: ['GP'],
  game_mode: 'pvp',
  is_active: true,
  usage_count: 12,
  expires_at: null,
  note: 'private-note',
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function setup(
  rpc: () => Promise<Response>,
  patch = async () => new Response(null, { status: 204 }),
  lookup: unknown = [row]
) {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: vi.fn((promise: Promise<unknown>) => pending.push(promise)) };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return String(input).includes('/increment_token_usage') ? rpc() : json(null);
    }
    if (init?.method === 'PATCH') return patch();
    return json(lookup);
  });
  vi.stubGlobal('fetch', fetchMock);
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  return { pending, ctx, fetchMock, warn };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('token lifetime accounting', () => {
  it('counts a valid token later daily-throttled without waiting for accounting', async () => {
    let release!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const { ctx, pending } = setup(() => gate);
    const limiter = {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async () => json({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 }),
      }),
    } as unknown as Env['API_GATEWAY_LIMITER'];
    try {
      const response = await worker.fetch(
        new Request('https://api.tarkovtracker.org/token', {
          headers: { Authorization: 'Bearer PVP_private-token', 'User-Agent': 'TokenUsage/1.0' },
        }),
        { ...env, API_GATEWAY_LIMITER: limiter },
        ctx as unknown as ExecutionContext
      );
      expect(response.status).toBe(429);
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(pending).toHaveLength(2); // Lifetime increment plus daily throttle accounting.
    } finally {
      release(new Response(null, { status: 204 }));
      await Promise.all(pending);
    }
  });
  it('does not count a request denied by the pre-auth abuse gate', async () => {
    const { ctx, fetchMock } = setup(async () => json(null));
    const response = await worker.fetch(
      new Request('https://api.tarkovtracker.org/token', {
        headers: {
          Authorization: 'Bearer PVP_private-token',
          'User-Agent': 'TokenUsage/1.0',
          'CF-Connecting-IP': '192.0.2.1',
        },
      }),
      { ...env, API_ABUSE_LIMITER: { limit: async () => ({ success: false }) } },
      ctx as unknown as ExecutionContext
    );
    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
  it.each([
    ['invalid format', 'invalid', [row]],
    ['unknown token', 'PVP_private-token', []],
    ['inactive', 'PVP_private-token', [{ ...row, is_active: false }]],
    ['expired', 'PVP_private-token', [{ ...row, expires_at: '2000-01-01' }]],
    ['mode mismatch', 'PVE_private-token', [row]],
    ['permission denied', 'PVP_private-token', [{ ...row, permissions: [] }]],
  ])('does not count %s', async (_name, token, lookup) => {
    const { ctx, pending, fetchMock } = setup(async () => json(null), undefined, lookup);
    expect((await validateToken(env, token, 'GP', ctx)).valid).toBe(false);
    expect(pending).toHaveLength(0);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });
  it.each([
    [401, 'authorization'],
    [403, 'authorization'],
    [429, 'transient'],
    [500, 'transient'],
    [400, 'http_error'],
    [404, 'http_error'],
  ])('reports HTTP %s without fallback', async (status, outcome) => {
    const { ctx, pending, fetchMock, warn } = setup(async () => json({ code: 'secret' }, status));
    await validateToken(env, 'PVP_private-token', 'GP', ctx);
    await Promise.all(pending);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('token_usage_outcome', {
      operation: 'increment',
      outcome,
      status,
    });
  });
  it.each(['{', JSON.stringify({ code: 'PGRST202', detail: 'x'.repeat(1024) }), 'null'])(
    'rejects unconfirmed missing RPC body %s',
    async (body) => {
      const { ctx, pending, fetchMock, warn } = setup(
        async () => new Response(body, { status: 404 })
      );
      await validateToken(env, 'PVP_private-token', 'GP', ctx);
      await Promise.all(pending);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenLastCalledWith('token_usage_outcome', {
        operation: 'increment',
        outcome: 'malformed',
        status: 404,
      });
    }
  );
  it('handles ambiguous network failures without fallback or error payload logging', async () => {
    const { ctx, pending, fetchMock, warn } = setup(async () => {
      throw new Error('secret-service-key private-note');
    });
    await validateToken(env, 'PVP_private-token', 'GP', ctx);
    await Promise.all(pending);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('token_usage_outcome', {
      operation: 'increment',
      outcome: 'network_error',
    });
  });
  it.each(['http', 'network'])(
    'handles fallback %s failure inside the retained promise',
    async (failure) => {
      const { ctx, pending, warn } = setup(
        async () => json({ code: 'PGRST202' }, 404),
        async () => {
          if (failure === 'network') throw new Error('private-note');
          return json({ message: 'private-note' }, 503);
        }
      );
      await validateToken(env, 'PVP_private-token', 'GP', ctx);
      await expect(Promise.all(pending)).resolves.toEqual([undefined]);
      expect(warn).toHaveBeenLastCalledWith('token_usage_outcome', {
        operation: 'timestamp_fallback',
        outcome: failure === 'network' ? 'network_error' : 'transient',
        ...(failure === 'http' ? { status: 503 } : {}),
      });
    }
  );
  it('bounds a stalled increment to three seconds', async () => {
    vi.useFakeTimers();
    const { ctx, pending, fetchMock, warn } = setup(async () => json(null));
    fetchMock.mockImplementation(async (_input, init) => {
      if (!init?.method) return json([row]);
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    await validateToken(env, 'PVP_private-token', 'GP', ctx);
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all(pending);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('token_usage_outcome', {
      operation: 'increment',
      outcome: 'timeout',
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['fallback', 'error_body'])(
    'bounds a stalled %s and cleans up its timer',
    async (stage) => {
      vi.useFakeTimers();
      const { ctx, pending, warn, fetchMock } = setup(async () => json(null));
      fetchMock.mockImplementation(async (_input, init) => {
        if (!init?.method) return json([row]);
        if (stage === 'fallback' && init.method === 'POST') return json({ code: 'PGRST202' }, 404);
        if (stage === 'error_body') {
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              init.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
            },
          });
          return new Response(body, { status: 404 });
        }
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      });
      await validateToken(env, 'PVP_private-token', 'GP', ctx);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.all(pending);
      expect(warn).toHaveBeenLastCalledWith('token_usage_outcome', {
        operation: stage === 'fallback' ? 'timestamp_fallback' : 'increment',
        outcome: 'timeout',
      });
      expect(vi.getTimerCount()).toBe(0);
    }
  );
  it('owns accounting to completion even when called without a Worker context', async () => {
    let release!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    setup(() => gate);
    let settled = false;
    const validation = validateToken(env, 'PVP_private-token', 'GP').then((result) => {
      settled = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    release(new Response(null, { status: 204 }));
    expect((await validation).valid).toBe(true);
  });
  it('retains the increment without blocking validation', async () => {
    let release!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const { ctx, pending } = setup(() => gate);
    try {
      const result = await validateToken(env, 'PVP_private-token', 'GP', ctx);
      expect(result).toMatchObject({ valid: true, token: { usage_count: 12 } });
      expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    } finally {
      release(new Response(null, { status: 204 }));
      await Promise.all(pending);
    }
  });
  it('reports HTTP 503 and does not retry or fallback', async () => {
    const { ctx, pending, fetchMock, warn } = setup(async () =>
      json({ message: 'secret-service-key' }, 503)
    );
    expect((await validateToken(env, 'PVP_private-token', 'GP', ctx)).valid).toBe(true);
    await Promise.all(pending);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('token_usage_outcome', {
      operation: 'increment',
      outcome: 'transient',
      status: 503,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-service-key');
  });
  it('retains the confirmed-missing RPC timestamp fallback until completion', async () => {
    let release!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const { ctx, pending, fetchMock, warn } = setup(
      async () => json({ code: 'PGRST202' }, 404),
      () => gate
    );
    try {
      await validateToken(env, 'PVP_private-token', 'GP', ctx);
      expect(pending).toHaveLength(1);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      let settled = false;
      void pending[0].then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      const init = fetchMock.mock.calls[2][1];
      expect(JSON.parse(String(init?.body))).toEqual({ last_used_at: expect.any(String) });
    } finally {
      release(new Response(null, { status: 204 }));
      await Promise.all(pending);
    }
    expect(warn).toHaveBeenLastCalledWith('token_usage_outcome', {
      operation: 'timestamp_fallback',
      outcome: 'timestamp_only',
      status: 204,
    });
  });
});
