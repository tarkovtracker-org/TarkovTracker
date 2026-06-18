export type SharedCacheOrigin = {
  host: string;
  protocol: string;
};
export type SharedRateLimitStub = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};
export type SharedRateLimitNamespace = {
  idFromName: (name: string) => unknown;
  get: (id: unknown) => SharedRateLimitStub;
};
export type SharedCacheHandle = {
  cache: Cache | null;
  origin: SharedCacheOrigin;
  limiter?: SharedRateLimitNamespace | null;
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
const inMemoryRateLimitStore = new Map<string, SharedRateLimitEntry>();
let lastInMemoryRateLimitCleanupAt = 0;
const MAX_IN_MEMORY_RATE_LIMIT_ENTRIES = 10_000;
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
const cleanupInMemoryRateLimitStore = (now: number): void => {
  if (now - lastInMemoryRateLimitCleanupAt < 60_000) {
    return;
  }
  lastInMemoryRateLimitCleanupAt = now;
  for (const [key, entry] of inMemoryRateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      inMemoryRateLimitStore.delete(key);
    }
  }
};
const trimInMemoryRateLimitStore = (): void => {
  if (inMemoryRateLimitStore.size < MAX_IN_MEMORY_RATE_LIMIT_ENTRIES) {
    return;
  }
  const overflowCount = inMemoryRateLimitStore.size - MAX_IN_MEMORY_RATE_LIMIT_ENTRIES + 1;
  const keys = inMemoryRateLimitStore.keys();
  for (let index = 0; index < overflowCount; index += 1) {
    const nextKey = keys.next();
    if (nextKey.done) {
      break;
    }
    inMemoryRateLimitStore.delete(nextKey.value);
  }
};
const getInMemoryRateLimitEntry = (key: string, now: number): SharedRateLimitEntry | null => {
  cleanupInMemoryRateLimitStore(now);
  const existing = inMemoryRateLimitStore.get(key);
  if (!existing || now >= existing.resetAt) {
    inMemoryRateLimitStore.delete(key);
    return null;
  }
  return {
    count: Math.max(0, Math.trunc(existing.count)),
    resetAt: existing.resetAt,
  };
};
const setInMemoryRateLimitEntry = (key: string, entry: SharedRateLimitEntry): void => {
  if (!inMemoryRateLimitStore.has(key)) {
    trimInMemoryRateLimitStore();
  }
  inMemoryRateLimitStore.set(key, entry);
};
const resolveActiveRateLimitEntry = (
  localEntry: SharedRateLimitEntry,
  sharedEntry: SharedRateLimitEntry
): SharedRateLimitEntry => {
  if (localEntry.resetAt === sharedEntry.resetAt) {
    return {
      count: Math.max(localEntry.count, sharedEntry.count),
      resetAt: sharedEntry.resetAt,
    };
  }
  // Different resetAt values represent different windows, so keep the newer window's count
  // instead of carrying a higher count forward into that newer reset boundary.
  return localEntry.resetAt > sharedEntry.resetAt ? localEntry : sharedEntry;
};
const resolveRateLimitEntry = (
  localEntry: SharedRateLimitEntry | null,
  sharedEntry: SharedRateLimitEntry,
  hasActiveSharedEntry: boolean
): SharedRateLimitEntry => {
  if (!localEntry) {
    return sharedEntry;
  }
  if (!hasActiveSharedEntry) {
    return localEntry;
  }
  return resolveActiveRateLimitEntry(localEntry, sharedEntry);
};
const consumeInMemoryRateLimit = (
  key: string,
  limit: number,
  windowMs: number
): SharedRateLimitEntry | null => {
  const now = Date.now();
  const entry = getInMemoryRateLimitEntry(key, now) ?? {
    count: 0,
    resetAt: now + windowMs,
  };
  if (entry.count >= limit) {
    setInMemoryRateLimitEntry(key, entry);
    return null;
  }
  const nextEntry = {
    count: entry.count + 1,
    resetAt: entry.resetAt,
  };
  setInMemoryRateLimitEntry(key, nextEntry);
  return nextEntry;
};
const isRateLimitNamespace = (value: unknown): value is SharedRateLimitNamespace => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<SharedRateLimitNamespace>;
  return typeof candidate.idFromName === 'function' && typeof candidate.get === 'function';
};
export const resolveSharedRateLimitNamespace = (
  binding: unknown
): SharedRateLimitNamespace | null => {
  return isRateLimitNamespace(binding) ? binding : null;
};
const RATE_LIMITER_BINDING_NAME = 'API_GATEWAY_LIMITER';
export const getRateLimiterBinding = (event: unknown): SharedRateLimitNamespace | null => {
  if (!event || typeof event !== 'object') {
    return null;
  }
  const context = (event as { context?: { cloudflare?: { env?: Record<string, unknown> } } })
    .context;
  const env = context?.cloudflare?.env;
  if (!env || typeof env !== 'object') {
    return null;
  }
  return resolveSharedRateLimitNamespace(env[RATE_LIMITER_BINDING_NAME]);
};
export const createSharedCacheHandle = (appUrl: unknown, limiter?: unknown): SharedCacheHandle => ({
  cache: getSharedCache(),
  origin: resolveSharedCacheOrigin(appUrl),
  limiter: resolveSharedRateLimitNamespace(limiter),
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
const DURABLE_RATE_LIMIT_TIMEOUT_MS = 3000;
const consumeDurableRateLimit = async (
  limiter: SharedRateLimitNamespace,
  prefix: string,
  key: string,
  limit: number,
  windowMs: number,
  onError?: SharedCacheErrorHandler
): Promise<boolean | null> => {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DURABLE_RATE_LIMIT_TIMEOUT_MS);
  try {
    const id = limiter.idFromName(`${prefix}:${key}`);
    const stub = limiter.get(id);
    const response = await stub.fetch('https://rate-limit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit, windowSec }),
      signal: controller.signal,
    });
    if (!response.ok) {
      onError?.({
        action: 'read',
        error: new Error(`rate limiter responded ${response.status}`),
        key,
        prefix,
      });
      return null;
    }
    const data = (await response.json()) as { allowed?: unknown };
    if (typeof data.allowed !== 'boolean') {
      onError?.({
        action: 'read',
        error: new Error('rate limiter returned malformed payload'),
        key,
        prefix,
      });
      return null;
    }
    return data.allowed;
  } catch (error) {
    onError?.({ action: 'read', error, key, prefix });
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
/**
 * Best-effort distributed rate limiter.
 *
 * Enforcement tiers, strongest to weakest:
 * 1. When a Durable Object limiter binding is present (`handle.limiter`), counting is
 *    globally atomic and exact across isolates and data centers.
 * 2. Otherwise the limiter falls back to the Cloudflare Cache API plus a per-isolate
 *    in-memory map. Concurrent calls for a retained key within one live isolate serialize
 *    the local counter update (the critical section between the cache read and write is
 *    synchronous), but enforcement across isolates, data centers, in-memory eviction
 *    (MAX_IN_MEMORY_RATE_LIMIT_ENTRIES), and isolate restarts remains best-effort. Worst-case
 *    overshoot is roughly `limit x active isolates x active data centers`.
 *
 * The Durable Object path fails open to the cache/in-memory path on any binding error so a
 * limiter outage degrades gracefully instead of breaking request handling.
 */
export const consumeSharedRateLimit = async (
  handle: SharedCacheHandle,
  prefix: string,
  key: string,
  limit: number,
  windowMs: number,
  onError?: SharedCacheErrorHandler
): Promise<boolean> => {
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(windowMs) || windowMs <= 0) {
    return true;
  }
  if (handle.limiter) {
    const durableResult = await consumeDurableRateLimit(
      handle.limiter,
      prefix,
      key,
      limit,
      windowMs,
      onError
    );
    if (durableResult !== null) {
      return durableResult;
    }
  }
  const inMemoryKey = `${prefix}:${key}`;
  if (!handle.cache) {
    return consumeInMemoryRateLimit(inMemoryKey, limit, windowMs) !== null;
  }
  const now = Date.now();
  const existing = await readSharedCache<unknown>(handle, prefix, key, onError);
  const hasActiveSharedEntry = isRateLimitEntry(existing) && now < existing.resetAt;
  const sharedEntry = !hasActiveSharedEntry
    ? {
        count: 0,
        resetAt: now + windowMs,
      }
    : {
        count: Math.max(0, Math.trunc(existing.count)),
        resetAt: existing.resetAt,
      };
  const localEntry = getInMemoryRateLimitEntry(inMemoryKey, now);
  const entry = resolveRateLimitEntry(localEntry, sharedEntry, hasActiveSharedEntry);
  if (entry.count >= limit) {
    setInMemoryRateLimitEntry(inMemoryKey, entry);
    return false;
  }
  const nextEntry: SharedRateLimitEntry = {
    count: entry.count + 1,
    resetAt: entry.resetAt,
  };
  setInMemoryRateLimitEntry(inMemoryKey, nextEntry);
  const ttlMs = Math.max(1, nextEntry.resetAt - now);
  await writeSharedCache(handle, prefix, key, nextEntry, ttlMs, onError);
  return true;
};
