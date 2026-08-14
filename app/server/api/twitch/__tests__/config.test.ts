// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { adminSupabaseFetchMock, setResponseHeadersMock, runtimeConfig } = vi.hoisted(() => ({
  adminSupabaseFetchMock: vi.fn(),
  setResponseHeadersMock: vi.fn(),
  runtimeConfig: {
    public: {
      promotedTwitch: { channel: 'EnvStreamer', displayName: 'EnvStreamer', enabled: true },
    },
    supabaseUrl: 'https://test.supabase.co',
    supabaseServiceKey: 'service-key',
  },
}));
vi.mock('@/server/utils/adminSupabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/utils/adminSupabase')>()),
  adminSupabaseFetch: adminSupabaseFetchMock,
}));
vi.mock('h3', () => ({
  createError: (input: { statusCode?: number; message?: string }) =>
    Object.assign(new Error(input.message ?? 'error'), input),
  defineEventHandler: (handler: unknown) => handler,
  setResponseHeaders: setResponseHeadersMock,
}));
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
const loadHandler = async () => {
  vi.resetModules();
  return (await import('@/server/api/twitch/config.get')).default as (
    event: unknown
  ) => Promise<{ channel: string; displayName: string; enabled: boolean }>;
};
describe('/api/twitch/config', () => {
  beforeEach(() => {
    adminSupabaseFetchMock.mockReset();
    setResponseHeadersMock.mockReset();
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
    runtimeConfig.public.promotedTwitch = {
      channel: 'EnvStreamer',
      displayName: 'EnvStreamer',
      enabled: true,
    };
  });
  afterEach(() => {
    vi.resetModules();
  });
  it('returns env fallback config when no override row exists', async () => {
    adminSupabaseFetchMock.mockResolvedValue([]);
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({
      channel: 'envstreamer',
      displayName: 'EnvStreamer',
      enabled: true,
    });
  });
  it('applies the database override when present', async () => {
    adminSupabaseFetchMock.mockResolvedValue([
      { value: { channel: 'DbStreamer', displayName: 'DB Streamer', enabled: false } },
    ]);
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({
      channel: 'dbstreamer',
      displayName: 'DB Streamer',
      enabled: false,
    });
  });
  it('ignores malformed database override fields', async () => {
    adminSupabaseFetchMock.mockResolvedValue([
      {
        value: {
          channel: 'a'.repeat(26),
          displayName: 'x'.repeat(51),
          enabled: 'yes',
        },
      },
    ]);
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({
      channel: 'envstreamer',
      displayName: 'EnvStreamer',
      enabled: true,
    });
  });
  it('skips the database when Supabase config is missing', async () => {
    runtimeConfig.supabaseUrl = '';
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({
      channel: 'envstreamer',
      displayName: 'EnvStreamer',
      enabled: true,
    });
    expect(adminSupabaseFetchMock).not.toHaveBeenCalled();
  });
  it('falls back to env defaults when the database read fails', async () => {
    adminSupabaseFetchMock.mockRejectedValue(new Error('network down'));
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({
      channel: 'envstreamer',
      displayName: 'EnvStreamer',
      enabled: true,
    });
  });
  it('caches the resolved config within the TTL', async () => {
    adminSupabaseFetchMock.mockResolvedValue([]);
    const handler = await loadHandler();
    await handler({});
    await handler({});
    expect(adminSupabaseFetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not cache the fallback when the override read fails', async () => {
    adminSupabaseFetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([
        { value: { channel: 'DbStreamer', displayName: 'DB Streamer', enabled: true } },
      ]);
    const handler = await loadHandler();
    await expect(handler({})).resolves.toMatchObject({ channel: 'envstreamer' });
    await expect(handler({})).resolves.toMatchObject({ channel: 'dbstreamer' });
    expect(adminSupabaseFetchMock).toHaveBeenCalledTimes(2);
  });
  it('stays disabled when the build-time flag is absent', async () => {
    runtimeConfig.public.promotedTwitch = {
      channel: 'EnvStreamer',
      displayName: 'EnvStreamer',
    } as (typeof runtimeConfig)['public']['promotedTwitch'];
    adminSupabaseFetchMock.mockResolvedValue([]);
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({
      channel: 'envstreamer',
      displayName: 'EnvStreamer',
      enabled: false,
    });
  });
  it('normalizes a Supabase URL that carries a query string', async () => {
    runtimeConfig.supabaseUrl = 'https://test.supabase.co/?apikey=leaked';
    adminSupabaseFetchMock.mockResolvedValue([]);
    const handler = await loadHandler();
    await handler({});
    expect(adminSupabaseFetchMock).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'service-key',
      expect.stringContaining('/rest/v1/app_settings')
    );
  });
});
