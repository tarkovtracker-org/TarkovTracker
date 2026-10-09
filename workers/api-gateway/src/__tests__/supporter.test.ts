import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTier } from '../services/supporter';
import { deleteMemoryCache } from '../utils/memory-cache';
import type { Env } from '../types';
const baseEnv: Env = {
  API_GATEWAY_LIMITER: {} as unknown as Env['API_GATEWAY_LIMITER'],
  SUPABASE_URL: 'https://supabase.example',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  ALLOWED_ORIGIN: '*',
};
const supporterResponse = (rows: unknown[]) =>
  new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
describe('resolveTier', () => {
  beforeEach(() => {
    deleteMemoryCache('tier:user-1');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('caches the tier after a successful lookup', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/supporter_entitlements')) {
        return supporterResponse([{ tier: 'chad', status: 'active', expires_at: null }]);
      }
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveTier(baseEnv, 'user-1')).toBe('chad');
    expect(await resolveTier(baseEnv, 'user-1')).toBe('chad');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not cache the fallback when Supabase errors, so the next call retries', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls += 1;
      if (url.includes('/rest/v1/supporter_entitlements')) {
        if (calls === 1) return new Response('boom', { status: 500 });
        return supporterResponse([{ tier: 'timmy', status: 'active', expires_at: null }]);
      }
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveTier(baseEnv, 'user-1')).toBe('free');
    expect(await resolveTier(baseEnv, 'user-1')).toBe('timmy');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('treats an unparseable expires_at as expired (fail closed)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/supporter_entitlements')) {
        return supporterResponse([{ tier: 'chad', status: 'active', expires_at: 'not-a-date' }]);
      }
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveTier(baseEnv, 'user-1')).toBe('free');
  });
  it('keeps paid limits during the configured past-due grace period', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/supporter_entitlements')) {
        return supporterResponse([
          {
            tier: 'timmy',
            status: 'past_due',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          },
        ]);
      }
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveTier(baseEnv, 'user-1')).toBe('timmy');
  });
  it('drops paid limits when the past-due grace period expires', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/supporter_entitlements')) {
        return supporterResponse([
          {
            tier: 'timmy',
            status: 'past_due',
            expires_at: new Date(Date.now() - 60_000).toISOString(),
          },
        ]);
      }
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveTier(baseEnv, 'user-1')).toBe('free');
  });
  it('switches from subscription to prepaid tier at grace expiry instead of caching the old tier', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));
    const grace = Date.now() + 1000;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).includes('/rest/v1/supporter_entitlements')) return supporterResponse([]);
      return supporterResponse([
        Date.now() < grace
          ? {
              tier: 'chad',
              status: 'past_due',
              expires_at: new Date(grace).toISOString(),
            }
          : {
              tier: 'scav',
              status: 'active',
              expires_at: '2026-11-08T00:00:01Z',
            },
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveTier(baseEnv, 'user-1')).toBe('chad');
    await vi.advanceTimersByTimeAsync(1001);
    expect(await resolveTier(baseEnv, 'user-1')).toBe('scav');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('uses legacy access only when the entitlement view is specifically missing during rollout', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('supporter_entitlements')
        ? new Response(JSON.stringify({ code: 'PGRST205' }), { status: 404 })
        : supporterResponse([{ tier: 'timmy', status: 'active', expires_at: null }])
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveTier(baseEnv, 'user-1')).toBe('timmy');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 500])(
    'does not bypass an entitlement-view error %s with legacy reads',
    async (status) => {
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ code: 'PGRST205' }), { status })
      );
      vi.stubGlobal('fetch', fetchMock);
      expect(await resolveTier(baseEnv, 'user-1')).toBe('free');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['{"code":"PGRST999"}', 'not-json'])(
    'does not hide an unrelated 404 %s',
    async (body) => {
      const fetchMock = vi.fn(async () => new Response(body, { status: 404 }));
      vi.stubGlobal('fetch', fetchMock);
      expect(await resolveTier(baseEnv, 'user-1')).toBe('free');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );
});
