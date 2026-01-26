import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { edgeCache } from '@/server/utils/edgeCache';
import type { H3Event } from 'h3';
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
const createEvent = (host: string, forwardedProto: string): H3Event => {
  return {
    node: {
      req: {
        headers: {
          host,
          'x-forwarded-proto': forwardedProto,
        },
        url: '/api/test',
      },
    },
    context: {},
  } as unknown as H3Event;
};
describe('edgeCache', () => {
  let cacheSpy: CacheSpy;
  let lastMatchUrl: string | null;
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
    vi.stubGlobal('setResponseHeaders', vi.fn());
    vi.stubGlobal('createError', (value: unknown) => value);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    appUrl = undefined;
  });
  it('falls back to request host when appUrl is localhost', async () => {
    appUrl = 'http://localhost:3000';
    const event = createEvent('maps.example.com', 'https');
    await edgeCache(event, 'items-en', async () => ({ ok: true }), 60, {
      cacheKeyPrefix: 'tarkov',
    });
    expect(lastMatchUrl).toBe('https://maps.example.com/__edge-cache/tarkov/items-en');
  });
  it('treats 127.0.0.0/8 as localhost for cache host selection', async () => {
    appUrl = 'http://127.0.0.2:3000';
    const event = createEvent('edge.example.com', 'http');
    await edgeCache(event, 'items-en', async () => ({ ok: true }), 60, {
      cacheKeyPrefix: 'tarkov',
    });
    expect(lastMatchUrl).toBe('http://edge.example.com/__edge-cache/tarkov/items-en');
  });
});
