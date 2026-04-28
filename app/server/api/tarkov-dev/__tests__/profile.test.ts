// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const {
  consumeSharedRateLimitMock,
  createSharedCacheHandleMock,
  fetchMock,
  getProxyAwareClientIdentifierMock,
  getQueryMock,
  setResponseHeadersMock,
  useRuntimeConfigMock,
} = vi.hoisted(() => ({
  consumeSharedRateLimitMock: vi.fn(),
  createSharedCacheHandleMock: vi.fn(),
  fetchMock: vi.fn(),
  getProxyAwareClientIdentifierMock: vi.fn(),
  getQueryMock: vi.fn(),
  setResponseHeadersMock: vi.fn(),
  useRuntimeConfigMock: vi.fn(),
}));
mockNuxtImport('useRuntimeConfig', () => useRuntimeConfigMock);
vi.mock('h3', () => ({
  createError: (options: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(options.statusMessage), options),
  defineEventHandler: (handler: unknown) => handler,
  getQuery: getQueryMock,
  setResponseHeaders: setResponseHeadersMock,
}));
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock('@/server/utils/requestIdentity', () => ({
  getProxyAwareClientIdentifier: getProxyAwareClientIdentifierMock,
}));
vi.mock('@/server/utils/sharedEdgeStore', () => ({
  consumeSharedRateLimit: consumeSharedRateLimitMock,
  createSharedCacheHandle: createSharedCacheHandleMock,
}));
const loadHandler = async () => {
  vi.resetModules();
  return (await import('@/server/api/tarkov-dev/profile.get')).default as (
    event: unknown
  ) => Promise<unknown>;
};
describe('/api/tarkov-dev/profile', () => {
  beforeEach(() => {
    consumeSharedRateLimitMock.mockReset();
    createSharedCacheHandleMock.mockReset();
    fetchMock.mockReset();
    getProxyAwareClientIdentifierMock.mockReset();
    getQueryMock.mockReset();
    setResponseHeadersMock.mockReset();
    useRuntimeConfigMock.mockReset();
    consumeSharedRateLimitMock.mockResolvedValue(true);
    createSharedCacheHandleMock.mockReturnValue({
      cache: null,
      origin: { host: 'test.local', protocol: 'https:' },
    });
    getProxyAwareClientIdentifierMock.mockReturnValue('203.0.113.10');
    useRuntimeConfigMock.mockReturnValue({
      apiProtection: { trustProxy: true },
      public: { appUrl: 'https://tarkovtracker.org' },
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('fetches public profile json from a Tarkov.dev profile url', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    fetchMock.mockResolvedValue({
      json: async () => ({ aid: 8560316 }),
      ok: true,
      status: 200,
    });
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({ aid: 8560316 });
    expect(consumeSharedRateLimitMock).toHaveBeenCalledWith(
      { cache: null, origin: { host: 'test.local', protocol: 'https:' } },
      'tarkov-dev-profile-rate',
      'profile:ip:203.0.113.10',
      30,
      60000,
      expect.any(Function)
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://players.tarkov.dev/profile/8560316.json',
      expect.objectContaining({
        headers: {
          accept: 'application/json',
          'user-agent': 'TarkovTracker/1.x (+https://tarkovtracker.org)',
        },
        signal: expect.any(AbortSignal),
      })
    );
    expect(setResponseHeadersMock).toHaveBeenCalledWith({}, { 'Cache-Control': 'no-store' });
  });
  it('fetches public pve profile json from a Tarkov.dev pve profile url', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/pve/8560316' });
    fetchMock.mockResolvedValue({
      json: async () => ({ aid: 8560316 }),
      ok: true,
      status: 200,
    });
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({ aid: 8560316 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://players.tarkov.dev/pve/8560316.json',
      expect.objectContaining({
        headers: {
          accept: 'application/json',
          'user-agent': 'TarkovTracker/1.x (+https://tarkovtracker.org)',
        },
        signal: expect.any(AbortSignal),
      })
    );
  });
  it('rejects requests when the profile proxy rate limit is exceeded', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    consumeSharedRateLimitMock.mockResolvedValue(false);
    const handler = await loadHandler();
    await expect(handler({})).rejects.toMatchObject({ statusCode: 429 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns a timeout error when upstream profile fetching times out', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    const timeoutError = new Error('timeout');
    timeoutError.name = 'TimeoutError';
    fetchMock.mockRejectedValue(timeoutError);
    const handler = await loadHandler();
    await expect(handler({})).rejects.toMatchObject({ statusCode: 504 });
  });
  it('rejects non-Tarkov.dev profile urls', async () => {
    getQueryMock.mockReturnValue({ url: 'https://example.com/players/regular/8560316' });
    const handler = await loadHandler();
    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
