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
  it('refunds a sliding-window slot by removing the consumedAt timestamp', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const limiter = new ApiGatewayRateLimiter(makeState());
      const payload = { limit: 2, windowSec: 60, mode: 'sliding' };
      const first = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
        allowed: boolean;
        remaining: number;
        consumedAt: number;
      };
      expect(first.allowed).toBe(true);
      expect(first.consumedAt).toBeDefined();
      const second = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
        allowed: boolean;
        remaining: number;
        consumedAt: number;
      };
      expect(second.allowed).toBe(true);
      const blocked = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
        allowed: boolean;
      };
      expect(blocked.allowed).toBe(false);
      // Refund the first slot using its consumedAt timestamp.
      await limiter.fetch(limiterRequest({ refund: true, consumedAt: first.consumedAt }));
      const afterRefund = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
        allowed: boolean;
        remaining: number;
      };
      expect(afterRefund.allowed).toBe(true);
      expect(afterRefund.remaining).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not refund a sliding-window slot when consumedAt is missing', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const limiter = new ApiGatewayRateLimiter(makeState());
      const payload = { limit: 1, windowSec: 60, mode: 'sliding' };
      const consumed = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
        allowed: boolean;
      };
      expect(consumed.allowed).toBe(true);
      const blocked = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
        allowed: boolean;
      };
      expect(blocked.allowed).toBe(false);
      // Refund without consumedAt should be a no-op for sliding windows.
      await limiter.fetch(limiterRequest({ refund: true }));
      const stillBlocked = (await (await limiter.fetch(limiterRequest(payload))).json()) as {
        allowed: boolean;
      };
      expect(stillBlocked.allowed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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
      const limiter = new ApiGatewayRateLimiter(state);
      const res = (await (
        await limiter.fetch(limiterRequest({ limit: 1, windowSec: 86400, anchor: 'utc-day' }))
      ).json()) as { allowed: boolean; remaining: number };
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('treats expired sliding-window persisted state as absent on load', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const state = makeState();
      await state.storage.put('state', {
        count: 3,
        resetAt: Date.parse('2026-07-05T11:59:00Z'),
        windowSec: 60,
        mode: 'sliding',
        timestamps: [Date.parse('2026-07-05T11:58:00Z')],
      });
      const limiter = new ApiGatewayRateLimiter(state);
      const res = (await (
        await limiter.fetch(limiterRequest({ limit: 3, windowSec: 60, mode: 'sliding' }))
      ).json()) as { allowed: boolean; remaining: number };
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('prunes expired timestamps from a sliding window with mixed entries', async () => {
    vi.useFakeTimers();
    try {
      const baseTime = new Date('2026-07-05T12:00:00Z');
      vi.setSystemTime(baseTime);
      const state = makeState();
      const expiredTs = Date.parse('2026-07-05T11:58:30Z');
      const validTs = Date.parse('2026-07-05T11:59:30Z');
      await state.storage.put('state', {
        count: 2,
        resetAt: validTs + 60_000,
        windowSec: 60,
        mode: 'sliding',
        timestamps: [expiredTs, validTs],
      });
      const limiter = new ApiGatewayRateLimiter(state);
      const res = (await (
        await limiter.fetch(limiterRequest({ limit: 2, windowSec: 60, mode: 'sliding' }))
      ).json()) as { allowed: boolean; remaining: number };
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps younger sliding hits when stored resetAt has already elapsed', async () => {
    vi.useFakeTimers();
    try {
      // resetAt = oldest + window. At cold load the oldest is past cutoff but
      // two younger hits remain; discarding whole state would under-enforce.
      vi.setSystemTime(new Date('2026-07-05T12:00:00.100Z'));
      const state = makeState();
      const olderTs = Date.parse('2026-07-05T11:59:00Z');
      const midTs = Date.parse('2026-07-05T11:59:20Z');
      const youngerTs = Date.parse('2026-07-05T11:59:40Z');
      await state.storage.put('state', {
        count: 3,
        resetAt: olderTs + 60_000,
        windowSec: 60,
        mode: 'sliding',
        timestamps: [olderTs, midTs, youngerTs],
      });
      const limiter = new ApiGatewayRateLimiter(state);
      const res = (await (
        await limiter.fetch(limiterRequest({ limit: 2, windowSec: 60, mode: 'sliding' }))
      ).json()) as { allowed: boolean; remaining: number };
      expect(res.allowed).toBe(false);
      expect(res.remaining).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('handles config change from sliding to fixed-window on expired state', async () => {
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
      const limiter = new ApiGatewayRateLimiter(state);
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
    const limiter = new ApiGatewayRateLimiter(state);
    await limiter.fetch(limiterRequest({ limit: 5, windowSec: 60 }));
    const firstCallCount = getSpy.mock.calls.length;
    await limiter.fetch(limiterRequest({ limit: 5, windowSec: 60 }));
    expect(getSpy.mock.calls.length).toBe(firstCallCount);
  });
  it('does not call setAlarm when retain is set', async () => {
    const state = makeState();
    const setAlarmSpy = vi.spyOn(state.storage, 'setAlarm');
    const limiter = new ApiGatewayRateLimiter(state);
    await limiter.fetch(limiterRequest({ limit: 5, windowSec: 60, mode: 'sliding', retain: true }));
    await limiter.fetch(
      limiterRequest({ limit: 5, windowSec: 60, anchor: 'utc-day', retain: true })
    );
    await limiter.fetch(limiterRequest({ limit: 1, windowSec: 60, mode: 'sliding', retain: true }));
    const throttled = (await (
      await limiter.fetch(
        limiterRequest({ limit: 1, windowSec: 60, mode: 'sliding', retain: true })
      )
    ).json()) as { allowed: boolean };
    expect(throttled.allowed).toBe(false);
    expect(setAlarmSpy).not.toHaveBeenCalled();
  });
  it('schedules cleanup alarm by default when retain is omitted', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const state = makeState();
      const setAlarmSpy = vi.spyOn(state.storage, 'setAlarm');
      const limiter = new ApiGatewayRateLimiter(state);
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
  it('schedules cleanup alarm for default sliding-window requests', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const state = makeState();
      const setAlarmSpy = vi.spyOn(state.storage, 'setAlarm');
      const limiter = new ApiGatewayRateLimiter(state);
      const res = await limiter.fetch(limiterRequest({ limit: 5, windowSec: 60, mode: 'sliding' }));
      const body = (await res.json()) as { allowed: boolean; resetAt: number };
      expect(body.allowed).toBe(true);
      expect(setAlarmSpy).toHaveBeenCalledTimes(1);
      expect(setAlarmSpy).toHaveBeenCalledWith(body.resetAt + 1000);
    } finally {
      vi.useRealTimers();
    }
  });
  it('schedules cleanup alarm for default fixed-window requests', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const state = makeState();
      const setAlarmSpy = vi.spyOn(state.storage, 'setAlarm');
      const limiter = new ApiGatewayRateLimiter(state);
      const res = await limiter.fetch(limiterRequest({ limit: 5, windowSec: 60 }));
      const body = (await res.json()) as { allowed: boolean; resetAt: number };
      expect(body.allowed).toBe(true);
      expect(setAlarmSpy).toHaveBeenCalledTimes(1);
      expect(setAlarmSpy).toHaveBeenCalledWith(body.resetAt + 1000);
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps cleanup alarm scheduled on throttled sliding-window deny path', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
      const state = makeState();
      const limiter = new ApiGatewayRateLimiter(state);
      const payload = { limit: 1, windowSec: 60, mode: 'sliding' };
      const first = await limiter.fetch(limiterRequest(payload));
      const firstBody = (await first.json()) as { allowed: boolean; resetAt: number };
      expect(firstBody.allowed).toBe(true);
      const alarmAfterAllow = await state.storage.getAlarm();
      expect(alarmAfterAllow).toBe(firstBody.resetAt + 1000);
      const throttled = await limiter.fetch(limiterRequest(payload));
      const body = (await throttled.json()) as { allowed: boolean; resetAt: number };
      expect(body.allowed).toBe(false);
      const alarmAfterDeny = await state.storage.getAlarm();
      expect(alarmAfterDeny).toBe(body.resetAt + 1000);
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
      const limiter = new ApiGatewayRateLimiter(state);
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
      const limiter = new ApiGatewayRateLimiter(state);
      await limiter.alarm();
      expect(setAlarmSpy).toHaveBeenCalledWith(resetAt + 1000);
      const stored = await state.storage.get<RateLimitState>('state');
      expect(stored).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
  it('alarm keeps younger sliding hits when stored resetAt has already elapsed', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-05T12:00:00.100Z'));
      const state = makeState();
      const olderTs = Date.parse('2026-07-05T11:59:00Z');
      const midTs = Date.parse('2026-07-05T11:59:20Z');
      const youngerTs = Date.parse('2026-07-05T11:59:40Z');
      const staleResetAt = olderTs + 60_000;
      await state.storage.put('state', {
        count: 3,
        resetAt: staleResetAt,
        windowSec: 60,
        mode: 'sliding',
        timestamps: [olderTs, midTs, youngerTs],
        ephemeral: true,
      });
      const deleteAlarmSpy = vi.spyOn(state.storage, 'deleteAlarm');
      const deleteAllSpy = vi.spyOn(state.storage, 'deleteAll');
      const setAlarmSpy = vi.spyOn(state.storage, 'setAlarm');
      const limiter = new ApiGatewayRateLimiter(state);
      await limiter.alarm();
      expect(deleteAlarmSpy).not.toHaveBeenCalled();
      expect(deleteAllSpy).not.toHaveBeenCalled();
      expect(setAlarmSpy).toHaveBeenCalledWith(midTs + 60_000 + 1000);
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
      const limiter = new ApiGatewayRateLimiter(state);
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
      const limiter = new ApiGatewayRateLimiter(state);
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
      const limiter = new ApiGatewayRateLimiter(state);
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
      retain: true,
    });
    expect(calls[1].key).toBe('burst-read:user-free');
    expect(calls[1].body).toMatchObject({
      limit: TIER_LIMITS.free.burstPerMinute,
      windowSec: 60,
      mode: 'sliding',
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
  it('checks the per-IP backstop when CF-Connecting-IP is present', async () => {
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
    const ipCall = calls.find((c) => c.key.startsWith('ip-read:'));
    expect(ipCall).toBeDefined();
    expect(ipCall?.body).toMatchObject({ mode: 'sliding', windowSec: 3600 });
  });
  it('returns 429 and refunds daily+burst when the per-IP backstop trips', async () => {
    const calls: LimiterCall[] = [];
    const rpcCalls: Array<Record<string, unknown>> = [];
    const ipResetAt = Date.now() + 1800_000;
    const burstConsumedAt = Date.now();
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, (call) => {
        if (call.body.refund === true) {
          return { allowed: true, remaining: 0, resetAt: ipResetAt };
        }
        if (String(call.key).startsWith('ip-')) {
          return { allowed: false, remaining: 0, resetAt: ipResetAt };
        }
        return {
          allowed: true,
          remaining: 5,
          resetAt: Date.now() + 1000,
          consumedAt: burstConsumedAt,
        };
      }),
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free', rpcCalls }));
    const res = await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': '203.0.113.1' },
      }),
      env
    );
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    await flushAsync();
    const refunds = calls.filter((c) => c.body.refund === true);
    expect(refunds).toHaveLength(2);
    expect(refunds.some((r) => r.key === 'daily-read:user-free')).toBe(true);
    const burstRefund = refunds.find((r) => r.key === 'burst-read:user-free');
    expect(burstRefund).toBeDefined();
    expect(burstRefund?.body.consumedAt).toBe(burstConsumedAt);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ p_user_id: 'user-free', p_throttled: 1, p_reads: 0 });
  });
  it('fails open when the per-IP backstop limiter is unavailable (503)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const calls: LimiterCall[] = [];
    const rpcCalls: Array<Record<string, unknown>> = [];
    // Custom limiter: IP-keyed DOs return HTTP 500 (non-OK) so rateLimit
    // produces status 503; all other keys behave normally.
    const env: Env = {
      API_GATEWAY_LIMITER: {
        idFromName: (name: string) => name,
        get: (id: unknown) => ({
          fetch: async (_url: string, init?: RequestInit) => {
            const call: LimiterCall = {
              key: String(id),
              body: JSON.parse(String(init?.body || '{}')),
            };
            calls.push(call);
            if (String(id).startsWith('ip-')) {
              return new Response('Internal Error', { status: 500 });
            }
            return new Response(
              JSON.stringify({ allowed: true, remaining: 5, resetAt: Date.now() + 1000 }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            );
          },
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
        headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': '203.0.113.1' },
      }),
      env
    );
    // Request succeeds despite IP limiter being unavailable.
    expect(res.status).toBe(200);
    await flushAsync();
    // No refund calls — the primary slots stay consumed because the request is served.
    const refunds = calls.filter((c) => c.body.refund === true);
    expect(refunds).toHaveLength(0);
    // Primary daily and burst consumption remains in place (3 calls: daily, burst, ip).
    expect(calls).toHaveLength(3);
    expect(calls[0].key).toBe('daily-read:user-free');
    expect(calls[1].key).toBe('burst-read:user-free');
    expect(calls[2].key).toBe('ip-read:203.0.113.1');
    // Usage tracked as non-throttled.
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ p_user_id: 'user-free', p_throttled: 0, p_reads: 1 });
    // No throttle log emitted for the infrastructure failure.
    const throttleLog = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('rate_limit_429'));
    expect(throttleLog).toBeUndefined();
    // Availability warning emitted so the failure is observable.
    const warnLog = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('ip_backstop_unavailable'));
    expect(warnLog).toBeDefined();
    const parsed = JSON.parse(warnLog!);
    expect(parsed).toMatchObject({
      event: 'ip_backstop_unavailable',
      action: 'token-info',
      user_id: 'user-free',
      token_id: 'token-1',
    });
    // The warning must never leak the raw client IP or the ip_key (which
    // embeds the raw IP). Only the HMAC-derived ip_hash is allowed.
    expect(parsed.ip_key).toBeUndefined();
    expect(parsed.ip_hash).toBeNull();
    expect(warnLog).not.toContain('203.0.113.1');
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
  it('ip_backstop_unavailable warning uses hashed IP when secret is set', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const env: Env = {
      API_GATEWAY_LIMITER: {
        idFromName: (name: string) => name,
        get: (id: unknown) => ({
          fetch: async (_url: string, _init?: RequestInit) => {
            const key = String(id);
            if (key.startsWith('ip-')) {
              return new Response('Internal Error', { status: 500 });
            }
            return new Response(
              JSON.stringify({ allowed: true, remaining: 5, resetAt: Date.now() + 1000 }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            );
          },
        }),
      } as unknown as Env['API_GATEWAY_LIMITER'],
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
      IP_HASH_SECRET: 'test-secret',
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
    const warnLog = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('ip_backstop_unavailable'));
    expect(warnLog).toBeDefined();
    const parsed = JSON.parse(warnLog!);
    expect(parsed.ip_key).toBeUndefined();
    expect(parsed.ip_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(warnLog).not.toContain('203.0.113.1');
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
  it('emits a structured 429 log line with hashed IP on daily throttle', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const calls: LimiterCall[] = [];
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
      IP_HASH_SECRET: 'test-secret',
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free' }));
    await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': '203.0.113.1' },
      }),
      env
    );
    const throttleLog = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('rate_limit_429'));
    expect(throttleLog).toBeDefined();
    const parsed = JSON.parse(throttleLog!);
    expect(parsed).toMatchObject({
      event: 'rate_limit_429',
      action: 'token-info',
      bucket: 'daily',
      user_id: 'user-free',
    });
    expect(parsed.ip_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(parsed.token_id).toBe('token-1');
    expect(parsed.token_suffix).toBeUndefined();
    logSpy.mockRestore();
  });
  it('logs ip_hash as null when IP_HASH_SECRET is not set', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const calls: LimiterCall[] = [];
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
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free' }));
    await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': '203.0.113.1' },
      }),
      env
    );
    const throttleLog = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('rate_limit_429'));
    expect(throttleLog).toBeDefined();
    const parsed = JSON.parse(throttleLog!);
    expect(parsed.ip_hash).toBeNull();
    logSpy.mockRestore();
  });
  it('emits a structured 429 log line with bucket=ip on IP backstop throttle', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const calls: LimiterCall[] = [];
    const ipResetAt = Date.now() + 1800_000;
    const env: Env = {
      API_GATEWAY_LIMITER: makeCapturingLimiter(calls, (call) => {
        if (call.body.refund === true) {
          return { allowed: true, remaining: 0, resetAt: ipResetAt };
        }
        if (String(call.key).startsWith('ip-')) {
          return { allowed: false, remaining: 0, resetAt: ipResetAt };
        }
        return { allowed: true, remaining: 5, resetAt: Date.now() + 1000 };
      }),
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ALLOWED_ORIGIN: '*',
      IP_HASH_SECRET: 'test-secret',
    };
    vi.stubGlobal('fetch', makeFetchMock({ userId: 'user-free' }));
    await worker.fetch(
      buildRequest('/token', {
        method: 'GET',
        headers: { Authorization: 'Bearer PVP_abc123', 'CF-Connecting-IP': '203.0.113.1' },
      }),
      env
    );
    const throttleLog = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('rate_limit_429'));
    expect(throttleLog).toBeDefined();
    const parsed = JSON.parse(throttleLog!);
    expect(parsed).toMatchObject({
      event: 'rate_limit_429',
      action: 'token-info',
      bucket: 'ip',
      user_id: 'user-free',
    });
    expect(parsed.ip_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(parsed.token_id).toBe('token-1');
    expect(parsed.token_suffix).toBeUndefined();
    logSpy.mockRestore();
  });
  it('does not check the per-IP backstop when no IP header is present', async () => {
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
    expect(calls.filter((c) => c.key.startsWith('ip-'))).toHaveLength(0);
  });
  it('does not check the per-IP backstop when only X-Forwarded-For is present', async () => {
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
        headers: { Authorization: 'Bearer PVP_abc123', 'X-Forwarded-For': '203.0.113.1' },
      }),
      env
    );
    expect(res.status).toBe(200);
    expect(calls.filter((c) => c.key.startsWith('ip-'))).toHaveLength(0);
  });
});
