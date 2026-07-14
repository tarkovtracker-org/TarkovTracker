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
  });

  it('caches the tier after a successful lookup', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/rest/v1/supporters')) {
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
      if (url.includes('/rest/v1/supporters')) {
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
      if (url.includes('/rest/v1/supporters')) {
        return supporterResponse([{ tier: 'chad', status: 'active', expires_at: 'not-a-date' }]);
      }
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveTier(baseEnv, 'user-1')).toBe('free');
  });
});
