import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const createCacheMock = (): Cache => {
  const entries = new Map<string, Response>();
  const toKey = (request: RequestInfo | URL) => {
    return request instanceof Request ? request.url : String(request);
  };
  return {
    match: vi.fn(async (request: RequestInfo | URL) => {
      const response = entries.get(toKey(request));
      return response ? response.clone() : undefined;
    }),
    put: vi.fn(async (request: RequestInfo | URL, response: Response) => {
      entries.set(toKey(request), response.clone());
    }),
  } as unknown as Cache;
};
const createHandle = () => ({
  cache: createCacheMock(),
  origin: {
    host: 'example.com',
    protocol: 'https:',
  },
});
describe('consumeSharedRateLimit', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('keeps enforcing the active shared window', async () => {
    const { consumeSharedRateLimit, writeSharedCache } =
      await import('@/server/utils/sharedEdgeStore');
    const handle = createHandle();
    await writeSharedCache(
      handle,
      'rate-limit',
      'user-1',
      {
        count: 4,
        resetAt: Date.now() + 1000,
      },
      1000
    );
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      false
    );
  });
  it('opens a new local window once the shared window has rolled over', async () => {
    const { consumeSharedRateLimit, writeSharedCache } =
      await import('@/server/utils/sharedEdgeStore');
    const handle = createHandle();
    await writeSharedCache(
      handle,
      'rate-limit',
      'user-1',
      {
        count: 4,
        resetAt: Date.now() + 1000,
      },
      1000
    );
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
    vi.setSystemTime(new Date('2026-03-10T12:00:01.500Z'));
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
  });
  it('keeps the newer local window count when the shared window is older', async () => {
    const { consumeSharedRateLimit, readSharedCache, writeSharedCache } =
      await import('@/server/utils/sharedEdgeStore');
    const handle = createHandle();
    const localResetAt = new Date('2026-03-10T12:01:00.000Z').getTime();
    const sharedResetAt = new Date('2026-03-10T12:00:30.000Z').getTime();
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
    vi.setSystemTime(new Date('2026-03-10T12:00:05.000Z'));
    await writeSharedCache(
      handle,
      'rate-limit',
      'user-1',
      {
        count: 4,
        resetAt: sharedResetAt,
      },
      sharedResetAt - Date.now()
    );
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
    await expect(readSharedCache(handle, 'rate-limit', 'user-1')).resolves.toEqual({
      count: 2,
      resetAt: localResetAt,
    });
  });
  it('keeps the newer shared window count when the local window is older', async () => {
    const { consumeSharedRateLimit, readSharedCache, writeSharedCache } =
      await import('@/server/utils/sharedEdgeStore');
    const handle = createHandle();
    const sharedResetAt = new Date('2026-03-10T12:01:30.000Z').getTime();
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
    vi.setSystemTime(new Date('2026-03-10T12:00:05.000Z'));
    await writeSharedCache(
      handle,
      'rate-limit',
      'user-1',
      {
        count: 1,
        resetAt: sharedResetAt,
      },
      sharedResetAt - Date.now()
    );
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
    await expect(readSharedCache(handle, 'rate-limit', 'user-1')).resolves.toEqual({
      count: 2,
      resetAt: sharedResetAt,
    });
  });
  it('preserves the local fallback counter when shared cache writes fail', async () => {
    const { consumeSharedRateLimit } = await import('@/server/utils/sharedEdgeStore');
    const handle = {
      cache: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => {
          throw new Error('cache unavailable');
        }),
      } as unknown as Cache,
      origin: {
        host: 'example.com',
        protocol: 'https:',
      },
    };
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 2, 60_000)).resolves.toBe(
      true
    );
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 2, 60_000)).resolves.toBe(
      true
    );
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 2, 60_000)).resolves.toBe(
      false
    );
  });
  it('serializes concurrent same-isolate calls so the cap is enforced exactly', async () => {
    const { consumeSharedRateLimit } = await import('@/server/utils/sharedEdgeStore');
    let releaseReads: () => void = () => {};
    const allReadsStarted = (() => {
      let started = 0;
      let resolveGate: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        resolveGate = resolve;
      });
      return {
        gate,
        mark: () => {
          started += 1;
          if (started === 5) {
            resolveGate();
          }
        },
      };
    })();
    const barrier = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const handle = {
      cache: {
        match: vi.fn(async () => {
          allReadsStarted.mark();
          await barrier;
          return undefined;
        }),
        put: vi.fn(async () => undefined),
      } as unknown as Cache,
      origin: {
        host: 'example.com',
        protocol: 'https:',
      },
    };
    const calls = Array.from({ length: 5 }, () =>
      consumeSharedRateLimit(handle, 'rate-limit', 'burst-user', 3, 60_000)
    );
    await allReadsStarted.gate;
    releaseReads();
    const results = await Promise.all(calls);
    expect(results.filter((allowed) => allowed === true)).toHaveLength(3);
    expect(results.filter((allowed) => allowed === false)).toHaveLength(2);
  });
  it('delegates to the durable object limiter when the binding is present', async () => {
    const { consumeSharedRateLimit } = await import('@/server/utils/sharedEdgeStore');
    const stubFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ allowed: true }))
    );
    const cacheMatch = vi.fn(async () => undefined);
    const handle = {
      cache: { match: cacheMatch, put: vi.fn(async () => undefined) } as unknown as Cache,
      origin: { host: 'example.com', protocol: 'https:' },
      limiter: {
        idFromName: vi.fn(() => 'id-1'),
        get: vi.fn(() => ({ fetch: stubFetch })),
      },
    };
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      true
    );
    expect(stubFetch).toHaveBeenCalledTimes(1);
    expect(cacheMatch).not.toHaveBeenCalled();
    const requestInit = stubFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const sentBody = JSON.parse(String(requestInit?.body));
    expect(sentBody).toEqual({ limit: 5, windowSec: 60 });
  });
  it('blocks when the durable object limiter denies the request', async () => {
    const { consumeSharedRateLimit } = await import('@/server/utils/sharedEdgeStore');
    const handle = {
      cache: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      } as unknown as Cache,
      origin: { host: 'example.com', protocol: 'https:' },
      limiter: {
        idFromName: vi.fn(() => 'id-1'),
        get: vi.fn(() => ({
          fetch: vi.fn(async () => new Response(JSON.stringify({ allowed: false }))),
        })),
      },
    };
    await expect(consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 5, 60_000)).resolves.toBe(
      false
    );
  });
  it('fails open to the cache path when the durable object limiter errors', async () => {
    const { consumeSharedRateLimit } = await import('@/server/utils/sharedEdgeStore');
    const cacheMatch = vi.fn(async () => undefined);
    const onError = vi.fn();
    const handle = {
      cache: { match: cacheMatch, put: vi.fn(async () => undefined) } as unknown as Cache,
      origin: { host: 'example.com', protocol: 'https:' },
      limiter: {
        idFromName: vi.fn(() => 'id-1'),
        get: vi.fn(() => ({
          fetch: vi.fn(async () => {
            throw new Error('durable object unavailable');
          }),
        })),
      },
    };
    await expect(
      consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 2, 60_000, onError)
    ).resolves.toBe(true);
    expect(cacheMatch).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
  it('aborts a hung durable object request and falls back to the cache path', async () => {
    const { consumeSharedRateLimit } = await import('@/server/utils/sharedEdgeStore');
    const cacheMatch = vi.fn(async () => undefined);
    const onError = vi.fn();
    const stubFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        })
    );
    const handle = {
      cache: { match: cacheMatch, put: vi.fn(async () => undefined) } as unknown as Cache,
      origin: { host: 'example.com', protocol: 'https:' },
      limiter: {
        idFromName: vi.fn(() => 'id-1'),
        get: vi.fn(() => ({ fetch: stubFetch })),
      },
    };
    const pending = consumeSharedRateLimit(handle, 'rate-limit', 'user-1', 2, 60_000, onError);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toBe(true);
    expect(cacheMatch).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
