// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, H3EventContext } from 'h3';
const runtimeConfig = {
  supabaseServiceKey: 'service-key',
  supabaseUrl: 'https://test.supabase.co',
};
const mockFetch = vi.fn();
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3');
  return {
    ...actual,
    getQuery: () => ({}),
  };
});
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
function makeEvent(authUser: { id?: string } | null): H3Event {
  return {
    context: authUser ? { auth: { user: authUser } } : ({} as H3EventContext),
  } as unknown as H3Event;
}
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  const text = JSON.stringify(body);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as Response;
}
describe('GET /api/admin/api-usage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
  });
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });
  it('requires authentication', async () => {
    const { default: handler } = await import('@/server/api/admin/api-usage.get');
    await expect(handler(makeEvent(null))).rejects.toMatchObject({ statusCode: 401 });
  });
  it('rejects non-admin users', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: false }]));
    const { default: handler } = await import('@/server/api/admin/api-usage.get');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 403 });
  });
  it('returns the top consumers from the SQL aggregation RPC', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }])).mockResolvedValueOnce(
      jsonResponse([
        {
          user_id: 'u1',
          token_id: 't1',
          tier: 'free',
          reads: 1000,
          writes: 60,
          throttled: 12,
        },
        {
          user_id: 'u2',
          token_id: 't2',
          tier: 'chad',
          reads: 200,
          writes: 20,
          throttled: 0,
        },
      ])
    );
    const { default: handler } = await import('@/server/api/admin/api-usage.get');
    const result = (await handler(makeEvent({ id: 'admin-1' }))) as unknown as {
      since: string;
      consumers: Array<Record<string, unknown>>;
    };
    const rpcCall = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(rpcCall[0]).toContain('/rest/v1/rpc/get_api_usage_summary');
    expect(rpcCall[1].method).toBe('POST');
    expect(JSON.parse(String(rpcCall[1].body))).toMatchObject({
      p_since: result.since,
      p_limit: 20,
    });
    expect(result.consumers).toHaveLength(2);
    expect(result.consumers[0]).toMatchObject({
      userId: 'u1',
      tokenId: 't1',
      tier: 'free',
      reads: 1000,
      writes: 60,
      throttled: 12,
    });
    expect(result.consumers[1]).toMatchObject({ userId: 'u2', tier: 'chad' });
  });
});
