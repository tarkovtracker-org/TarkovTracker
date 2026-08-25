import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { ApiGatewayRateLimiter, type RateLimitState } from '../index';
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
      deleteAlarm: async () => {
        alarm = null;
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
const TEST_IP_HASH_SECRET = 'test-ip-hash-secret';
const expectedIpHash = async (ip: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};
const buildRequest = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'TestClient/1.0 (+https://example.com)');
  }
  return new Request(`https://api.tarkovtracker.org${path}`, { ...init, headers });
};
const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));
describe('ApiGatewayRateLimiter durable object', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it.each([
    ['malformed JSON', '{'],
    ['null JSON', 'null'],
    ['array JSON', '[]'],
    ['non-positive limit', JSON.stringify({ limit: 0, windowSec: 60 })],
    ['non-positive window', JSON.stringify({ limit: 1, windowSec: 0 })],
    ['unsupported anchor', JSON.stringify({ limit: 1, windowSec: 60, anchor: 'sliding' })],
    ['boolean limit', JSON.stringify({ limit: true, windowSec: 60 })],
    ['string limit', JSON.stringify({ limit: '5', windowSec: 60 })],
    ['single-element array limit', JSON.stringify({ limit: [5], windowSec: 60 })],
  ])('rejects %s without touching storage', async (_name, body) => {
    const state = makeState();
    const getSpy = vi.spyOn(state.storage, 'get');
    const limiter = new ApiGatewayRateLimiter(state, {} as Env);
    const response = await limiter.fetch(
      new Request('https://rate-limit', { method: 'POST', body })
    );
    expect(response.status).toBe(400);
    expect(getSpy).not.toHaveBeenCalled();
  });
  it('rejects unsupported methods without touching storage', async () => {
    const state = makeState();
    const getSpy = vi.spyOn(state.storage, 'get');
    const limiter = new ApiGatewayRateLimiter(state, {} as Env);
    const response = await limiter.fetch(new Request('https://rate-limit'));
    expect(response.status).toBe(405);
    expect(getSpy).not.toHaveBeenCalled();
  });
  it('anchors utc-day windows to the next UTC midnight', async () => {
    const limiter = new ApiGatewayRateLimiter(makeState(), {} as Env);
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
    const limiter = new ApiGatewayRateLimiter(makeState(), {} as Env);
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
  it('keeps legacy fixed-window behavior for payloads without mode or anchor', async () => {
    const limiter = new ApiGatewayRateLimiter(makeState(), {} as Env);
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
  it('treats expired fixed-window persisted state as absent on load', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const state = makeState();
      await state.storage.put('state', {
        count: 1,
        resetAt: Date.parse('2026-07-05T11:00:00Z'),
        windowSec: 3600,
        anchor: 'utc-day',
      });
      const limiter = new ApiGatewayRateLimiter(state, {} as Env);
      const res = (await (
        await limiter.fetch(limiterRequest({ limit: 1, windowSec: 86400, anchor: 'utc-day' }))
      ).json()) as { allowed: boolean; remaining: number };
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('treats legacy sliding-window state as a config change and starts a fresh fixed window', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const state = makeState();
      await state.storage.put('state', {
        count: 5,
        resetAt: Date.parse('2026-07-05T11:00:00Z'),
        windowSec: 60,
        mode: 'sliding',
        timestamps: [Date.parse('2026-07-05T10:59:00Z')],
      });
      const limiter = new ApiGatewayRateLimiter(state, {} as Env);
      const res = (await (
        await limiter.fetch(limiterRequest({ limit: 1, windowSec: 86400, anchor: 'utc-day' }))
      ).json()) as { allowed: boolean; resetAt: number };
      expect(res.allowed).toBe(true);
      expect(res.resetAt).toBe(Date.parse('2026-07-06T00:00:00Z'));
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not re-read storage on repeated calls within one object lifetime', async () => {
    const state = makeState();
    const getSpy = vi.spyOn(state.storage, 'get');
    const limiter = new ApiGatewayRateLimiter(state, {} as Env);
    await limiter.fetch(limiterRequest({ limit: 5, windowSec: 60 }));
    const firstCallCount = getSpy.mock.calls.length;
    await limiter.fetch(limiterRequest({ limit: 5, windowSec: 60 }));
    expect(getSpy.mock.calls.length).toBe(firstCallCount);
  });
  it('does not call setAlarm when retain is set', async () => {
    const state = makeState();
    const setAlarmSpy = vi.spyOn(state.storage, 'setAlarm');
    const limiter = new ApiGatewayRateLimiter(state, {} as Env);
    await limiter.fetch(
      limiterRequest({ limit: 5, windowSec: 60, anchor: 'utc-day', retain: true })
    );
    await limiter.fetch(limiterRequest({ limit: 5, windowSec: 60, retain: true }));
    expect(setAlarmSpy).not.toHaveBeenCalled();
  });
  it('schedules cleanup alarm by default when retain is omitted', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const state = makeState();
      const setAlarmSpy = vi.spyOn(state.storage, 'setAlarm');
      const limiter = new ApiGatewayRateLimiter(state, {} as Env);
      const res = await limiter.fetch(limiterRequest({ limit: 5, windowSec: 60 }));
      const body = (await res.json()) as { allowed: boolean; resetAt: number };
      expect(body.allowed).toBe(true);
      expect(setAlarmSpy).toHaveBeenCalledTimes(1);
      expect(setAlarmSpy).toHaveBeenCalledWith(body.resetAt + 1000);
      const stored = await state.storage.get<RateLimitState>('state');
      expect(stored?.ephemeral).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it('re-stamps ephemeral on fixed-window increment of pre-flag stored state', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const state = makeState();
      const resetAt = Date.parse('2026-07-05T12:01:00Z');
      await state.storage.put('state', {
        count: 1,
        resetAt,
        windowSec: 60,
      });
      const limiter = new ApiGatewayRateLimiter(state, {} as Env);
      const res = await limiter.fetch(limiterRequest({ limit: 5, windowSec: 60 }));
      const body = (await res.json()) as { allowed: boolean; resetAt: number };
      expect(body.allowed).toBe(true);
      const stored = await state.storage.get<RateLimitState>('state');
      expect(stored?.ephemeral).toBe(true);
      expect(stored?.count).toBe(2);
      expect(await state.storage.getAlarm()).toBe(body.resetAt + 1000);
    } finally {
      vi.useRealTimers();
    }
  });
  it('alarm reschedules when ephemeral state is still active', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const state = makeState();
      const resetAt = Date.parse('2026-07-05T12:01:00Z');
      await state.storage.put('state', {
        count: 1,
        resetAt,
        windowSec: 60,
        ephemeral: true,
      });
      await state.storage.setAlarm(resetAt + 1000);
      const setAlarmSpy = vi.spyOn(state.storage, 'setAlarm');
      const limiter = new ApiGatewayRateLimiter(state, {} as Env);
      await limiter.alarm();
      expect(setAlarmSpy).toHaveBeenCalledWith(resetAt + 1000);
      const stored = await state.storage.get<RateLimitState>('state');
      expect(stored).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
  it('alarm deletes storage when ephemeral state is expired', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:02:00Z'));
      const state = makeState();
      const resetAt = Date.parse('2026-07-05T12:00:00Z');
      await state.storage.put('state', {
        count: 1,
        resetAt,
        windowSec: 60,
        ephemeral: true,
      });
      const deleteAlarmSpy = vi.spyOn(state.storage, 'deleteAlarm');
      const deleteAllSpy = vi.spyOn(state.storage, 'deleteAll');
      const setAlarmSpy = vi.spyOn(state.storage, 'setAlarm');
      const limiter = new ApiGatewayRateLimiter(state, {} as Env);
      await limiter.alarm();
      expect(deleteAlarmSpy).toHaveBeenCalledTimes(1);
      expect(deleteAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteAlarmSpy.mock.invocationCallOrder[0]).toBeLessThan(
        deleteAllSpy.mock.invocationCallOrder[0]
      );
      expect(setAlarmSpy).not.toHaveBeenCalled();
      const stored = await state.storage.get<RateLimitState>('state');
      expect(stored).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
  it('alarm does not reschedule for non-ephemeral state (transitional drain)', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:30Z'));
      const state = makeState();
      const resetAt = Date.parse('2026-07-05T12:01:00Z');
      await state.storage.put('state', {
        count: 1,
        resetAt,
        windowSec: 60,
      });
      const setAlarmSpy = vi.spyOn(state.storage, 'setAlarm');
      const deleteAlarmSpy = vi.spyOn(state.storage, 'deleteAlarm');
      const deleteAllSpy = vi.spyOn(state.storage, 'deleteAll');
      const limiter = new ApiGatewayRateLimiter(state, {} as Env);
      await limiter.alarm();
      expect(setAlarmSpy).not.toHaveBeenCalled();
      expect(deleteAlarmSpy).not.toHaveBeenCalled();
      expect(deleteAllSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('alarm deletes storage for expired non-ephemeral state', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:02:00Z'));
      const state = makeState();
      const resetAt = Date.parse('2026-07-05T12:00:00Z');
      await state.storage.put('state', {
        count: 1,
        resetAt,
        windowSec: 60,
      });
      const deleteAlarmSpy = vi.spyOn(state.storage, 'deleteAlarm');
      const deleteAllSpy = vi.spyOn(state.storage, 'deleteAll');
      const limiter = new ApiGatewayRateLimiter(state, {} as Env);
      await limiter.alarm();
      expect(deleteAlarmSpy).toHaveBeenCalledTimes(1);
      expect(deleteAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteAlarmSpy.mock.invocationCallOrder[0]).toBeLessThan(
        deleteAllSpy.mock.invocationCallOrder[0]
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('daily quota and abuse gate', () => {
  beforeEach(() => {
    deleteMemoryCache('tier:user-free');
    deleteMemoryCache('tier:user-scav');
    deleteMemoryCache('tier:user-chad');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('applies free-tier daily limit keyed by user id (single DO call)', async () => {
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
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe('daily-read:user-free');
    expect(calls[0].body).toMatchObject({
      limit: TIER_LIMITS.free.readsPerDay,
      windowSec: 86400,
      anchor: 'utc-day',
      retain: true,
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
  });
  it('returns an upgrade message when a free user exhausts the daily quota', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: LimiterCall[] = [];
    const rpcCalls: Array<Record<string, unknown>> = [];
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, () => ({
        allowed: false,
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
    const throttleLog = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('daily_quota_429'));
    expect(throttleLog).toBeDefined();
    expect(JSON.parse(throttleLog!)).toMatchObject({
      event: 'daily_quota_429',
      action: 'token-info',
      kind: 'read',
      user_id: 'user-free',
      token_id: 'token-1',
    });
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
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'User-Agent': '  TestClient/1.0  ' },
      }),
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
      p_user_agent: 'TestClient/1.0',
    });
  });
  it('rejects inherited object keys as tiers', () => {
    expect(isKnownTier('__proto__')).toBe(false);
    expect(isKnownTier('constructor')).toBe(false);
    expect(isKnownTier('chad')).toBe(true);
  });
  it('returns 429 when the IP abuse gate limit is exceeded', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: LimiterCall[] = [];
    const abuseLimit = vi.fn().mockResolvedValue({ success: false });
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, () => ({
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 1000,
      })),
      API_ABUSE_LIMITER: { limit: abuseLimit } as unknown as RateLimit,
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
      IP_HASH_SECRET: TEST_IP_HASH_SECRET,
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free' }));
    const res = await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': '203.0.113.1' },
      }),
      env
    );
    expect(res.status).toBe(429);
    expect(abuseLimit).toHaveBeenCalledWith({ key: 'api:203.0.113.1' });
    // No DO calls — abuse gate rejects before token validation.
    expect(calls).toHaveLength(0);
    const warnLog = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('abuse_gate_429'));
    expect(warnLog).toBeDefined();
    expect(warnLog).not.toContain('203.0.113.1');
    expect(JSON.parse(warnLog!)).toMatchObject({
      event: 'abuse_gate_429',
      action: 'token-info',
      ip_hash: await expectedIpHash('203.0.113.1', TEST_IP_HASH_SECRET),
    });
  });
  it('skips the abuse gate when the binding is absent', async () => {
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
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': '203.0.113.1' },
      }),
      env
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe('daily-read:user-free');
  });
  it('fails open and logs when the abuse gate binding throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: LimiterCall[] = [];
    const abuseLimit = vi
      .fn()
      .mockRejectedValue(new Error('limiter binding failed for api:203.0.113.1'));
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, () => ({
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 1000,
      })),
      API_ABUSE_LIMITER: { limit: abuseLimit } as unknown as RateLimit,
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
      IP_HASH_SECRET: TEST_IP_HASH_SECRET,
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free' }));
    const res = await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': '203.0.113.1' },
      }),
      env
    );
    // Fail open: request proceeds to token validation and daily quota.
    expect(res.status).toBe(200);
    expect(abuseLimit).toHaveBeenCalledWith({ key: 'api:203.0.113.1' });
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe('daily-read:user-free');
    const warnLog = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('abuse_gate_unavailable'));
    expect(warnLog).toBeDefined();
    const parsed = JSON.parse(warnLog!);
    expect(parsed).toMatchObject({
      event: 'abuse_gate_unavailable',
      action: 'token-info',
      ip_hash: await expectedIpHash('203.0.113.1', TEST_IP_HASH_SECRET),
      reason: 'binding_error',
      error_name: 'Error',
      error_message: 'limiter binding failed for api:[redacted]',
    });
    expect(warnLog).not.toContain('203.0.113.1');
  });
  it('redacts a mixed-case IPv6 address even when the binding lowercases it', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: LimiterCall[] = [];
    const mixedCaseIp = '2001:DB8::1';
    const abuseLimit = vi
      .fn()
      .mockRejectedValue(new Error('limiter binding failed for api:2001:db8::1'));
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, () => ({
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 1000,
      })),
      API_ABUSE_LIMITER: { limit: abuseLimit } as unknown as RateLimit,
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
      IP_HASH_SECRET: TEST_IP_HASH_SECRET,
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free' }));
    const res = await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': mixedCaseIp },
      }),
      env
    );
    expect(res.status).toBe(200);
    const warnLog = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('abuse_gate_unavailable'));
    expect(warnLog).toBeDefined();
    expect(JSON.parse(warnLog!)).toMatchObject({
      event: 'abuse_gate_unavailable',
      reason: 'binding_error',
      error_message: 'limiter binding failed for api:[redacted]',
    });
    expect(warnLog).not.toContain('2001:db8::1');
    expect(warnLog).not.toContain('2001:DB8::1');
  });
  it('redacts an IP that straddles the 200-char truncation boundary', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: LimiterCall[] = [];
    const ip = '203.0.113.99';
    // Prefix is 24 chars; padding of 166 places the IP at char 190, so it
    // straddles the 200-char boundary (ends at 202). After replacement,
    // [redacted] (10 chars) lands at 190-199, fitting within the 200 cap.
    const prefix = 'limiter binding failed: ';
    const padding = 'x'.repeat(200 - prefix.length - ip.length + 2);
    const errorMessage = `${prefix}${padding}${ip} trailing`;
    const abuseLimit = vi.fn().mockRejectedValue(new Error(errorMessage));
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, () => ({
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 1000,
      })),
      API_ABUSE_LIMITER: { limit: abuseLimit } as unknown as RateLimit,
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
      IP_HASH_SECRET: TEST_IP_HASH_SECRET,
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free' }));
    const res = await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': ip },
      }),
      env
    );
    expect(res.status).toBe(200);
    const warnLog = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('abuse_gate_unavailable'));
    expect(warnLog).toBeDefined();
    expect(warnLog).toContain('[redacted]');
    expect(warnLog).not.toContain(ip);
    expect(warnLog).not.toContain('203.0.113.');
  });
  for (const property of ['name', 'message'] as const) {
    it(`fails open when an abuse-gate error ${property} getter throws`, async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const limiterError = new Error('limiter binding failed');
      Object.defineProperty(limiterError, property, {
        get: () => {
          throw new Error(`${property} getter failed`);
        },
      });
      const calls: LimiterCall[] = [];
      const env: Env = {
        API_GATEWAY_LIMITER: makeCapturingLimiter(calls, () => ({
          allowed: true,
          remaining: 5,
          resetAt: Date.now() + 1000,
        })),
        API_ABUSE_LIMITER: {
          limit: vi.fn().mockRejectedValue(limiterError),
        } as unknown as RateLimit,
        SUPABASE_URL: 'https://supabase.example',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
        ALLOWED_ORIGIN: '*',
      };
      vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free' }));
      const res = await worker.fetch(
        buildRequest('/token', {
          method: 'GET',
          headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': '203.0.113.1' },
        }),
        env
      );
      expect(res.status).toBe(200);
      expect(calls).toHaveLength(1);
      const warnLog = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .find((entry) => entry.includes('abuse_gate_unavailable'));
      expect(warnLog).toBeDefined();
      expect(JSON.parse(warnLog!)).toMatchObject({
        event: 'abuse_gate_unavailable',
        reason: 'binding_error',
        [`error_${property}`]: 'Unknown',
      });
    });
  }
  const malformedQuotaCases: Array<{
    name: string;
    payload: () => Record<string, unknown>;
  }> = [
    {
      name: 'missing allowed',
      payload: () => ({ remaining: 5, resetAt: Date.now() + 60_000 }),
    },
    {
      name: 'missing resetAt',
      payload: () => ({ allowed: true, remaining: 5 }),
    },
    {
      name: 'expired resetAt',
      payload: () => ({ allowed: false, remaining: 0, resetAt: Date.now() - 1000 }),
    },
    {
      name: 'out-of-range remaining',
      payload: () => ({
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetAt: Date.now() + 60_000,
      }),
    },
    {
      name: 'fractional remaining',
      payload: () => ({ allowed: true, remaining: 0.5, resetAt: Date.now() + 60_000 }),
    },
    {
      name: 'contradictory allowed state',
      payload: () => ({ allowed: false, remaining: 3, resetAt: Date.now() + 60_000 }),
    },
    {
      name: 'far-future resetAt',
      payload: () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 86_400_000 * 2 }),
    },
  ];
  for (const { name, payload } of malformedQuotaCases) {
    it(`treats a malformed daily quota DO payload (${name}) as unavailable and fails open`, async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const malformedPayload = payload();
      const rpcCalls: Array<Record<string, unknown>> = [];
      const env: Env = {
        API_GATEWAY_LIMITER: {
          idFromName: (key: string) => key,
          get: () => ({
            fetch: async () =>
              new Response(JSON.stringify(malformedPayload), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
          }),
        } as unknown as Env['API_GATEWAY_LIMITER'],
        SUPABASE_URL: 'https://supabase.example',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
        ALLOWED_ORIGIN: '*',
      };
      vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free', rpcCalls }));
      const res = await worker.fetch(
        buildRequest('/token', {
          method: 'GET',
          headers: { Authorization: 'Bearer PVP_abc123' },
        }),
        env
      );
      expect(res.status).toBe(200);
      await flushAsync();
      expect(rpcCalls).toHaveLength(1);
      expect(rpcCalls[0]).toMatchObject({ p_user_id: 'user-free', p_throttled: 0, p_reads: 1 });
      const warnLog = warnSpy.mock.calls
        .map((c) => String(c[0]))
        .find((s) => s.includes('daily_quota_unavailable'));
      expect(warnLog).toBeDefined();
      expect(JSON.parse(warnLog!)).toMatchObject({
        event: 'daily_quota_unavailable',
        action: 'token-info',
        user_id: 'user-free',
        token_id: 'token-1',
        reason: 'bad_json',
      });
    });
  }
  it('fails open and logs when the daily quota DO is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rpcCalls: Array<Record<string, unknown>> = [];
    const env: Env = {
      API_GATEWAY_LIMITER: {
        idFromName: (name: string) => name,
        get: () => ({
          fetch: async () => new Response('Internal Error', { status: 500 }),
        }),
      } as unknown as Env['API_GATEWAY_LIMITER'],
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free', rpcCalls }));
    const res = await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123' },
      }),
      env
    );
    expect(res.status).toBe(200);
    await flushAsync();
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ p_user_id: 'user-free', p_throttled: 0, p_reads: 1 });
    const warnLog = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('daily_quota_unavailable'));
    expect(warnLog).toBeDefined();
    const parsed = JSON.parse(warnLog!);
    expect(parsed).toMatchObject({
      event: 'daily_quota_unavailable',
      action: 'token-info',
      user_id: 'user-free',
      token_id: 'token-1',
      reason: 'http_status',
    });
  });
});
