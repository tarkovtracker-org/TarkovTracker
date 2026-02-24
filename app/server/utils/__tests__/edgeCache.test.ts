import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, createError, setResponseHeaders } from 'h3';
let appUrl: string | undefined;
vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    public: {
      appUrl,
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
  beforeEach(() => {
    lastMatchUrl = null;
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
    appUrl = undefined;
  });
  it('falls back to default cache host when appUrl is localhost', async () => {
    appUrl = 'http://localhost:3000';
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
      new Response(JSON.stringify({ data: { items: [{ id: 'cached' }] } }))
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
  it('bypasses cache and skips writes when bypass header is set', async () => {
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
