/**
 * Server-Side Caching Utility for Cloudflare Edge Cache
 *
 * This utility provides a centralized way to handle Cloudflare Cache API logic
 * with fallback for development environments where caches might not be available.
 */
import { createError, getQuery, setResponseHeaders } from 'h3';
import { useRuntimeConfig } from '#imports';
import { buildEdgeCacheRequest } from '@/server/utils/edgeCacheKey';
import { sanitizeErrorMessage } from '@/server/utils/edgeCacheSanitizers';
import { createLogger } from '@/server/utils/logger';
import { buildOverlayResponseHeaders } from '@/server/utils/overlayResponseHeaders';
import { getPrecomputedStore, isPrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
import type { PrecomputedKvReader } from '@/server/utils/precomputedTarkov';
import type { H3Event } from 'h3';
const logger = createLogger('EdgeCache');
type CacheOptions = {
  cacheKeyPrefix?: string;
  deps?: EdgeCacheDependencies;
  // When true, first try the globally-replicated KV store populated by the
  // scheduled GitHub Actions precompute workflow (scripts/precompute) before
  // touching the per-colo Cache API. Missing binding or entry falls through
  // to the regular edge-cache path.
  precomputed?: boolean;
  staleTtl?: number;
  // Only for routes whose cached payload is final (no post-cache overlay/adaptation).
  response?: boolean;
};
type CfExecutionContext = { waitUntil?: (promise: Promise<unknown>) => void } | undefined;
type CfRuntimeContext = { cloudflare?: { context?: CfExecutionContext } };
type OverlayHeadersMeta = {
  status?: string;
  version?: string;
  generated?: string;
  sha256?: string;
};
type CacheLike = {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
};
type EdgeCacheDependencies = {
  appUrl?: string;
  cache?: CacheLike;
  createErrorFn?: typeof createError;
  precomputedStore?: PrecomputedKvReader | null;
  setResponseHeadersFn?: typeof setResponseHeaders;
};
function getOverlayHeadersMeta(payload: unknown): OverlayHeadersMeta | null {
  if (payload instanceof Response) {
    return readStoredOverlayMeta(payload.headers);
  }
  if (!payload || typeof payload !== 'object') return null;
  const meta = (payload as { dataOverlay?: OverlayHeadersMeta }).dataOverlay;
  if (!meta || typeof meta !== 'object') return null;
  return meta;
}
function readStoredOverlayMeta(headers: Headers): OverlayHeadersMeta {
  const fields = ['status', 'version', 'generated', 'sha256'] as const;
  return Object.fromEntries(
    fields.map((field) => [field, headers.get(`X-Overlay-${field}`) ?? undefined])
  );
}
function isTruthyFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    return isTruthyFlag(value[0]);
  }
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase());
}
function setCacheResponseHeaders(
  event: H3Event,
  setHeaders: typeof setResponseHeaders,
  fullCacheKey: string,
  status: 'BYPASS' | 'DEV' | 'HIT' | 'MISS' | 'PRECOMPUTE' | 'STALE',
  ttl: number,
  overlayMeta: OverlayHeadersMeta | null
) {
  const cacheControl =
    status === 'HIT' || status === 'MISS' || status === 'PRECOMPUTE'
      ? `public, max-age=${ttl}, s-maxage=${ttl}`
      : 'no-cache';
  const headers = {
    'X-Cache-Status': status,
    'X-Cache-Key': fullCacheKey,
    'Cache-Control': cacheControl,
    ...buildOverlayResponseHeaders(overlayMeta),
  };
  setHeaders(event, headers);
  return headers;
}
const STORED_RESPONSE_VERSION = '1';
async function readCachedPayload<T>(cached: Response, response: boolean): Promise<T | Response> {
  // Entries written before metadata was stored in headers still take the object path.
  if (response && cached.headers.get('X-Cache-Response-Version') === STORED_RESPONSE_VERSION) {
    return cached;
  }
  return cached.json() as Promise<T>;
}
function cacheResult<T>(
  payload: T | Response,
  headers: Record<string, string>,
  response: boolean
): T | Response {
  if (!response) return payload;
  const body = payload instanceof Response ? payload.body : JSON.stringify(payload);
  // Deliberately omit internal retention/metadata headers and any stored encoding/length.
  return new Response(body, { headers: { 'Content-Type': 'application/json', ...headers } });
}
function getCloudflareCacheFromGlobal(): CacheLike | undefined {
  if (typeof globalThis.caches === 'undefined') return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cache = (globalThis.caches as any).default;
  if (!cache) return undefined;
  return cache as CacheLike;
}
function resolveAppUrl(deps?: EdgeCacheDependencies): string | undefined {
  if (typeof deps?.appUrl === 'string' && deps.appUrl.length > 0) {
    return deps.appUrl;
  }
  const runtimeConfig = useRuntimeConfig();
  const runtimeAppUrl = runtimeConfig?.public?.appUrl;
  if (typeof runtimeAppUrl === 'string' && runtimeAppUrl.length > 0) {
    return runtimeAppUrl;
  }
  return undefined;
}
const inFlightRevalidations = new Set<string>();
function buildStoredResponse<T>(
  payload: T,
  ttl: number,
  staleTtl: number,
  fullCacheKey: string
): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      // s-maxage covers the stale window so Cloudflare keeps the entry past ttl
      // and we can serve it while a background refresh runs.
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl + staleTtl}`,
      'X-Cache-Status': 'MISS',
      'X-Cache-Key': fullCacheKey,
      'X-Cache-Stored-At': String(Date.now()),
      'X-Cache-Response-Version': STORED_RESPONSE_VERSION,
      ...buildOverlayResponseHeaders(getOverlayHeadersMeta(payload)),
    },
  });
}
function reviveCacheEntry<T>(params: {
  cache: CacheLike;
  cacheKeyRequest: Request;
  cfContext: CfExecutionContext;
  fetcher: () => Promise<T>;
  fullCacheKey: string;
  staleTtl: number;
  ttl: number;
}): void {
  const { cache, cacheKeyRequest, cfContext, fetcher, fullCacheKey, staleTtl, ttl } = params;
  if (inFlightRevalidations.has(fullCacheKey)) return;
  inFlightRevalidations.add(fullCacheKey);
  const task = (async () => {
    try {
      const fresh = await fetcher();
      await cache.put(cacheKeyRequest, buildStoredResponse(fresh, ttl, staleTtl, fullCacheKey));
      logger.info(`Background revalidation refreshed ${fullCacheKey}`);
    } catch (error) {
      logger.warn(`Background revalidation failed for ${fullCacheKey}; keeping stale entry`, error);
    } finally {
      inFlightRevalidations.delete(fullCacheKey);
    }
  })();
  if (cfContext?.waitUntil) {
    cfContext.waitUntil(task);
  } else {
    void task;
  }
}
export function shouldBypassCache(event: H3Event): boolean {
  const config = useRuntimeConfig(event);
  const bypassEnabled =
    config.publicCacheBypassEnabled === true ||
    String(config.publicCacheBypassEnabled) === 'true' ||
    process.env.NUXT_CACHE_BYPASS_ENABLED === 'true';
  if (!bypassEnabled) return false;
  const headerValue =
    event.node?.req?.headers?.['x-bypass-cache'] ?? event.node?.req?.headers?.['x-cache-bypass'];
  if (isTruthyFlag(headerValue)) return true;
  const query = getQuery(event);
  if (isTruthyFlag(query?.nocache)) return true;
  if (isTruthyFlag(query?.cacheBust)) return true;
  return false;
}
/**
 * Helper function that handles Cloudflare Cache API logic
 *
 * @param event - H3 event object
 * @param key - Cache key (will be combined with prefix for uniqueness)
 * @param fetcher - Function that fetches fresh data when cache miss occurs
 * @param ttl - Time to live in seconds (default: 43200 = 12 hours)
 * @returns Promise resolving to cached or fresh data
 */
export function edgeCache<T>(
  event: H3Event,
  key: string,
  fetcher: () => Promise<T>,
  ttl: number,
  options: CacheOptions & { response: true }
): Promise<Response>;
export function edgeCache<T>(
  event: H3Event,
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number,
  options?: CacheOptions & { response?: false }
): Promise<T>;
export async function edgeCache<T>(
  event: H3Event,
  key: string,
  fetcher: () => Promise<T>,
  ttl = 43200,
  options: CacheOptions = {}
): Promise<T | Response> {
  const {
    cacheKeyPrefix = 'tarkovtracker',
    deps,
    staleTtl = ttl,
    response: asResponse = false,
  } = options;
  const createErrorFn = deps?.createErrorFn ?? createError;
  const setHeaders = deps?.setResponseHeadersFn ?? setResponseHeaders;
  const cache = deps?.cache ?? getCloudflareCacheFromGlobal();
  const isCacheAvailable = Boolean(cache);
  const fullCacheKey = `${cacheKeyPrefix}-${key}`;
  try {
    const bypassRequested = shouldBypassCache(event);
    if (options.precomputed && !bypassRequested) {
      const precomputedStore =
        deps?.precomputedStore !== undefined ? deps.precomputedStore : getPrecomputedStore(event);
      if (precomputedStore) {
        try {
          const envelope = await precomputedStore.get(key, 'json');
          if (isPrecomputedEnvelope<T>(envelope)) {
            const overlayMeta = getOverlayHeadersMeta(envelope.payload);
            const headers = setCacheResponseHeaders(
              event,
              setHeaders,
              fullCacheKey,
              'PRECOMPUTE',
              ttl,
              overlayMeta
            );
            return cacheResult(envelope.payload, headers, asResponse);
          }
          logger.info(`No precomputed entry for ${key}; falling back to edge cache`);
        } catch (precomputedError) {
          logger.warn(
            `Precomputed store read failed for ${key}; falling back to edge cache`,
            precomputedError
          );
        }
      }
    }
    if (isCacheAvailable && cache) {
      if (bypassRequested) {
        const response = await fetcher();
        const overlayMeta = getOverlayHeadersMeta(response);
        const headers = setCacheResponseHeaders(
          event,
          setHeaders,
          fullCacheKey,
          'BYPASS',
          ttl,
          overlayMeta
        );
        return cacheResult(response, headers, asResponse);
      }
      const cacheKeyRequest = buildEdgeCacheRequest(cacheKeyPrefix, key, resolveAppUrl(deps));
      const cfContext = (event.context as CfRuntimeContext).cloudflare?.context;
      const cachedResponse = await cache.match(cacheKeyRequest);
      if (cachedResponse) {
        const data = await readCachedPayload<T>(cachedResponse, asResponse);
        const overlayMeta = getOverlayHeadersMeta(data);
        const storedAtRaw = cachedResponse.headers.get('X-Cache-Stored-At');
        const storedAt = storedAtRaw ? Number(storedAtRaw) : Number.NaN;
        const isStale = Number.isFinite(storedAt) && Date.now() - storedAt > ttl * 1000;
        if (isStale) {
          // Serve stale immediately, refresh in the background. A slow or failing
          // upstream never blocks the user once a colo has any cached entry.
          reviveCacheEntry({
            cache,
            cacheKeyRequest,
            cfContext,
            fetcher,
            fullCacheKey,
            staleTtl,
            ttl,
          });
          const headers = setCacheResponseHeaders(
            event,
            setHeaders,
            fullCacheKey,
            'STALE',
            ttl,
            overlayMeta
          );
          return cacheResult(data, headers, asResponse);
        }
        const headers = setCacheResponseHeaders(
          event,
          setHeaders,
          fullCacheKey,
          'HIT',
          ttl,
          overlayMeta
        );
        return cacheResult(data, headers, asResponse);
      }
      logger.info(`Cache miss for ${fullCacheKey}`);
      const response = await fetcher();
      const overlayMeta = getOverlayHeadersMeta(response);
      const cacheResponse = buildStoredResponse(response, ttl, staleTtl, fullCacheKey);
      if (cfContext?.waitUntil) {
        cfContext.waitUntil(cache.put(cacheKeyRequest, cacheResponse.clone()));
      } else {
        await cache.put(cacheKeyRequest, cacheResponse.clone());
      }
      const headers = setCacheResponseHeaders(
        event,
        setHeaders,
        fullCacheKey,
        'MISS',
        ttl,
        overlayMeta
      );
      return cacheResult(response, headers, asResponse);
    }
    logger.info(`Fetching data for ${fullCacheKey} (DEV)`);
    const response = await fetcher();
    const overlayMeta = getOverlayHeadersMeta(response);
    const headers = setCacheResponseHeaders(
      event,
      setHeaders,
      fullCacheKey,
      'DEV',
      ttl,
      overlayMeta
    );
    return cacheResult(response, headers, asResponse);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in edgeCache for ${fullCacheKey}:`, error);
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode === 503 ? 503 : 502;
    const sanitizedErrorMessage = sanitizeErrorMessage(errorMessage);
    throw createErrorFn({
      statusCode,
      statusMessage: sanitizedErrorMessage
        ? `Failed to fetch data for ${fullCacheKey}: ${sanitizedErrorMessage}`
        : `Failed to fetch data for ${fullCacheKey}`,
    });
  }
}
