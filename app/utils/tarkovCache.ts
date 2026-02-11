/**
 * Tarkov Data Cache Utility
 *
 * Provides multi-layer caching for Tarkov API data:
 * - IndexedDB for persistent client-side storage (survives page refresh/reload)
 * - Supports multiple game modes (PVP/PVE) and languages
 * - Configurable TTL (default 12 hours)
 *
 * Cache Key Structure: tarkov-{type}-{gameMode}-{lang}
 * Example: tarkov-data-regular-en, tarkov-hideout-pve-fr
 */
import { logger } from './logger';
import { perfEnabled, perfEnd, perfStart } from './perf';
// Cache configuration
export const CACHE_CONFIG = {
  DB_NAME: 'tarkov-tracker-cache',
  DB_VERSION: 5, // Bumped to force cache clear after trimming item payloads
  STORE_NAME: 'tarkov-data',
  // 12 hours in milliseconds
  DEFAULT_TTL: 12 * 60 * 60 * 1000,
  // 24 hours max TTL
  MAX_TTL: 24 * 60 * 60 * 1000,
} as const;
export type CacheType =
  | 'bootstrap'
  | 'tasks-core'
  | 'tasks-objectives'
  | 'tasks-rewards'
  | 'hideout'
  | 'items-lite'
  | 'items'
  | 'map-spawns'
  | 'prestige'
  | 'editions';
export interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number;
  cacheKey: string;
  gameMode: string;
  lang: string;
  version: number;
  /** Cached size in bytes, computed only when perf is enabled */
  sizeBytes?: number;
}
/**
 * Opens or creates the IndexedDB database
 */
let dbPromise: Promise<IDBDatabase> | null = null;
let dbInstance: IDBDatabase | null = null;
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const request = indexedDB.open(CACHE_CONFIG.DB_NAME, CACHE_CONFIG.DB_VERSION);
    request.onerror = () => {
      logger.error('[TarkovCache] Failed to open database:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Delete existing store on version upgrade to clear stale data
      if (db.objectStoreNames.contains(CACHE_CONFIG.STORE_NAME)) {
        db.deleteObjectStore(CACHE_CONFIG.STORE_NAME);
        logger.info('[TarkovCache] Deleted old cache store for version upgrade');
      }
      // Create fresh object store
      const store = db.createObjectStore(CACHE_CONFIG.STORE_NAME, {
        keyPath: 'cacheKey',
      });
      // Create indexes for querying
      store.createIndex('timestamp', 'timestamp', { unique: false });
      store.createIndex('gameMode', 'gameMode', { unique: false });
      store.createIndex('lang', 'lang', { unique: false });
      logger.info('[TarkovCache] Created new cache store v' + CACHE_CONFIG.DB_VERSION);
    };
  });
}
function getDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }
  if (dbPromise) {
    return dbPromise;
  }
  // Capture the promise locally to avoid race conditions on error
  const currentPromise = openDatabase()
    .then((db) => {
      dbInstance = db;
      db.onversionchange = () => {
        try {
          db.close();
        } finally {
          dbInstance = null;
          dbPromise = null;
        }
      };
      // Handle unexpected connection close (e.g., browser closing DB)
      db.onclose = () => {
        logger.warn('[TarkovCache] Database connection closed unexpectedly', {
          dbName: CACHE_CONFIG.DB_NAME,
          dbVersion: CACHE_CONFIG.DB_VERSION,
        });
        dbInstance = null;
        dbPromise = null;
      };
      return db;
    })
    .catch((error) => {
      // Clear dbPromise only if it's still the same promise (avoid clearing a newer attempt)
      if (dbPromise === currentPromise) {
        dbPromise = null;
      }
      throw error;
    });
  dbPromise = currentPromise;
  return dbPromise;
}
/**
 * Helper to create a transaction context with common error handling and cleanup
 */
interface TransactionContext {
  db: IDBDatabase;
  transaction: IDBTransaction;
  store: IDBObjectStore;
  settled: boolean;
  settle: () => void;
  closeDb: () => void;
  reject: (error: unknown) => void;
  resolve: <T>(value: T) => void;
}
function createTransactionContext(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  promiseResolve: (value: unknown) => void,
  promiseReject: (reason: unknown) => void,
  shouldClose: boolean
): TransactionContext {
  const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, mode);
  const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
  const closeDb = () => {
    if (!shouldClose) return;
    try {
      db.close();
    } catch {
      // ignore close errors; nothing else to do here
    }
  };
  const context: TransactionContext = {
    db,
    transaction,
    store,
    settled: false,
    settle: () => {
      context.settled = true;
    },
    closeDb,
    reject: (error: unknown) => {
      if (!context.settled) {
        context.settled = true;
        logger.error('[TarkovCache] Transaction error:', error);
        promiseReject(error);
      }
    },
    resolve: <T>(value: T) => {
      if (!context.settled) {
        context.settled = true;
        promiseResolve(value);
      }
    },
  };
  // Set up common transaction handlers
  transaction.onerror = (event) => {
    const error =
      (event.target as IDBRequest | IDBTransaction | null)?.error ??
      transaction.error ??
      new Error('Transaction error');
    context.reject(error);
    closeDb();
  };
  transaction.onabort = () => {
    if (!context.settled) {
      context.settled = true;
      promiseReject(new Error('Transaction aborted'));
    }
    closeDb();
  };
  transaction.oncomplete = closeDb;
  return context;
}
/**
 * Generic database transaction executor with common error handling and cleanup
 */
function executeDatabaseTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
  perfLabel = 'transaction'
): Promise<T> {
  const perfTimer = perfStart(`[Cache] ${perfLabel}`, { mode });
  const openTimer = perfStart('[Cache] openDatabase', { mode, label: perfLabel });
  return getDatabase().then((db) => {
    perfEnd(openTimer, { mode, label: perfLabel });
    return new Promise<T>((resolve, reject) => {
      const ctx = createTransactionContext(
        db,
        mode,
        resolve as (value: unknown) => void,
        reject,
        false
      );
      let perfEnded = false;
      const endPerf = (meta?: Record<string, unknown>) => {
        if (perfEnded) return;
        perfEnded = true;
        perfEnd(perfTimer, meta);
      };
      const originalResolve = ctx.resolve;
      const originalReject = ctx.reject;
      ctx.resolve = <U>(value: U) => {
        endPerf({ ok: true, mode, label: perfLabel });
        originalResolve(value);
      };
      ctx.reject = (error: unknown) => {
        endPerf({ ok: false, mode, label: perfLabel });
        originalReject(error);
      };
      const request = operation(ctx.store);
      request.onerror = () => ctx.reject(request.error);
      request.onsuccess = () => ctx.resolve(request.result as T);
    });
  });
}
/**
 * Execute a cursor-based operation with common error handling
 */
function executeCursorOperation(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  cursorRequest: (store: IDBObjectStore) => IDBRequest,
  onCursor: (cursor: IDBCursorWithValue) => void,
  onComplete: () => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctx = createTransactionContext(
      db,
      mode,
      resolve as (value: unknown) => void,
      reject,
      false
    );
    const request = cursorRequest(ctx.store);
    request.onerror = () => ctx.reject(request.error);
    request.onsuccess = (event) => {
      if (ctx.settled) return;
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
      if (cursor) {
        try {
          onCursor(cursor);
          cursor.continue();
        } catch (error) {
          if (!ctx.settled) {
            ctx.reject(error);
            try {
              ctx.transaction.abort();
            } catch {
              // ignore abort errors
            }
            ctx.closeDb();
          }
        }
      }
    };
    ctx.transaction.oncomplete = () => {
      if (!ctx.settled) {
        ctx.settled = true;
        onComplete();
        resolve();
      }
      ctx.closeDb();
    };
  });
}
/**
 * Generates a cache key for Tarkov data
 */
export function generateCacheKey(type: CacheType, gameMode: string, lang: string = 'en'): string {
  return `tarkov-${type}-${gameMode}-${lang}`;
}
/**
 * Retrieves cached data from IndexedDB
 * Returns null if not found or expired
 */
export async function getCachedData<T>(
  type: CacheType,
  gameMode: string,
  lang: string = 'en'
): Promise<T | null> {
  try {
    const cacheKey = generateCacheKey(type, gameMode, lang);
    return executeDatabaseTransaction<CachedData<T> | undefined>(
      'readonly',
      (store) => store.get(cacheKey),
      `get ${type}`
    ).then((cachedResult) => {
      if (!cachedResult) {
        logger.debug(`[TarkovCache] Cache MISS: ${cacheKey}`);
        return null;
      }
      // Check if cache is expired
      const now = Date.now();
      const age = now - cachedResult.timestamp;
      if (age > cachedResult.ttl) {
        logger.debug(
          `[TarkovCache] Cache EXPIRED: ${cacheKey} (age: ${Math.round(age / 1000 / 60)}min)`
        );
        return null;
      }
      logger.debug(`[TarkovCache] Cache HIT: ${cacheKey} (age: ${Math.round(age / 1000 / 60)}min)`);
      if (perfEnabled() && cachedResult.sizeBytes !== undefined) {
        logger.debug('[Perf] [Cache] entry size', { cacheKey, sizeBytes: cachedResult.sizeBytes });
      }
      return cachedResult.data;
    });
  } catch (error) {
    logger.error('[TarkovCache] Error getting cached data:', error);
    return null;
  }
}
/**
 * Stores data in IndexedDB cache
 */
export async function setCachedData<T>(
  type: CacheType,
  gameMode: string,
  lang: string,
  data: T,
  ttl: number = CACHE_CONFIG.DEFAULT_TTL
): Promise<void> {
  try {
    const cacheKey = generateCacheKey(type, gameMode, lang);
    // Compute accurate byte size only when perf logging is enabled
    let sizeBytes: number | undefined;
    if (perfEnabled()) {
      const jsonStr = JSON.stringify(data);
      sizeBytes = new Blob([jsonStr]).size;
    }
    const cacheEntry: CachedData<T> = {
      data,
      timestamp: Date.now(),
      ttl: Math.min(ttl, CACHE_CONFIG.MAX_TTL),
      cacheKey,
      gameMode,
      lang,
      version: CACHE_CONFIG.DB_VERSION,
      sizeBytes,
    };
    await executeDatabaseTransaction<undefined>(
      'readwrite',
      (store) => store.put(cacheEntry),
      `set ${type}`
    );
    logger.debug(`[TarkovCache] Cache STORED: ${cacheKey}`);
  } catch (error) {
    logger.error('[TarkovCache] Error storing cached data:', error);
    throw error;
  }
}
/**
 * Clears a specific cache entry
 */
export async function clearCacheEntry(
  type: CacheType,
  gameMode: string,
  lang: string = 'en'
): Promise<void> {
  try {
    const cacheKey = generateCacheKey(type, gameMode, lang);
    await executeDatabaseTransaction<undefined>(
      'readwrite',
      (store) => store.delete(cacheKey),
      `delete ${type}`
    );
    logger.debug(`[TarkovCache] Cache DELETED: ${cacheKey}`);
  } catch (error) {
    logger.error('[TarkovCache] Error deleting cache entry:', error);
    throw error;
  }
}
/**
 * Clears all cached data for a specific game mode
 */
export async function clearCacheByGameMode(gameMode: string): Promise<void> {
  try {
    const db = await getDatabase();
    await executeCursorOperation(
      db,
      'readwrite',
      (store) => store.index('gameMode').openCursor(IDBKeyRange.only(gameMode)),
      (cursor) => cursor.delete(),
      () => logger.debug(`[TarkovCache] Cleared all cache for gameMode: ${gameMode}`)
    );
  } catch (error) {
    logger.error('[TarkovCache] Error clearing cache by game mode:', error);
    throw error;
  }
}
/**
 * Clears ALL cached Tarkov data
 */
export async function clearAllCache(): Promise<void> {
  try {
    await executeDatabaseTransaction<undefined>('readwrite', (store) => store.clear(), 'clear all');
    logger.debug('[TarkovCache] All cache CLEARED');
  } catch (error) {
    logger.error('[TarkovCache] Error clearing all cache:', error);
    throw error;
  }
}
/**
 * Gets cache statistics (for debugging/display)
 */
export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  entries: Array<{
    cacheKey: string;
    gameMode: string;
    lang: string;
    age: number;
    ttl: number;
    isExpired: boolean;
  }>;
}
export async function getCacheStats(): Promise<CacheStats> {
  try {
    const entries = await executeDatabaseTransaction<CachedData<unknown>[]>('readonly', (store) =>
      store.getAll()
    );
    const now = Date.now();
    let totalSize = 0;
    const mappedEntries = entries.map((entry) => {
      const age = now - entry.timestamp;
      // Rough size estimate
      const entrySize = JSON.stringify(entry.data).length;
      totalSize += entrySize;
      return {
        cacheKey: entry.cacheKey,
        gameMode: entry.gameMode,
        lang: entry.lang,
        age: Math.round(age / 1000 / 60), // minutes
        ttl: Math.round(entry.ttl / 1000 / 60), // minutes
        isExpired: age > entry.ttl,
      };
    });
    return {
      totalEntries: entries.length,
      totalSize,
      entries: mappedEntries,
    };
  } catch (error) {
    logger.error('[TarkovCache] Error getting cache stats:', error);
    return { totalEntries: 0, totalSize: 0, entries: [] };
  }
}
/**
 * Cleans up expired cache entries (call periodically)
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const db = await getDatabase();
    let deletedCount = 0;
    const now = Date.now();
    await executeCursorOperation(
      db,
      'readwrite',
      (store) => store.openCursor(),
      (cursor) => {
        const entry = cursor.value as CachedData<unknown>;
        const age = now - entry.timestamp;
        if (age > entry.ttl) {
          cursor.delete();
          deletedCount++;
        }
      },
      () => {
        if (deletedCount > 0) {
          logger.debug(`[TarkovCache] Cleaned up ${deletedCount} expired entries`);
        }
      }
    );
    return deletedCount;
  } catch (error) {
    logger.error('[TarkovCache] Error cleaning up expired cache:', error);
    return 0;
  }
}
