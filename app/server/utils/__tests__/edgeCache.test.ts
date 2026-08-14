import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, createError, setResponseHeaders } from 'h3';
const { _appUrl, _bypassEnabled } = vi.hoisted(() => ({
  _appUrl: { value: undefined as string | undefined },
  _bypassEnabled: { value: false },
}));
vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    publicCacheBypassEnabled: _bypassEnabled.value,
    public: {
      appUrl: _appUrl.value,
    },
  }),
}));
type CacheSpy = {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};
const createEvent = (headers: Record<string, string> = {}, url = '/api/test?lang=en'): H3Event => {
  return {
    node: {
      req: {
        headers,
        url,
      },
    },
    context: {},
  } as unknown as H3Event;
};
describe('edgeCache', () => {
  let cacheSpy: CacheSpy;
  let lastMatchUrl: string | null;
  let setHeaders: typeof setResponseHeaders;
  let createErrorFn: typeof createError;
  let previousBypassEnabled: string | undefined;
  beforeEach(() => {
    lastMatchUrl = null;
    previousBypassEnabled = process.env.NUXT_CACHE_BYPASS_ENABLED;
    cacheSpy = {
      match: vi.fn(async (request: Request) => {
        lastMatchUrl = request.url;
        return undefined;
      }),
      put: vi.fn(async () => undefined),
    };
    vi.stubGlobal('caches', { default: cacheSpy });
    setHeaders = vi.fn() as unknown as typeof setResponseHeaders;
    createErrorFn = ((value) => value) as typeof createError;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    _appUrl.value = undefined;
    _bypassEnabled.value = false;
    if (previousBypassEnabled === undefined) {
      delete process.env.NUXT_CACHE_BYPASS_ENABLED;
    } else {
      process.env.NUXT_CACHE_BYPASS_ENABLED = previousBypassEnabled;
    }
  });
  it('falls back to default cache host when appUrl is localhost', async () => {
    _appUrl.value = 'http://localhost:3000';
    const event = createEvent({ host: 'maps.example.com', 'x-forwarded-proto': 'https' });
    const { edgeCache } = await import('@/server/utils/edgeCache');
    await edgeCache(event, 'items-en', async () => ({ ok: true }), 60, {
      cacheKeyPrefix: 'tarkov',
      deps: {
        createErrorFn,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(lastMatchUrl).toBe('https://tarkovtracker.org/__edge-cache/tarkov/items-en');
  });
  it('returns cached payload on cache hit', async () => {
    cacheSpy.match.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { items: [{ id: 'cached' }] } }), {
        headers: { 'X-Cache-Stored-At': String(Date.now()) },
      })
    );
    const fetcher = vi.fn(async () => ({ data: { items: [{ id: 'fresh' }] } }));
    const event = createEvent();
    const { edgeCache } = await import('@/server/utils/edgeCache');
    const result = await edgeCache(event, 'items-en', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      deps: {
        createErrorFn,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(result).toEqual({ data: { items: [{ id: 'cached' }] } });
    expect(fetcher).not.toHaveBeenCalled();
    expect(cacheSpy.put).not.toHaveBeenCalled();
  });
  it('serves a stale entry and refreshes it in the background', async () => {
    const staleStoredAt = Date.now() - 61_000;
    cacheSpy.match.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { items: [{ id: 'stale' }] } }), {
        headers: { 'X-Cache-Stored-At': String(staleStoredAt) },
      })
    );
    const fetcher = vi.fn(async () => ({ data: { items: [{ id: 'fresh' }] } }));
    const background: Promise<unknown>[] = [];
    const event = createEvent();
    (event.context as { cloudflare?: unknown }).cloudflare = {
      context: { waitUntil: (p: Promise<unknown>) => background.push(p) },
    };
    const { edgeCache } = await import('@/server/utils/edgeCache');
    const result = await edgeCache(event, 'items-en', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      deps: {
        createErrorFn,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(result).toEqual({ data: { items: [{ id: 'stale' }] } });
    expect(setHeaders).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ 'X-Cache-Status': 'STALE', 'Cache-Control': 'no-cache' })
    );
    await Promise.all(background);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cacheSpy.put).toHaveBeenCalledTimes(1);
    const storedResponse = cacheSpy.put.mock.calls[0]?.[1] as Response;
    expect(await storedResponse.clone().json()).toEqual({ data: { items: [{ id: 'fresh' }] } });
    expect(storedResponse.headers.get('X-Cache-Stored-At')).toBeTruthy();
  });
  it('keeps serving stale data when background revalidation fails', async () => {
    const staleStoredAt = Date.now() - 61_000;
    cacheSpy.match.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { items: [{ id: 'stale' }] } }), {
        headers: { 'X-Cache-Stored-At': String(staleStoredAt) },
      })
    );
    const fetcher = vi.fn(async () => {
      throw new Error('upstream down');
    });
    const background: Promise<unknown>[] = [];
    const event = createEvent();
    (event.context as { cloudflare?: unknown }).cloudflare = {
      context: { waitUntil: (p: Promise<unknown>) => background.push(p) },
    };
    const { edgeCache } = await import('@/server/utils/edgeCache');
    const result = await edgeCache(event, 'items-en', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      deps: {
        createErrorFn,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(result).toEqual({ data: { items: [{ id: 'stale' }] } });
    await Promise.all(background);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cacheSpy.put).not.toHaveBeenCalled();
  });
  it('serves precomputed payload from the KV store without touching edge cache', async () => {
    const precomputedStore = {
      get: vi.fn(async () => ({
        payload: { data: { tasks: [{ id: 'precomputed' }] } },
        storedAt: Date.now(),
        version: 1,
      })),
    };
    const fetcher = vi.fn(async () => ({ data: { tasks: [{ id: 'fresh' }] } }));
    const event = createEvent();
    const { edgeCache } = await import('@/server/utils/edgeCache');
    const result = await edgeCache(event, 'tasks-core-json-v2-en-regular', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      precomputed: true,
      deps: {
        createErrorFn,
        precomputedStore,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(result).toEqual({ data: { tasks: [{ id: 'precomputed' }] } });
    expect(precomputedStore.get).toHaveBeenCalledWith('tasks-core-json-v2-en-regular', 'json');
    expect(fetcher).not.toHaveBeenCalled();
    expect(cacheSpy.match).not.toHaveBeenCalled();
    expect(cacheSpy.put).not.toHaveBeenCalled();
    expect(setHeaders).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        'X-Cache-Status': 'PRECOMPUTE',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      })
    );
  });
  it('resolves the precomputed store from the Cloudflare binding on the event', async () => {
    const kvGet = vi.fn(async () => ({
      payload: { data: { tasks: [{ id: 'from-binding' }] } },
      storedAt: Date.now(),
      version: 1,
    }));
    const fetcher = vi.fn(async () => ({ data: { tasks: [{ id: 'fresh' }] } }));
    const event = createEvent();
    (event.context as { cloudflare?: unknown }).cloudflare = {
      env: { TARKOV_DATA: { get: kvGet } },
    };
    const { edgeCache } = await import('@/server/utils/edgeCache');
    const result = await edgeCache(event, 'tasks-core-json-v2-en-regular', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      precomputed: true,
      deps: {
        createErrorFn,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(result).toEqual({ data: { tasks: [{ id: 'from-binding' }] } });
    expect(kvGet).toHaveBeenCalledWith('tasks-core-json-v2-en-regular', 'json');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('falls back to edge cache when the precomputed entry is missing', async () => {
    const precomputedStore = { get: vi.fn(async () => null) };
    const fetcher = vi.fn(async () => ({ data: { tasks: [{ id: 'fresh' }] } }));
    const event = createEvent();
    const { edgeCache } = await import('@/server/utils/edgeCache');
    const result = await edgeCache(event, 'tasks-core-json-v2-en-regular', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      precomputed: true,
      deps: {
        createErrorFn,
        precomputedStore,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(result).toEqual({ data: { tasks: [{ id: 'fresh' }] } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cacheSpy.match).toHaveBeenCalledTimes(1);
    expect(cacheSpy.put).toHaveBeenCalledTimes(1);
    expect(setHeaders).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ 'X-Cache-Status': 'MISS' })
    );
  });
  it('falls back to edge cache when the precomputed entry is malformed', async () => {
    const precomputedStore = { get: vi.fn(async () => ({ unexpected: true })) };
    const fetcher = vi.fn(async () => ({ data: { tasks: [{ id: 'fresh' }] } }));
    const event = createEvent();
    const { edgeCache } = await import('@/server/utils/edgeCache');
    const result = await edgeCache(event, 'tasks-core-json-v2-en-regular', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      precomputed: true,
      deps: {
        createErrorFn,
        precomputedStore,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(result).toEqual({ data: { tasks: [{ id: 'fresh' }] } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('falls back to edge cache when the precomputed store read fails', async () => {
    const precomputedStore = {
      get: vi.fn(async () => {
        throw new Error('kv unavailable');
      }),
    };
    const fetcher = vi.fn(async () => ({ data: { tasks: [{ id: 'fresh' }] } }));
    const event = createEvent();
    const { edgeCache } = await import('@/server/utils/edgeCache');
    const result = await edgeCache(event, 'tasks-core-json-v2-en-regular', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      precomputed: true,
      deps: {
        createErrorFn,
        precomputedStore,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(result).toEqual({ data: { tasks: [{ id: 'fresh' }] } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cacheSpy.put).toHaveBeenCalledTimes(1);
  });
  it('skips the precomputed store when operator bypass is requested', async () => {
    process.env.NUXT_CACHE_BYPASS_ENABLED = 'true';
    _bypassEnabled.value = true;
    const precomputedStore = { get: vi.fn() };
    const fetcher = vi.fn(async () => ({ data: { tasks: [{ id: 'fresh' }] } }));
    const event = createEvent({ 'x-bypass-cache': 'true' });
    const { edgeCache } = await import('@/server/utils/edgeCache');
    await edgeCache(event, 'tasks-core-json-v2-en-regular', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      precomputed: true,
      deps: {
        createErrorFn,
        precomputedStore,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(precomputedStore.get).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('stores fresh payload on cache miss', async () => {
    const fetcher = vi.fn(async () => ({ data: { items: [{ id: 'fresh' }] } }));
    const event = createEvent();
    const { edgeCache } = await import('@/server/utils/edgeCache');
    const result = await edgeCache(event, 'items-en', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      deps: {
        createErrorFn,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(result).toEqual({ data: { items: [{ id: 'fresh' }] } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cacheSpy.put).toHaveBeenCalledTimes(1);
  });
  it('ignores public bypass headers unless bypass is enabled', async () => {
    const fetcher = vi.fn(async () => ({ data: { items: [{ id: 'fresh' }] } }));
    const event = createEvent({ 'x-bypass-cache': 'true' });
    const { edgeCache } = await import('@/server/utils/edgeCache');
    await edgeCache(event, 'items-en', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      deps: {
        createErrorFn,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cacheSpy.match).toHaveBeenCalledTimes(1);
    expect(cacheSpy.put).toHaveBeenCalledTimes(1);
  });
  it('bypasses cache and skips writes when operator bypass is enabled', async () => {
    process.env.NUXT_CACHE_BYPASS_ENABLED = 'true';
    _bypassEnabled.value = true;
    const fetcher = vi.fn(async () => ({ data: { items: [{ id: 'fresh' }] } }));
    const event = createEvent({ 'x-bypass-cache': 'true' });
    const { edgeCache } = await import('@/server/utils/edgeCache');
    await edgeCache(event, 'items-en', fetcher, 60, {
      cacheKeyPrefix: 'tarkov',
      deps: {
        createErrorFn,
        setResponseHeadersFn: setHeaders,
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cacheSpy.match).not.toHaveBeenCalled();
    expect(cacheSpy.put).not.toHaveBeenCalled();
  });
  it('sanitizes error details in thrown status message', async () => {
    const event = createEvent();
    const { edgeCache } = await import('@/server/utils/edgeCache');
    await expect(
      edgeCache(
        event,
        'items-en',
        async () => {
          throw new Error('failed https://secret.example.com/path/to/file.sql');
        },
        60,
        {
          cacheKeyPrefix: 'tarkov',
          deps: {
            createErrorFn,
            setResponseHeadersFn: setHeaders,
          },
        }
      )
    ).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: expect.stringContaining('[host]'),
    });
  });
});
