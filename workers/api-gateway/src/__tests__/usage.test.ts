import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordUsage } from '../services/usage';
import type { Env } from '../types';

const env = {
  SUPABASE_URL: 'https://supabase.example',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
} as Env;

const record = {
  userId: 'user-1',
  tokenId: 'token-1',
  tier: 'free' as const,
  kind: 'read' as const,
  throttled: false,
  userAgent: 'TestClient/1.0',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recordUsage', () => {
  it('sends the user agent to the current RPC signature', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, { status: 204 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await recordUsage(env, record);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      p_user_id: 'user-1',
      p_reads: 1,
      p_user_agent: 'TestClient/1.0',
    });
  });

  it('retries the legacy RPC signature when PostgREST reports PGRST202', async () => {
    const fetchMock = vi
      .fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null))
      .mockResolvedValueOnce(
        Response.json(
          {
            code: 'PGRST202',
            message: 'Could not find the function in the schema cache',
          },
          { status: 404 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await recordUsage(env, record);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.p_user_agent).toBe('TestClient/1.0');
    expect(retryBody).not.toHaveProperty('p_user_agent');
    expect(retryBody).toMatchObject({ p_user_id: 'user-1', p_reads: 1 });
  });

  it('gives the legacy retry a fresh timeout signal', async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      if (signals.length === 1) {
        return Response.json({ code: 'PGRST202' }, { status: 404 });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await recordUsage(env, record);

    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).not.toBe(signals[0]);
  });

  it('does not retry unrelated RPC failures', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ code: '42501' }, { status: 403 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await recordUsage(env, record);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('recordUsage failed', { status: 403 });
    warnSpy.mockRestore();
  });
});
