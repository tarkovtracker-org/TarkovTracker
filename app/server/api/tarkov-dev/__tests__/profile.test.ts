// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const {
  consumeSharedRateLimitMock,
  createSharedCacheHandleMock,
  fetchMock,
  getProxyAwareClientIdentifierMock,
  getQueryMock,
  getRateLimiterBindingMock,
  getRequestHeaderMock,
  readSharedCacheMock,
  setResponseHeaderMock,
  setResponseHeadersMock,
  useRuntimeConfigMock,
  verifyTurnstileTokenMock,
  writeSharedCacheMock,
} = vi.hoisted(() => ({
  consumeSharedRateLimitMock: vi.fn(),
  createSharedCacheHandleMock: vi.fn(),
  fetchMock: vi.fn(),
  getProxyAwareClientIdentifierMock: vi.fn(),
  getQueryMock: vi.fn(),
  getRateLimiterBindingMock: vi.fn(),
  getRequestHeaderMock: vi.fn(),
  readSharedCacheMock: vi.fn(),
  setResponseHeaderMock: vi.fn(),
  setResponseHeadersMock: vi.fn(),
  useRuntimeConfigMock: vi.fn(),
  verifyTurnstileTokenMock: vi.fn(),
  writeSharedCacheMock: vi.fn(),
}));
mockNuxtImport('useRuntimeConfig', () => useRuntimeConfigMock);
vi.mock('h3', () => ({
  createError: (options: { statusCode: number; statusMessage: string; data?: unknown }) =>
    Object.assign(new Error(options.statusMessage), options),
  defineEventHandler: (handler: unknown) => handler,
  getQuery: getQueryMock,
  getRequestHeader: getRequestHeaderMock,
  setResponseHeader: setResponseHeaderMock,
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
  getRateLimiterBinding: getRateLimiterBindingMock,
  readSharedCache: readSharedCacheMock,
  writeSharedCache: writeSharedCacheMock,
}));
vi.mock('@/server/utils/turnstile', () => ({
  verifyTurnstileToken: verifyTurnstileTokenMock,
}));
const HANDLE = { cache: null, origin: { host: 'test.local', protocol: 'https:' } };
const PROFILE_JSON_URL = 'https://players.tarkov.dev/profile/8560316.json';
const DAY_MS = 86_400_000;
const freshProfileBody = () => ({ aid: 8560316, updated: Date.now() - 60_000 });
const upstreamResponse = (
  body: unknown,
  { etag = 'W/"abc123"', status = 200 }: { etag?: string | null; status?: number } = {}
) => ({
  headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? etag : null) },
  json: async () => body,
  ok: status >= 200 && status < 300,
  status,
});
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
    getRateLimiterBindingMock.mockReset();
    getRequestHeaderMock.mockReset();
    readSharedCacheMock.mockReset();
    setResponseHeaderMock.mockReset();
    setResponseHeadersMock.mockReset();
    useRuntimeConfigMock.mockReset();
    verifyTurnstileTokenMock.mockReset();
    writeSharedCacheMock.mockReset();
    consumeSharedRateLimitMock.mockResolvedValue(true);
    createSharedCacheHandleMock.mockReturnValue(HANDLE);
    getProxyAwareClientIdentifierMock.mockReturnValue('203.0.113.10');
    getRateLimiterBindingMock.mockReturnValue(null);
    getRequestHeaderMock.mockReturnValue(undefined);
    readSharedCacheMock.mockResolvedValue(null);
    verifyTurnstileTokenMock.mockResolvedValue({ ok: true });
    writeSharedCacheMock.mockResolvedValue(undefined);
    useRuntimeConfigMock.mockReturnValue({
      apiProtection: { trustProxy: true },
      public: { appUrl: 'https://tarkovtracker.org' },
      tarkovDevProfileCacheTtlMs: 900000,
      tarkovDevProfileMaxUpdatedAgeDays: 7,
      tarkovDevProfileRateLimitPerHour: 20,
      tarkovDevProfileRateLimitPerMinute: 5,
      turnstileSecretKey: '',
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('fetches public profile json and caches the payload', async () => {
    const body = freshProfileBody();
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    fetchMock.mockResolvedValue(upstreamResponse(body));
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual(body);
    expect(consumeSharedRateLimitMock).toHaveBeenNthCalledWith(
      1,
      HANDLE,
      'tarkov-dev-profile-rate',
      'profile:ip:203.0.113.10',
      5,
      60000,
      expect.any(Function)
    );
    expect(consumeSharedRateLimitMock).toHaveBeenNthCalledWith(
      2,
      HANDLE,
      'tarkov-dev-profile-hourly-rate',
      'profile:ip:203.0.113.10',
      20,
      3600000,
      expect.any(Function)
    );
    expect(fetchMock).toHaveBeenCalledWith(
      PROFILE_JSON_URL,
      expect.objectContaining({
        headers: {
          accept: 'application/json',
          'user-agent': 'TarkovTracker/1.0 (+https://tarkovtracker.org)',
        },
        signal: expect.any(AbortSignal),
      })
    );
    expect(writeSharedCacheMock).toHaveBeenCalledWith(
      HANDLE,
      'tarkov-dev-profile',
      PROFILE_JSON_URL,
      expect.objectContaining({ body, etag: 'W/"abc123"', status: 200 }),
      900000,
      expect.any(Function)
    );
    expect(setResponseHeaderMock).toHaveBeenCalledWith({}, 'Cache-Control', 'private, max-age=900');
    expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });
  it('fetches public pve profile json from a Tarkov.dev pve profile url', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/pve/8560316' });
    fetchMock.mockResolvedValue(upstreamResponse(freshProfileBody()));
    const handler = await loadHandler();
    await handler({});
    expect(fetchMock).toHaveBeenCalledWith(
      'https://players.tarkov.dev/pve/8560316.json',
      expect.anything()
    );
  });
  it('rejects requests when the per-minute rate limit is exceeded', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    consumeSharedRateLimitMock.mockResolvedValueOnce(false);
    const handler = await loadHandler();
    await expect(handler({})).rejects.toMatchObject({
      statusCode: 429,
      data: { code: 'rate_limited', retryAfterSeconds: 60 },
    });
    expect(setResponseHeaderMock).toHaveBeenCalledWith({}, 'Retry-After', 60);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects requests when the hourly rate limit is exceeded', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    consumeSharedRateLimitMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const handler = await loadHandler();
    await expect(handler({})).rejects.toMatchObject({
      statusCode: 429,
      data: { code: 'rate_limited', retryAfterSeconds: 3600 },
    });
    expect(setResponseHeaderMock).toHaveBeenCalledWith({}, 'Retry-After', 3600);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('serves a cached profile without contacting the upstream', async () => {
    const body = freshProfileBody();
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    readSharedCacheMock.mockResolvedValue({
      body,
      etag: 'W/"abc123"',
      fetchedAt: Date.now(),
      status: 200,
    });
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual(body);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setResponseHeaderMock).toHaveBeenCalledWith({}, 'Cache-Control', 'private, max-age=900');
  });
  it('serves a negative cache entry as 404 without contacting the upstream', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    readSharedCacheMock.mockResolvedValue({ fetchedAt: Date.now(), status: 404 });
    const handler = await loadHandler();
    await expect(handler({})).rejects.toMatchObject({
      statusCode: 404,
      data: { code: 'profile_not_generated' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('caches upstream 404 responses briefly', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    fetchMock.mockResolvedValue(upstreamResponse(null, { status: 404 }));
    const handler = await loadHandler();
    await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
    expect(writeSharedCacheMock).toHaveBeenCalledWith(
      HANDLE,
      'tarkov-dev-profile',
      PROFILE_JSON_URL,
      expect.objectContaining({ status: 404 }),
      60000,
      expect.any(Function)
    );
  });
  it('revalidates with If-None-Match when fresh is requested and reuses the cache on 304', async () => {
    const body = freshProfileBody();
    getQueryMock.mockReturnValue({
      fresh: '1',
      url: 'https://tarkov.dev/players/regular/8560316',
    });
    readSharedCacheMock.mockResolvedValue({
      body,
      etag: 'W/"abc123"',
      fetchedAt: Date.now() - 5_000,
      status: 200,
    });
    fetchMock.mockResolvedValue(upstreamResponse(null, { etag: null, status: 304 }));
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      PROFILE_JSON_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ 'if-none-match': 'W/"abc123"' }),
      })
    );
    expect(writeSharedCacheMock).toHaveBeenCalledWith(
      HANDLE,
      'tarkov-dev-profile',
      PROFILE_JSON_URL,
      expect.objectContaining({ body, status: 200 }),
      900000,
      expect.any(Function)
    );
  });
  it('rejects imports when the upstream profile data is too old', async () => {
    const body = { aid: 8560316, updated: Date.now() - 8 * DAY_MS };
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    fetchMock.mockResolvedValue(upstreamResponse(body));
    const handler = await loadHandler();
    await expect(handler({})).rejects.toMatchObject({
      statusCode: 422,
      data: expect.objectContaining({ code: 'profile_stale', maxUpdatedAgeDays: 7 }),
    });
    expect(writeSharedCacheMock).toHaveBeenCalled();
  });
  it('allows imports with old data when the freshness gate is disabled', async () => {
    const body = { aid: 8560316, updated: Date.now() - 30 * DAY_MS };
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    useRuntimeConfigMock.mockReturnValue({
      apiProtection: { trustProxy: true },
      public: { appUrl: 'https://tarkovtracker.org' },
      tarkovDevProfileMaxUpdatedAgeDays: 0,
      turnstileSecretKey: '',
    });
    fetchMock.mockResolvedValue(upstreamResponse(body));
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual(body);
  });
  it('rejects requests that fail Turnstile verification when enforcement is enabled', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    useRuntimeConfigMock.mockReturnValue({
      apiProtection: { trustProxy: true },
      public: { appUrl: 'https://tarkovtracker.org' },
      turnstileSecretKey: 'secret-key',
    });
    verifyTurnstileTokenMock.mockResolvedValue({ ok: false, reason: 'missing-token' });
    const handler = await loadHandler();
    await expect(handler({})).rejects.toMatchObject({
      statusCode: 403,
      data: { code: 'turnstile_failed' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('passes the Turnstile token from the request header to verification', async () => {
    const body = freshProfileBody();
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    getRequestHeaderMock.mockReturnValue('turnstile-token');
    useRuntimeConfigMock.mockReturnValue({
      apiProtection: { trustProxy: true },
      public: { appUrl: 'https://tarkovtracker.org' },
      turnstileSecretKey: 'secret-key',
    });
    fetchMock.mockResolvedValue(upstreamResponse(body));
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual(body);
    expect(verifyTurnstileTokenMock).toHaveBeenCalledWith({
      allowedHostnames: expect.arrayContaining(['tarkovtracker.org', 'localhost']),
      secretKey: 'secret-key',
      token: 'turnstile-token',
    });
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
