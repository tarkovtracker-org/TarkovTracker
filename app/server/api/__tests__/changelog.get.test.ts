// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  headers: vi.fn(),
  fetch: vi.fn(),
  getCache: vi.fn(),
  match: vi.fn(),
  put: vi.fn(),
  config: {
    githubTimeoutMs: 1000,
    githubToken: '',
    public: { appUrl: 'https://tracker.test', githubOwner: 'owner', githubRepo: 'repo' },
  },
}));
vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  getQuery: mocks.query,
  setResponseHeaders: mocks.headers,
}));
mockNuxtImport('useRuntimeConfig', () => () => mocks.config);
vi.mock('@/server/utils/sharedEdgeStore', () => ({
  getSharedCache: mocks.getCache,
  resolveSharedCacheOrigin: () => ({ host: 'tracker.test', protocol: 'https:' }),
}));
const event = {} as H3Event;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const release = (tag: string, day: string, body = '- Improved maps') => ({
  tag_name: tag,
  published_at: `${day}T12:00:00Z`,
  body,
});
const commit = (sha: string, day: string, message = 'fix: map markers') => ({
  sha,
  commit: { message, author: { date: `${day}T12:00:00Z` } },
});
const loadHandler = async () => (await import('@/server/api/changelog.get')).default;
const requests = () => mocks.fetch.mock.calls.map(([url]) => String(url));
const enableSharedCache = () =>
  mocks.getCache.mockReturnValue({ match: mocks.match, put: mocks.put });
describe('changelog endpoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
    mocks.query.mockReturnValue({ limit: 2, releases: 2 });
    mocks.config.githubToken = '';
    mocks.getCache.mockReturnValue(null);
    mocks.match.mockReset().mockResolvedValue(undefined);
    mocks.put.mockReset().mockResolvedValue(undefined);
    mocks.fetch.mockReset().mockImplementation(async (url: string) => {
      if (url.includes('/releases?')) return json([]);
      if (url.includes('/commits?')) return json([]);
      throw new Error(`Unexpected GitHub request: ${url}`);
    });
    vi.stubGlobal('fetch', mocks.fetch);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('combines release bullets with comparison stats and excludes drafts', async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes('/releases?'))
        return json([
          { ...release('draft', '2026-09-06'), draft: true },
          release('v2', '2026-09-05', '# Release\n- New maps\n2. Faster loading'),
          release('v1', '2026-09-04'),
        ]);
      if (url.endsWith('/compare/v1...v2'))
        return json({ files: [{ additions: 10, deletions: 2 }, { additions: 3 }] });
      throw new Error(`Unexpected request: ${url}`);
    });
    const response = await (await loadHandler())(event);
    expect(response).toMatchObject({
      source: 'releases',
      hasMore: false,
      items: [
        {
          label: 'v2',
          bullets: [{ text: 'New maps.' }, { text: 'Faster loading.' }],
          stats: { additions: 13, deletions: 2 },
        },
        { label: 'v1' },
      ],
    });
    expect(requests()).toHaveLength(2);
    expect(mocks.headers).toHaveBeenCalledWith(event, {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    });
  });
  it('groups useful commits by day, aggregates available stats and exposes pagination', async () => {
    mocks.query.mockReturnValue({ limit: 1 });
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes('/releases?')) return json([]);
      if (url.includes('/commits?'))
        return json([
          commit('a', '2026-09-05'),
          commit('b', '2026-09-05', 'feat: filters'),
          commit('ignored', '2026-09-05', 'chore: dependencies'),
          commit('c', '2026-09-04'),
        ]);
      if (url.endsWith('/commits/a')) return json({ stats: { additions: 4, deletions: 1 } });
      return json({}, 503);
    });
    const response = await (await loadHandler())(event);
    expect(response).toMatchObject({
      source: 'commits',
      hasMore: true,
      items: [
        {
          date: '2026-09-05',
          bullets: [{ text: 'Fixed map markers.' }, { text: 'Added filters.' }],
          stats: { additions: 4, deletions: 1 },
        },
      ],
    });
    expect(requests().some((url) => url.endsWith('/commits/ignored'))).toBe(false);
  });
  it('continues to the next commit page when the first page has no visible changes', async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes('/releases?')) return json([]);
      if (new URL(url).searchParams.get('page') === '1')
        return json(
          Array.from({ length: 100 }, (_, i) => commit(`hidden-${i}`, '2026-09-05', 'docs: notes'))
        );
      if (new URL(url).searchParams.get('page') === '2')
        return json([commit('visible', '2026-09-04')]);
      return json({ stats: { additions: 1, deletions: 0 } });
    });
    expect((await (await loadHandler())(event)).items[0]?.bullets[0]).toMatchObject({
      text: 'Fixed map markers.',
    });
    expect(requests().filter((url) => url.includes('/commits?'))).toHaveLength(2);
  });
  it('uses local responses until expiry and reuses longer-lived commit stats', async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes('/releases?')) return json([]);
      if (url.includes('/commits?')) return json([commit('a', '2026-09-05')]);
      return json({ stats: { additions: 2, deletions: 1 } });
    });
    const handler = await loadHandler();
    const first = await handler(event);
    expect(await handler(event)).toEqual(first);
    expect(requests()).toHaveLength(3);
    vi.setSystemTime(new Date('2026-09-06T12:05:00Z'));
    await handler(event);
    expect(requests()).toHaveLength(5);
    vi.setSystemTime(new Date('2026-09-06T12:30:00Z'));
    await handler(event);
    expect(requests().filter((url) => url.endsWith('/commits/a'))).toHaveLength(2);
  });
  it('loads a valid shared response without GitHub and warms local cache', async () => {
    enableSharedCache();
    const response = {
      source: 'commits',
      items: [{ date: '2026-09-05', bullets: [{ text: 'Fixed maps.' }] }],
      hasMore: false,
    };
    mocks.match.mockResolvedValue(json({ response, timestamp: Date.now() }));
    const handler = await loadHandler();
    expect(await handler(event)).toEqual(response);
    expect(await handler(event)).toEqual(response);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.match).toHaveBeenCalledTimes(1);
  });
  it.each(['expired', 'malformed', 'unreadable'])('rebuilds a %s shared response', async (kind) => {
    enableSharedCache();
    mocks.match.mockImplementation(async () =>
      kind === 'unreadable'
        ? new Response('not JSON')
        : json(
            kind === 'expired'
              ? { timestamp: Date.now() - 300000, response: { items: [{ date: 'old' }] } }
              : { response: null }
          )
    );
    const result = await (await loadHandler())(event);
    expect(result).toEqual({ source: 'commits', items: [], hasMore: false });
    expect(mocks.fetch).toHaveBeenCalled();
    expect(mocks.put).toHaveBeenCalled();
  });
  it('uses shared stats, then writes a cacheable response', async () => {
    enableSharedCache();
    mocks.match.mockImplementation(async (request: Request) =>
      request.url.includes('/changelog-stats/')
        ? json({ stats: { additions: 7, deletions: 3 }, timestamp: Date.now() })
        : undefined
    );
    mocks.fetch.mockImplementation(async (url: string) =>
      url.includes('/releases?') ? json([]) : json([commit('a', '2026-09-05')])
    );
    const response = await (await loadHandler())(event);
    expect(response.items[0]?.stats).toEqual({ additions: 7, deletions: 3 });
    expect(requests()).toHaveLength(2);
    const [, stored] = mocks.put.mock.calls[0]!;
    expect(stored.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300');
    expect(await stored.json()).toMatchObject({ response, timestamp: Date.now() });
  });
  it('keeps serving results when shared-cache reads and writes fail', async () => {
    enableSharedCache();
    mocks.match.mockRejectedValue(new Error('cache offline'));
    mocks.put.mockRejectedValue(new Error('write failed'));
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes('/releases?')) return json([]);
      if (url.includes('/commits?')) return json([commit('a', '2026-09-05')]);
      return json({ stats: { additions: 2, deletions: 1 } });
    });
    expect((await (await loadHandler())(event)).items).toHaveLength(1);
    expect(mocks.put).toHaveBeenCalledTimes(2);
  });
  it('falls back to commits when releases fail', async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes('/releases?')) return json({}, 503);
      if (url.includes('/commits?')) return json([commit('a', '2026-09-05')]);
      return json({});
    });
    expect(await (await loadHandler())(event)).toMatchObject({
      source: 'commits',
      items: [{ date: '2026-09-05' }],
    });
  });
  it.each([403, 429, 503])(
    'returns a retryable error instead of caching a total GitHub failure (%s)',
    async (status) => {
      mocks.fetch.mockImplementation(async () => json({}, status));
      const handler = await loadHandler();
      expect(await handler(event)).toMatchObject({ items: [], error: 'Failed to fetch changelog' });
      await handler(event);
      expect(mocks.fetch).toHaveBeenCalledTimes(4);
    }
  );
  it('handles invalid JSON and exhausted rate-limit responses', async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response('broken JSON'))
      .mockResolvedValueOnce(new Response('[]', { headers: { 'x-ratelimit-remaining': '0' } }));
    expect(await (await loadHandler())(event)).toMatchObject({
      error: 'Failed to fetch changelog',
    });
  });
  it('aborts timed-out requests and clears timeout timers', async () => {
    mocks.fetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Timed out', 'AbortError')),
            { once: true }
          );
        })
    );
    const pending = (await loadHandler())(event);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toMatchObject({ error: 'Failed to fetch changelog' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clamps repeated/out-of-range query values and sends configured authentication', async () => {
    mocks.query.mockReturnValue({ limit: ['-20', '50'], releases: '100' });
    mocks.config.githubToken = ' fixture-token ';
    await (
      await loadHandler()
    )(event);
    expect(requests()[0]).toBe('https://api.github.com/repos/owner/repo/releases?per_page=10');
    expect(mocks.fetch.mock.calls[0]?.[1].headers).toMatchObject({
      Authorization: 'token fixture-token',
    });
  });
});
