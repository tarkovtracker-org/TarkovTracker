export type SharedCacheOrigin = {
  host: string;
  protocol: string;
};
export type SharedCacheHandle = {
  cache: Cache | null;
  origin: SharedCacheOrigin;
};
type SharedCacheEnvelope<T> = {
  expiresAt: number;
  payload: T;
};
type SharedCacheErrorContext = {
  action: 'read' | 'write';
  error: unknown;
  key: string;
  prefix: string;
};
type SharedCacheErrorHandler = (context: SharedCacheErrorContext) => void;
type SharedRateLimitEntry = {
  count: number;
  resetAt: number;
};
const DEFAULT_ORIGIN: SharedCacheOrigin = {
  host: 'tarkovtracker.org',
  protocol: 'https:',
};
const getSharedCache = (): Cache | null => {
  const cacheStorage = (
    globalThis as typeof globalThis & { caches?: CacheStorage & { default?: Cache } }
  ).caches;
  return cacheStorage?.default ?? null;
};
const resolveSharedCacheOrigin = (appUrl: unknown): SharedCacheOrigin => {
  if (typeof appUrl !== 'string' || appUrl.trim().length === 0) {
    return DEFAULT_ORIGIN;
  }
  try {
    const parsedAppUrl = new URL(appUrl);
    const hostname = parsedAppUrl.hostname;
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      /^127\./.test(hostname);
    if (isLocalhost) {
      return DEFAULT_ORIGIN;
    }
    return {
      host: parsedAppUrl.host,
      protocol: parsedAppUrl.protocol || 'https:',
    };
  } catch {
    return DEFAULT_ORIGIN;
  }
};
const buildSharedCacheRequest = (
  origin: SharedCacheOrigin,
  prefix: string,
  key: string
): Request => {
  const encodedKey = encodeURIComponent(key);
  const cacheUrl = new URL(
    `${origin.protocol}//${origin.host}/__edge-cache/${prefix}/${encodedKey}`
  );
  return new Request(cacheUrl.toString());
};
const isSharedCacheEnvelope = <T>(value: unknown): value is SharedCacheEnvelope<T> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as SharedCacheEnvelope<T>;
  return typeof candidate.expiresAt === 'number' && Number.isFinite(candidate.expiresAt);
};
const isRateLimitEntry = (value: unknown): value is SharedRateLimitEntry => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as SharedRateLimitEntry;
  return (
    typeof candidate.count === 'number' &&
    Number.isFinite(candidate.count) &&
    typeof candidate.resetAt === 'number' &&
    Number.isFinite(candidate.resetAt)
  );
};
const getTtlSeconds = (ttlMs: number): number => {
  return Math.max(1, Math.ceil(ttlMs / 1000));
};
export const createSharedCacheHandle = (appUrl: unknown): SharedCacheHandle => ({
  cache: getSharedCache(),
  origin: resolveSharedCacheOrigin(appUrl),
});
export const readSharedCache = async <T>(
  handle: SharedCacheHandle,
  prefix: string,
  key: string,
  onError?: SharedCacheErrorHandler
): Promise<T | null> => {
  if (!handle.cache) {
    return null;
  }
  try {
    const response = await handle.cache.match(buildSharedCacheRequest(handle.origin, prefix, key));
    if (!response) {
      return null;
    }
    const envelope = (await response.json()) as unknown;
    if (!isSharedCacheEnvelope<T>(envelope)) {
      return null;
    }
    if (Date.now() >= envelope.expiresAt) {
      return null;
    }
    return envelope.payload;
  } catch (error) {
    onError?.({ action: 'read', error, key, prefix });
    return null;
  }
};
export const writeSharedCache = async <T>(
  handle: SharedCacheHandle,
  prefix: string,
  key: string,
  payload: T,
  ttlMs: number,
  onError?: SharedCacheErrorHandler
): Promise<void> => {
  if (!handle.cache || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return;
  }
  const ttl = Math.max(1, Math.trunc(ttlMs));
  const envelope: SharedCacheEnvelope<T> = {
    expiresAt: Date.now() + ttl,
    payload,
  };
  try {
    const response = new Response(JSON.stringify(envelope), {
      headers: {
        'Cache-Control': `public, max-age=${getTtlSeconds(ttl)}, s-maxage=${getTtlSeconds(ttl)}`,
        'Content-Type': 'application/json',
      },
    });
    await handle.cache.put(buildSharedCacheRequest(handle.origin, prefix, key), response);
  } catch (error) {
    onError?.({ action: 'write', error, key, prefix });
  }
};
export const consumeSharedRateLimit = async (
  handle: SharedCacheHandle,
  prefix: string,
  key: string,
  limit: number,
  windowMs: number,
  onError?: SharedCacheErrorHandler
): Promise<boolean> => {
  if (
    !handle.cache ||
    !Number.isFinite(limit) ||
    limit <= 0 ||
    !Number.isFinite(windowMs) ||
    windowMs <= 0
  ) {
    return true;
  }
  const now = Date.now();
  const existing = await readSharedCache<unknown>(handle, prefix, key, onError);
  let entry: SharedRateLimitEntry;
  if (!isRateLimitEntry(existing) || now >= existing.resetAt) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
  } else {
    entry = {
      count: Math.max(0, Math.trunc(existing.count)),
      resetAt: existing.resetAt,
    };
  }
  if (entry.count >= limit) {
    return false;
  }
  const nextEntry: SharedRateLimitEntry = {
    count: entry.count + 1,
    resetAt: entry.resetAt,
  };
  const ttlMs = Math.max(1, nextEntry.resetAt - now);
  await writeSharedCache(handle, prefix, key, nextEntry, ttlMs, onError);
  return true;
};
