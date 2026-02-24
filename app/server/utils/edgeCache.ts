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
import type { H3Event } from 'h3';
const logger = createLogger('EdgeCache');
type CacheOptions = {
  cacheKeyPrefix?: string;
  deps?: EdgeCacheDependencies;
};
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
  setResponseHeadersFn?: typeof setResponseHeaders;
};
function getOverlayHeadersMeta(payload: unknown): OverlayHeadersMeta | null {
  if (!payload || typeof payload !== 'object') return null;
  const meta = (payload as { dataOverlay?: OverlayHeadersMeta }).dataOverlay;
  if (!meta || typeof meta !== 'object') return null;
  return meta;
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
  status: 'BYPASS' | 'DEV' | 'HIT' | 'MISS',
  ttl: number,
  overlayMeta: OverlayHeadersMeta | null
) {
  const cacheControl =
    status === 'HIT' || status === 'MISS' ? `public, max-age=${ttl}, s-maxage=${ttl}` : 'no-cache';
  setHeaders(event, {
    'X-Cache-Status': status,
    'X-Cache-Key': fullCacheKey,
    'Cache-Control': cacheControl,
    ...(overlayMeta?.status ? { 'X-Overlay-Status': overlayMeta.status } : {}),
    ...(overlayMeta?.version ? { 'X-Overlay-Version': overlayMeta.version } : {}),
    ...(overlayMeta?.generated ? { 'X-Overlay-Generated': overlayMeta.generated } : {}),
    ...(overlayMeta?.sha256 ? { 'X-Overlay-Sha256': overlayMeta.sha256 } : {}),
  });
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
export function shouldBypassCache(event: H3Event): boolean {
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
export async function edgeCache<T>(
  event: H3Event,
  key: string,
  fetcher: () => Promise<T>,
  ttl = 43200,
  options: CacheOptions = {}
): Promise<T> {
  const { cacheKeyPrefix = 'tarkovtracker', deps } = options;
  const createErrorFn = deps?.createErrorFn ?? createError;
  const setHeaders = deps?.setResponseHeadersFn ?? setResponseHeaders;
  const cache = deps?.cache ?? getCloudflareCacheFromGlobal();
  const isCacheAvailable = Boolean(cache);
  const fullCacheKey = `${cacheKeyPrefix}-${key}`;
  try {
    if (isCacheAvailable && cache) {
      if (shouldBypassCache(event)) {
        const response = await fetcher();
        const overlayMeta = getOverlayHeadersMeta(response);
        setCacheResponseHeaders(event, setHeaders, fullCacheKey, 'BYPASS', ttl, overlayMeta);
        return response;
      }
      const cacheKeyRequest = buildEdgeCacheRequest(cacheKeyPrefix, key, resolveAppUrl(deps));
      const cachedResponse = await cache.match(cacheKeyRequest);
      if (cachedResponse) {
        const data = await cachedResponse.json();
        const overlayMeta = getOverlayHeadersMeta(data);
        setCacheResponseHeaders(event, setHeaders, fullCacheKey, 'HIT', ttl, overlayMeta);
        return data;
      }
      logger.info(`Cache miss for ${fullCacheKey}`);
      const response = await fetcher();
      const overlayMeta = getOverlayHeadersMeta(response);
      const cacheResponse = new Response(JSON.stringify(response), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
          'X-Cache-Status': 'MISS',
          'X-Cache-Key': fullCacheKey,
        },
      });
      // Non-blocking cache write if waitUntil available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfContext = (event.context as any).cloudflare?.context;
      if (cfContext?.waitUntil) {
        cfContext.waitUntil(cache.put(cacheKeyRequest, cacheResponse.clone()));
      } else {
        await cache.put(cacheKeyRequest, cacheResponse.clone());
      }
      setCacheResponseHeaders(event, setHeaders, fullCacheKey, 'MISS', ttl, overlayMeta);
      return response;
    }
    logger.info(`Fetching data for ${fullCacheKey} (DEV)`);
    const response = await fetcher();
    const overlayMeta = getOverlayHeadersMeta(response);
    setCacheResponseHeaders(event, setHeaders, fullCacheKey, 'DEV', ttl, overlayMeta);
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in edgeCache for ${fullCacheKey}:`, error);
    const sanitizedErrorMessage = sanitizeErrorMessage(errorMessage);
    throw createErrorFn({
      statusCode: 502,
      statusMessage: sanitizedErrorMessage
        ? `Failed to fetch data for ${fullCacheKey}: ${sanitizedErrorMessage}`
        : `Failed to fetch data for ${fullCacheKey}`,
    });
  }
}
