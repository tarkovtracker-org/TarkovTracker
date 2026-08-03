/**
 * In-memory cache is per Worker instance; entries are not shared across the edge.
 * If you need distributed caching, use a Durable Object or Cloudflare KV.
 */
type CacheEntry = {
  value: unknown;
  expiresAt: number;
};
const memoryCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 1000;
let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60000; // Cleanup at most once per minute
/**
 * Removes all expired entries from the cache.
 * Called periodically to prevent memory leaks from entries that are never accessed.
 */
function cleanupExpiredEntries(now: number): void {
  for (const [key, entry] of memoryCache.entries()) {
    if (now >= entry.expiresAt) {
      memoryCache.delete(key);
    }
  }
}
function maybeCleanup(now: number): void {
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    cleanupExpiredEntries(now);
  }
}
function getFromMemory<T>(key: string, now: number): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (now >= entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}
function setMemoryEntry(key: string, entry: CacheEntry): void {
  if (memoryCache.size >= MAX_CACHE_SIZE && !memoryCache.has(key)) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(key, entry);
}
/**
 * Get a cached value by key.
 * Note: Type safety relies on caller using consistent types per key.
 * The generic T is not validated at runtime.
 */
export function getMemoryCache<T>(key: string): T | null {
  const now = Date.now();
  maybeCleanup(now);
  return getFromMemory<T>(key, now);
}
export function setMemoryCache<T>(key: string, value: T, ttlSeconds: number): void {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    deleteMemoryCache(key);
    return;
  }
  const now = Date.now();
  const entry: CacheEntry = { value, expiresAt: now + ttlSeconds * 1000 };
  maybeCleanup(now);
  setMemoryEntry(key, entry);
}
export function deleteMemoryCache(key: string): void {
  memoryCache.delete(key);
}
