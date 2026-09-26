// @vitest-environment node
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createApp, eventHandler, getQuery, toWebHandler } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { edgeCache } from '@/server/utils/edgeCache';
const { config } = vi.hoisted(() => ({
  config: { publicCacheBypassEnabled: false, public: { appUrl: 'https://tarkovtracker.org' } },
}));
mockNuxtImport('useRuntimeConfig', () => () => config);
const payload = {
  data: { items: [{ id: 'item', name: 'Équipement' }] },
  dataOverlay: { status: 'fresh', version: '1.2', generated: '2026-09-25', sha256: 'abc123' },
};
function harness(options: { cache?: boolean; precomputed?: boolean; response?: boolean } = {}) {
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      entries.set(request.url, response.clone());
    }),
  };
  vi.stubGlobal('caches', options.cache === false ? undefined : { default: cache });
  const fetcher = vi.fn(async () => payload);
  const precomputedStore = { get: vi.fn<(key: string, type: 'json') => Promise<unknown>>() };
  const background: Promise<unknown>[] = [];
  const app = createApp();
  app.use(
    eventHandler((event) => {
      event.context.cloudflare = {
        context: { waitUntil: (task: Promise<unknown>) => background.push(task) },
      };
      const query = getQuery(event);
      const key = `items-${query.lang ?? 'en'}-${query.gameMode ?? 'regular'}`;
      const settings = {
        cacheKeyPrefix: 'tarkov',
        precomputed: options.precomputed,
        deps: { precomputedStore },
      };
      return options.response === false
        ? edgeCache(event, key, fetcher, 60, settings)
        : edgeCache(event, key, fetcher, 60, { ...settings, response: true });
    })
  );
  const handler = toWebHandler(app);
  const request = (query = '', headers?: HeadersInit) =>
    handler(new Request(`https://tarkovtracker.org/api/tarkov/items${query}`, { headers }));
  return { entries, cache, fetcher, precomputedStore, background, request };
}
describe('edgeCache final response mode through H3', () => {
  beforeEach(() => {
    config.publicCacheBypassEnabled = false;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('preserves JSON and public headers on MISS and HIT while storing overlay metadata', async () => {
    const h = harness();
    const miss = await h.request();
    expect(miss.headers.get('x-cache-status')).toBe('MISS');
    expect(await miss.json()).toEqual(payload);
    await Promise.all(h.background);
    const stored = [...h.entries.values()][0]!;
    expect(stored.headers.get('x-cache-response-version')).toBe('1');
    expect(stored.headers.get('x-overlay-sha256')).toBe('abc123');
    expect(stored.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=120');
    const hit = await h.request();
    expect(hit.headers.get('x-cache-status')).toBe('HIT');
    expect(hit.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60');
    expect(hit.headers.get('content-type')).toContain('application/json');
    expect(hit.headers.get('x-overlay-version')).toBe('1.2');
    expect(hit.headers.get('x-overlay-generated')).toBe('2026-09-25');
    expect(hit.headers.get('x-overlay-status')).toBe('fresh');
    expect(hit.headers.has('x-cache-stored-at')).toBe(false);
    expect(hit.headers.has('x-cache-response-version')).toBe(false);
    expect(await hit.json()).toEqual(payload);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it('streams a marked hit byte-for-byte without JSON parsing or framework serialization', async () => {
    const h = harness();
    const body = '{ "data": { "items": [] } }\n';
    const cached = new Response(body, {
      headers: {
        'X-Cache-Response-Version': '1',
        'X-Cache-Stored-At': String(Date.now()),
        'Content-Length': '999',
        'Cache-Control': 'public, max-age=60, s-maxage=120',
      },
    });
    const parse = vi.spyOn(cached, 'json').mockRejectedValue(new Error('must not parse'));
    h.cache.match.mockResolvedValueOnce(cached);
    const response = await h.request();
    expect(await response.text()).toBe(body);
    expect(parse).not.toHaveBeenCalled();
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(response.headers.get('content-length')).not.toBe('999');
    expect(response.headers.has('x-overlay-status')).toBe(false);
  });
  it.each([undefined, 'future-version'])(
    'parses older/unknown metadata version %s safely',
    async (version) => {
      const h = harness();
      const headers = new Headers();
      if (version) headers.set('X-Cache-Response-Version', version);
      const cached = new Response(JSON.stringify(payload), { headers });
      const parse = vi.spyOn(cached, 'json');
      h.cache.match.mockResolvedValueOnce(cached);
      const response = await h.request();
      expect(await response.json()).toEqual(payload);
      expect(parse).toHaveBeenCalledOnce();
      expect(response.headers.get('x-overlay-sha256')).toBe('abc123');
      expect(h.fetcher).not.toHaveBeenCalled();
    }
  );
  it('keeps the default object path available for post-cache overlay consumers', async () => {
    const h = harness({ response: false });
    h.cache.match.mockResolvedValueOnce(
      new Response(JSON.stringify(payload), {
        headers: { 'X-Cache-Response-Version': '1' },
      })
    );
    expect(await (await h.request()).json()).toEqual(payload);
  });
  it.each(['regular', 'pve', 'pvp-season'])('isolates locale keys in %s', async (mode) => {
    const h = harness();
    for (const locale of ['en', 'fr']) {
      const response = await h.request(`?lang=${locale}&gameMode=${mode}`);
      expect(response.headers.get('x-cache-key')).toBe(`tarkov-items-${locale}-${mode}`);
      await response.arrayBuffer();
    }
    await Promise.all(h.background);
    expect(h.entries.size).toBe(2);
  });
  it('isolates all game modes', async () => {
    const h = harness();
    for (const mode of ['regular', 'pve', 'pvp-season']) {
      await (await h.request(`?gameMode=${mode}`)).arrayBuffer();
    }
    await Promise.all(h.background);
    expect(h.entries.size).toBe(3);
  });
  it('serves stale bodies immediately and shares one background refresh', async () => {
    const h = harness();
    const stale = new Response(JSON.stringify(payload), {
      headers: {
        'X-Cache-Response-Version': '1',
        'X-Cache-Stored-At': String(Date.now() - 61_000),
        'X-Overlay-Version': '1.2',
      },
    });
    h.cache.match.mockImplementation(async () => stale.clone());
    const refresh = Promise.withResolvers<typeof payload>();
    h.fetcher.mockReturnValue(refresh.promise);
    const responses = await Promise.all([h.request(), h.request()]);
    for (const response of responses) {
      expect(response.headers.get('x-cache-status')).toBe('STALE');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(response.headers.get('x-overlay-version')).toBe('1.2');
      expect(await response.json()).toEqual(payload);
    }
    expect(h.fetcher).toHaveBeenCalledOnce();
    expect(h.background).toHaveLength(1);
    refresh.resolve(payload);
    await Promise.all(h.background);
    expect(h.cache.put).toHaveBeenCalledOnce();
  });
  it('keeps stale data and permits the next refresh after an upstream failure', async () => {
    const h = harness();
    h.cache.match.mockImplementation(
      async () =>
        new Response(JSON.stringify(payload), {
          headers: { 'X-Cache-Response-Version': '1', 'X-Cache-Stored-At': '1' },
        })
    );
    h.fetcher.mockRejectedValueOnce(new Error('upstream offline'));
    expect(await (await h.request()).json()).toEqual(payload);
    await Promise.all(h.background);
    expect(h.cache.put).not.toHaveBeenCalled();
    expect(await (await h.request()).json()).toEqual(payload);
    await Promise.all(h.background);
    expect(h.fetcher).toHaveBeenCalledTimes(2);
    expect(h.cache.put).toHaveBeenCalledOnce();
  });
  it('honors authorized bypass, skips KV and cache, and preserves overlay headers', async () => {
    config.publicCacheBypassEnabled = true;
    const h = harness({ precomputed: true });
    const response = await h.request('?nocache=true');
    expect(response.headers.get('x-cache-status')).toBe('BYPASS');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('x-overlay-sha256')).toBe('abc123');
    expect(await response.json()).toEqual(payload);
    expect(h.precomputedStore.get).not.toHaveBeenCalled();
    expect(h.cache.match).not.toHaveBeenCalled();
    expect(h.cache.put).not.toHaveBeenCalled();
  });
  it('ignores bypass flags unless enabled', async () => {
    const h = harness();
    expect((await h.request('?nocache=true')).headers.get('x-cache-status')).toBe('MISS');
    expect(h.cache.match).toHaveBeenCalledOnce();
    await Promise.all(h.background);
  });
  it('returns final JSON in local DEV mode', async () => {
    const h = harness({ cache: false });
    const response = await h.request();
    expect(response.headers.get('x-cache-status')).toBe('DEV');
    expect(await response.json()).toEqual(payload);
    expect(h.cache.put).not.toHaveBeenCalled();
  });
  it('preserves precompute validation and precedence when response mode is requested', async () => {
    const h = harness({ precomputed: true });
    h.precomputedStore.get.mockResolvedValue({
      version: 2,
      storedAt: Date.now(),
      payload,
      overlay: { version: '1.2', sha256: 'abc123' },
    });
    const response = await h.request();
    expect(response.headers.get('x-cache-status')).toBe('PRECOMPUTE');
    expect(await response.json()).toEqual(payload);
    expect(h.cache.match).not.toHaveBeenCalled();
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('falls back from mismatched precompute provenance to cache', async () => {
    const h = harness({ precomputed: true });
    h.precomputedStore.get.mockResolvedValue({
      version: 2,
      storedAt: Date.now(),
      payload,
      overlay: { version: 'wrong', sha256: 'abc123' },
    });
    h.cache.match.mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    expect((await h.request()).headers.get('x-cache-status')).toBe('HIT');
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it.each([502, 503])('preserves sanitized %s errors', async (status) => {
    const h = harness();
    h.fetcher.mockRejectedValue(
      Object.assign(new Error('failed https://secret.example/private.sql'), { statusCode: status })
    );
    const response = await h.request();
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain('secret.example');
  });
});
