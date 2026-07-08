import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { ApiGatewayRateLimiter } from '../index';
import { isKnownTier, TIER_LIMITS, UPGRADE_URL } from '../limits';
import { deleteMemoryCache } from '../utils/memory-cache';
import type { Env } from '../types';

const DAY_MS = 86400000;

const makeState = () => {
  const store = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (key: string, value: unknown) => {
        store.set(key, value);
      },
      getAlarm: async () => alarm,
      setAlarm: async (at: number) => {
        alarm = at;
      },
      deleteAll: async () => {
        store.clear();
        alarm = null;
      },
    },
  } as unknown as DurableObjectState;
};

const limiterRequest = (body: Record<string, unknown>) =>
  new Request('https://rate-limit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

type LimiterCall = { key: string; body: Record<string, unknown> };

const makeCapturingLimiter = (
  calls: LimiterCall[],
  respond: (call: LimiterCall) => { allowed: boolean; remaining: number; resetAt: number }
) =>
  ({
    idFromName: (name: string) => name,
    get: (id: unknown) => ({
      fetch: async (_url: string, init?: RequestInit) => {
        const call: LimiterCall = { key: String(id), body: JSON.parse(String(init?.body || '{}')) };
        calls.push(call);
        return new Response(JSON.stringify(respond(call)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    }),
  }) as unknown as Env['API_GATEWAY_LIMITER'];

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const makeFetchMock = ({
  userId,
  supporter,
  rpcCalls,
}: {
  userId: string;
  supporter?: { tier: string; status: string; expires_at?: string | null };
  rpcCalls?: Array<Record<string, unknown>>;
}) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/rest/v1/api_tokens')) {
      return jsonResponse([
        {
          token_id: 'token-1',
          user_id: userId,
          token_hash: 'hash',
          permissions: ['GP', 'WP'],
          game_mode: 'pvp',
          note: 'test',
          is_active: true,
          usage_count: 0,
          expires_at: null,
        },
      ]);
    }
    if (url.includes('/rest/v1/supporters')) {
      return jsonResponse(supporter ? [supporter] : []);
    }
    if (url.includes('/rest/v1/rpc/record_api_usage')) {
      rpcCalls?.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
      return jsonResponse({ ok: true });
    }
    if (url.includes('/rest/v1/rpc/increment_token_usage')) {
      return jsonResponse({ ok: true });
    }
    if (url.includes('/rest/v1/user_progress')) {
      return jsonResponse([
        { user_id: userId, game_edition: 1, pvp_data: { taskCompletions: {} }, pve_data: null },
      ]);
    }
    return new Response('Not Found', { status: 404 });
  });

const buildRequest = (path: string, init?: RequestInit) =>
  new Request(`https://api.tarkovtracker.org${path}`, init);

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ApiGatewayRateLimiter durable object', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('anchors utc-day windows to the next UTC midnight', async () => {
    const limiter = new ApiGatewayRateLimiter(makeState());
    const expectedReset = Math.floor(Date.now() / DAY_MS) * DAY_MS + DAY_MS;
    const first = await limiter.fetch(
      limiterRequest({ limit: 2, windowSec: 86400, anchor: 'utc-day' })
    );
    const firstBody = (await first.json()) as { allowed: boolean; resetAt: number };
    expect(firstBody.allowed).toBe(true);
    expect(firstBody.resetAt).toBe(expectedReset);
    await limiter.fetch(limiterRequest({ limit: 2, windowSec: 86400, anchor: 'utc-day' }));
    const third = await limiter.fetch(
      limiterRequest({ limit: 2, windowSec: 86400, anchor: 'utc-day' })
    );
    const thirdBody = (await third.json()) as { allowed: boolean; resetAt: number };
    expect(thirdBody.allowed).toBe(false);
    expect(thirdBody.resetAt).toBe(expectedReset);
  });

  it('resets utc-day counters after midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T23:59:30Z'));
    const limiter = new ApiGatewayRateLimiter(makeState());
    const payload = { limit: 1, windowSec: 86400, anchor: 'utc-day' };
    const first = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
    };
    expect(first.allowed).toBe(true);
    const blocked = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
    };
    expect(blocked.allowed).toBe(false);
    vi.setSystemTime(new Date('2026-07-06T00:00:01Z'));
    const afterMidnight = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
      resetAt: number;
    };
    expect(afterMidnight.allowed).toBe(true);
    expect(afterMidnight.resetAt).toBe(Date.parse('2026-07-07T00:00:00Z'));
  });

  it('sliding mode frees capacity as old requests age out', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
    const limiter = new ApiGatewayRateLimiter(makeState());
    const payload = { limit: 3, windowSec: 60, mode: 'sliding' };
    for (let i = 0; i < 3; i++) {
      const res = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
        allowed: boolean;
      };
      expect(res.allowed).toBe(true);
    }
    const blocked = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
    };
    expect(blocked.allowed).toBe(false);
    vi.setSystemTime(new Date('2026-07-05T12:00:30Z'));
    const stillBlocked = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
    };
    expect(stillBlocked.allowed).toBe(false);
    vi.setSystemTime(new Date('2026-07-05T12:01:01Z'));
    const allowedAgain = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
      remaining: number;
    };
    expect(allowedAgain.allowed).toBe(true);
  });

  it('refunds a consumed fixed-window slot on demand', async () => {
    const limiter = new ApiGatewayRateLimiter(makeState());
    const payload = { limit: 2, windowSec: 86400, anchor: 'utc-day' };
    await limiter.fetch(limiterRequest(payload));
    await limiter.fetch(limiterRequest(payload));
    const blocked = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
    };
    expect(blocked.allowed).toBe(false);
    await limiter.fetch(limiterRequest({ refund: true }));
    const afterRefund = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
      remaining: number;
    };
    expect(afterRefund.allowed).toBe(true);
    expect(afterRefund.remaining).toBe(0);
  });

  it('does not refund across a UTC-day rollover when resetAt no longer matches', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T23:59:58Z'));
    const limiter = new ApiGatewayRateLimiter(makeState());
    const payload = { limit: 1, windowSec: 86400, anchor: 'utc-day' };
    const consumed = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
      resetAt: number;
    };
    expect(consumed.allowed).toBe(true);
    expect(consumed.resetAt).toBe(Date.parse('2026-07-06T00:00:00Z'));
    // Roll into the next UTC day and consume the new window's only slot.
    vi.setSystemTime(new Date('2026-07-06T00:00:02Z'));
    const newDay = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
      resetAt: number;
    };
    expect(newDay.allowed).toBe(true);
    expect(newDay.resetAt).toBe(Date.parse('2026-07-07T00:00:00Z'));
    // A delayed refund for the previous day must not steal the new day's slot.
    await limiter.fetch(limiterRequest({ refund: true, resetAt: consumed.resetAt }));
    const blocked = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
    };
    expect(blocked.allowed).toBe(false);
    vi.useRealTimers();
  });

  it('still refunds when resetAt matches the current window', async () => {
    const limiter = new ApiGatewayRateLimiter(makeState());
    const payload = { limit: 1, windowSec: 86400, anchor: 'utc-day' };
    const consumed = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
      resetAt: number;
    };
    expect(consumed.allowed).toBe(true);
    await limiter.fetch(limiterRequest({ refund: true, resetAt: consumed.resetAt }));
    const afterRefund = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
      remaining: number;
    };
    expect(afterRefund.allowed).toBe(true);
    expect(afterRefund.remaining).toBe(0);
  });

  it('keeps legacy fixed-window behavior for payloads without mode or anchor', async () => {
    const limiter = new ApiGatewayRateLimiter(makeState());
    const payload = { limit: 2, windowSec: 60 };
    const first = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
      remaining: number;
    };
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    await limiter.fetch(limiterRequest(payload));
    const blocked = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
      allowed: boolean;
    };
    expect(blocked.allowed).toBe(false);
  });
});

describe('tiered quotas in the worker', () => {
  beforeEach(() => {
    deleteMemoryCache('tier:user-free');
    deleteMemoryCache('tier:user-scav');
    deleteMemoryCache('tier:user-chad');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies free-tier daily and burst limits keyed by user id', async () => {
    const calls: LimiterCall[] = [];
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, () => ({
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 1000,
      })),
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free' }));
    const res = await worker.fetch(
      buildRequest('/token', { method: 'GET', headers: { Authorization: 'Bearer PVP_abc123' } }),
      env
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0].key).toBe('daily-read:user-free');
    expect(calls[0].body).toMatchObject({
      limit: TIER_LIMITS.free.readsPerDay,
      windowSec: 86400,
      anchor: 'utc-day',
    });
    expect(calls[1].key).toBe('burst-read:user-free');
    expect(calls[1].body).toMatchObject({
      limit: TIER_LIMITS.free.burstPerMinute,
      windowSec: 60,
      mode: 'sliding',
    });
  });

  it('applies paid-tier limits from the supporters table', async () => {
    const calls: LimiterCall[] = [];
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, () => ({
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 1000,
      })),
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
    };
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        userId: 'user-chad',
        supporter: { tier: 'chad', status: 'active', expires_at: null },
      })
    );
    const res = await worker.fetch(
      buildRequest('/token', { method: 'GET', headers: { Authorization: 'Bearer PVP_abc123' } }),
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe(String(TIER_LIMITS.chad.readsPerDay));
    expect(calls[0].body).toMatchObject({ limit: TIER_LIMITS.chad.readsPerDay });
    expect(calls[1].body).toMatchObject({ limit: TIER_LIMITS.chad.burstPerMinute });
  });

  it('returns an upgrade message when a free user exhausts the daily quota', async () => {
    const calls: LimiterCall[] = [];
    const rpcCalls: Array<Record<string, unknown>> = [];
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, (call) => ({
        allowed: !String(call.key).startsWith('daily-'),
        remaining: 0,
        resetAt: Date.now() + 1000,
      })),
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free', rpcCalls }));
    const res = await worker.fetch(
      buildRequest('/token', { method: 'GET', headers: { Authorization: 'Bearer PVP_abc123' } }),
      env
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain(UPGRADE_URL);
    expect(body.error).toContain('Daily read quota');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    await flushAsync();
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ p_user_id: 'user-free', p_throttled: 1, p_reads: 0 });
  });

  it('rejects inherited object keys as tiers', () => {
    expect(isKnownTier('__proto__')).toBe(false);
    expect(isKnownTier('constructor')).toBe(false);
    expect(isKnownTier('chad')).toBe(true);
  });

  it('refunds the daily slot and returns daily headers when burst throttles', async () => {
    const calls: LimiterCall[] = [];
    const burstResetAt = Date.now() + 30_000;
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, (call) => {
        if (call.body.refund === true) {
          return { allowed: true, remaining: 0, resetAt: burstResetAt };
        }
        if (String(call.key).startsWith('burst-')) {
          return { allowed: false, remaining: 0, resetAt: burstResetAt };
        }
        return { allowed: true, remaining: 5, resetAt: Date.now() + 1000 };
      }),
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free' }));
    const res = await worker.fetch(
      buildRequest('/token', { method: 'GET', headers: { Authorization: 'Bearer PVP_abc123' } }),
      env
    );
    expect(res.status).toBe(429);
    // X-RateLimit-* reflects the daily quota; remaining includes the refunded slot.
    expect(res.headers.get('X-RateLimit-Limit')).toBe(String(TIER_LIMITS.free.readsPerDay));
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('6');
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(31);
    await flushAsync();
    const refunds = calls.filter((call) => call.body.refund === true);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].key).toBe('daily-read:user-free');
  });

  it('records successful usage through the record_api_usage rpc', async () => {
    const calls: LimiterCall[] = [];
    const rpcCalls: Array<Record<string, unknown>> = [];
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, () => ({
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 1000,
      })),
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free', rpcCalls }));
    const res = await worker.fetch(
      buildRequest('/token', { method: 'GET', headers: { Authorization: 'Bearer PVP_abc123' } }),
      env
    );
    expect(res.status).toBe(200);
    await flushAsync();
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({
      p_user_id: 'user-free',
      p_token_id: 'token-1',
      p_tier: 'free',
      p_reads: 1,
      p_writes: 0,
      p_throttled: 0,
    });
  });
});
