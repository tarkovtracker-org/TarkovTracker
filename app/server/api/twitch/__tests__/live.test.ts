// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TARKOVTRACKER_USER_AGENT } from '@/server/utils/userAgent';
const {
  fetchMock,
  getQueryMock,
  setResponseHeadersMock,
  useRuntimeConfigMock,
  warnMock,
  errorMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  warnMock: vi.fn(),
  errorMock: vi.fn(),
  getQueryMock: vi.fn(),
  setResponseHeadersMock: vi.fn(),
  useRuntimeConfigMock: vi.fn(),
}));
mockNuxtImport('useRuntimeConfig', () => useRuntimeConfigMock);
vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getQuery: getQueryMock,
  setResponseHeaders: setResponseHeadersMock,
}));
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({ error: errorMock, warn: warnMock }),
}));
const loadHandler = async () => {
  vi.resetModules();
  return (await import('@/server/api/twitch/live.get')).default as (
    event: unknown
  ) => Promise<{ isLive: boolean }>;
};
const liveResponse = (live: boolean) => ({
  ok: true,
  json: async () => ({ data: { user: { stream: live ? { id: 'stream-1' } : null } } }),
});
describe('/api/twitch/live', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    warnMock.mockClear();
    errorMock.mockClear();
    getQueryMock.mockReset();
    setResponseHeadersMock.mockReset();
    useRuntimeConfigMock.mockReturnValue({ twitchClientId: 'test-client-id' });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('returns isLive true when the channel has an active stream', async () => {
    getQueryMock.mockReturnValue({ channel: 'TestStreamer' });
    fetchMock.mockResolvedValue(liveResponse(true));
    const handler = await loadHandler();
    const result = await handler({});
    expect(result).toEqual({ isLive: true });
    expect(setResponseHeadersMock).toHaveBeenCalledWith(
      {},
      {
        'cache-control': 'public, max-age=30, s-maxage=60',
        'cloudflare-cdn-cache-control': 'public, max-age=30',
      }
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://gql.twitch.tv/gql');
    expect((init.headers as Record<string, string>)['Client-ID']).toBe('test-client-id');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(TARKOVTRACKER_USER_AGENT);
    // Channel must be lowercased before querying.
    expect(init.body).toContain('"login":"teststreamer"');
  });
  it('returns isLive false when the channel is offline', async () => {
    getQueryMock.mockReturnValue({ channel: 'teststreamer' });
    fetchMock.mockResolvedValue(liveResponse(false));
    const handler = await loadHandler();
    expect(await handler({})).toEqual({ isLive: false });
  });
  it('rejects invalid channel names without calling Twitch', async () => {
    getQueryMock.mockReturnValue({ channel: 'bad name!' });
    const handler = await loadHandler();
    expect(await handler({})).toEqual({ isLive: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setResponseHeadersMock).toHaveBeenCalledWith({}, { 'cache-control': 'no-store' });
  });
  it('returns isLive false without querying when channel is missing', async () => {
    getQueryMock.mockReturnValue({});
    const handler = await loadHandler();
    expect(await handler({})).toEqual({ isLive: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('caches results within the TTL to avoid duplicate Twitch calls', async () => {
    getQueryMock.mockReturnValue({ channel: 'teststreamer' });
    fetchMock.mockResolvedValue(liveResponse(true));
    const handler = await loadHandler();
    await handler({});
    await handler({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('coalesces simultaneous checks for the same channel', async () => {
    getQueryMock.mockReturnValue({ channel: 'teststreamer' });
    let finish: (value: ReturnType<typeof liveResponse>) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const handler = await loadHandler();
    const first = handler({});
    const second = handler({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(liveResponse(true));
    expect(await Promise.all([first, second])).toEqual([{ isLive: true }, { isLive: true }]);
  });
  it('retains cached results when checks alternate channels', async () => {
    fetchMock.mockResolvedValue(liveResponse(true));
    const handler = await loadHandler();
    for (const channel of ['first', 'second', 'first']) {
      getQueryMock.mockReturnValue({ channel });
      await handler({});
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not cache failed checks', async () => {
    getQueryMock.mockReturnValue({ channel: 'teststreamer' });
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(liveResponse(true));
    const handler = await loadHandler();
    expect(await handler({})).toEqual({ isLive: false });
    expect(await handler({})).toEqual({ isLive: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('refreshes expired channel results', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const now = vi.spyOn(performance, 'now').mockReturnValue(1);
    getQueryMock.mockReturnValue({ channel: 'teststreamer' });
    fetchMock.mockResolvedValue(liveResponse(true));
    const handler = await loadHandler();
    await handler({});
    await vi.advanceTimersByTimeAsync(1);
    now.mockReturnValue(60_002);
    fetchMock.mockResolvedValue(liveResponse(false));
    expect(await handler({})).toEqual({ isLive: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('returns isLive false when Twitch responds with an error status', async () => {
    getQueryMock.mockReturnValue({ channel: 'teststreamer' });
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const handler = await loadHandler();
    expect(await handler({})).toEqual({ isLive: false });
    expect(warnMock).toHaveBeenCalledWith('Twitch live check failed:', 'Twitch GQL returned 503');
    expect(errorMock).not.toHaveBeenCalled();
  });
  it('returns isLive false when the Twitch request throws', async () => {
    getQueryMock.mockReturnValue({ channel: 'teststreamer' });
    fetchMock.mockRejectedValue(new Error('network down'));
    const handler = await loadHandler();
    expect(await handler({})).toEqual({ isLive: false });
  });
});
