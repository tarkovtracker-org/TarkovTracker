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
  ) => Promise<{ channel: string; displayName: string; enabled: boolean; version: number }>;
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
      version: 0,
    });
  });
  it('applies the database override and requires revalidation', async () => {
    adminSupabaseFetchMock.mockResolvedValue([
      {
        value: { channel: 'DbStreamer', displayName: 'DB Streamer', enabled: false },
        version: 7,
      },
    ]);
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({
      channel: 'dbstreamer',
      displayName: 'DB Streamer',
      enabled: false,
      version: 7,
    });
    expect(setResponseHeadersMock).toHaveBeenCalledWith(
      {},
      {
        'cache-control': 'public, max-age=300, s-maxage=31536000',
        'cloudflare-cdn-cache-control': 'public, max-age=31536000',
        'cache-tag': 'promoted-twitch-config',
        vary: 'Origin',
      }
    );
  });
  it('ignores malformed database override fields', async () => {
    adminSupabaseFetchMock.mockResolvedValue([
      {
        value: {
          channel: 'a'.repeat(26),
          displayName: 'x'.repeat(51),
          enabled: 'yes',
        },
        version: 2,
      },
    ]);
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({
      channel: 'envstreamer',
      displayName: 'EnvStreamer',
      enabled: true,
      version: 2,
    });
  });
  it('does not cache the fallback when Supabase config is missing', async () => {
    runtimeConfig.supabaseUrl = '';
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({
      channel: 'envstreamer',
      displayName: 'EnvStreamer',
      enabled: true,
      version: 0,
    });
    expect(adminSupabaseFetchMock).not.toHaveBeenCalled();
    expect(setResponseHeadersMock).toHaveBeenCalledWith({}, { 'cache-control': 'no-store' });
  });
  it('falls back to env defaults when the database read fails', async () => {
    adminSupabaseFetchMock.mockRejectedValue(new Error('network down'));
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({
      channel: 'envstreamer',
      displayName: 'EnvStreamer',
      enabled: true,
      version: 0,
    });
    expect(setResponseHeadersMock).toHaveBeenCalledWith({}, { 'cache-control': 'no-store' });
  });
  it('reads the database on each handler execution (edge cache fills)', async () => {
    adminSupabaseFetchMock
      .mockResolvedValueOnce([
        {
          value: { channel: 'FirstStreamer', displayName: 'First', enabled: true },
          version: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          value: { channel: 'SecondStreamer', displayName: 'Second', enabled: false },
          version: 2,
        },
      ]);
    const handler = await loadHandler();
    await expect(handler({})).resolves.toMatchObject({ channel: 'firststreamer', enabled: true });
    await expect(handler({})).resolves.toMatchObject({ channel: 'secondstreamer', enabled: false });
    expect(adminSupabaseFetchMock).toHaveBeenCalledTimes(2);
  });
  it('retries after an override read failure', async () => {
    adminSupabaseFetchMock.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce([
      {
        value: { channel: 'DbStreamer', displayName: 'DB Streamer', enabled: true },
        version: 3,
      },
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
      version: 0,
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
  it.each(['http://test.supabase.co', 'ftp://test.supabase.co'])(
    'rejects a non-HTTPS Supabase URL (%s)',
    async (url) => {
      runtimeConfig.supabaseUrl = url;
      const handler = await loadHandler();
      await expect(handler({})).resolves.toEqual({
        channel: 'envstreamer',
        displayName: 'EnvStreamer',
        enabled: true,
        version: 0,
      });
      expect(adminSupabaseFetchMock).not.toHaveBeenCalled();
      expect(setResponseHeadersMock).toHaveBeenCalledWith({}, { 'cache-control': 'no-store' });
    }
  );
});
