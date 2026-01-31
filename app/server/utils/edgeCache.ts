/**
 * Server-Side Caching Utility for Cloudflare Edge Cache
 *
 * This utility provides a centralized way to handle Cloudflare Cache API logic
 * with fallback for development environments where caches might not be available.
 */
import { getQuery } from 'h3';
import { $fetch } from 'ofetch';
import { createLogger } from './logger';
import type { H3Event } from 'h3';
import { useRuntimeConfig } from '#imports';
const logger = createLogger('EdgeCache');
interface CacheOptions {
  ttl?: number;
  cacheKeyPrefix?: string;
}
type OverlayHeadersMeta = {
  status?: string;
  version?: string;
  generated?: string;
  sha256?: string;
};
function getOverlayHeadersMeta(payload: unknown): OverlayHeadersMeta | null {
  if (!payload || typeof payload !== 'object') return null;
  const meta = (payload as { dataOverlay?: OverlayHeadersMeta }).dataOverlay;
  if (!meta || typeof meta !== 'object') return null;
  return meta;
}
function isTruthyFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase());
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
  ttl: number = 43200,
  options: CacheOptions = {}
): Promise<T> {
  const { cacheKeyPrefix = 'tarkovtracker' } = options;
  // Cloudflare Workers have a special caches.default property not in standard types
  // In Node.js dev mode, caches is not defined at all
  const isCacheAvailable =
    typeof globalThis.caches !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis.caches as any).default;
  const fullCacheKey = `${cacheKeyPrefix}-${key}`;
  try {
    // Only use Cloudflare Cache API in production (Cloudflare Pages/Workers)
    if (isCacheAvailable) {
      if (shouldBypassCache(event)) {
        const response = await fetcher();
        const overlayMeta = getOverlayHeadersMeta(response);
        setResponseHeaders(event, {
          'X-Cache-Status': 'BYPASS',
          'X-Cache-Key': fullCacheKey,
          'Cache-Control': 'no-cache',
          ...(overlayMeta?.status ? { 'X-Overlay-Status': overlayMeta.status } : {}),
          ...(overlayMeta?.version ? { 'X-Overlay-Version': overlayMeta.version } : {}),
          ...(overlayMeta?.generated ? { 'X-Overlay-Generated': overlayMeta.generated } : {}),
          ...(overlayMeta?.sha256 ? { 'X-Overlay-Sha256': overlayMeta.sha256 } : {}),
        });
        return response;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cache = (globalThis.caches as any).default as Cache;
      // Create a normalized cache key URL using the current host (avoids hardcoding a cache subdomain)
      const runtimeConfig = useRuntimeConfig();
      const appUrl = runtimeConfig?.public?.appUrl;
      let configuredHost: string | null = null;
      let configuredProtocol: string | null = null;
      if (appUrl) {
        try {
          const parsedAppUrl = new URL(appUrl);
          const hostname = parsedAppUrl.hostname;
          const isLocalhost =
            hostname === 'localhost' ||
            hostname === '0.0.0.0' ||
            hostname === '::1' ||
            /^127\./.test(hostname);
          if (!isLocalhost) {
            configuredHost = parsedAppUrl.host;
            configuredProtocol = parsedAppUrl.protocol;
          }
        } catch (error) {
          logger.warn('[EdgeCache] Invalid appUrl, falling back to request host', error);
        }
      }
      const requestHost = event.node?.req?.headers?.host;
      const forwardedProto = event.node?.req?.headers?.['x-forwarded-proto'];
      const forwardedProtoValue = Array.isArray(forwardedProto)
        ? forwardedProto[0]
        : forwardedProto;
      let protocol = 'https:';
      if (configuredProtocol) {
        protocol = configuredProtocol;
      } else if (forwardedProtoValue) {
        const forwardedProtoToken = String(forwardedProtoValue).split(',')[0]?.trim();
        protocol = `${forwardedProtoToken || 'https'}:`;
      }
      const cacheHost = configuredHost || requestHost || 'tarkovtracker.org';
      const cacheUrl = new URL(`${protocol}//${cacheHost}/__edge-cache/${cacheKeyPrefix}/${key}`);
      const cacheKeyRequest = new Request(cacheUrl.toString());
      // Check cache first
      const cachedResponse = await cache.match(cacheKeyRequest);
      if (cachedResponse) {
        // CACHE HIT - Return immediately
        const data = await cachedResponse.json();
        const overlayMeta = getOverlayHeadersMeta(data);
        setResponseHeaders(event, {
          'X-Cache-Status': 'HIT',
          'X-Cache-Key': fullCacheKey,
          'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
          ...(overlayMeta?.status ? { 'X-Overlay-Status': overlayMeta.status } : {}),
          ...(overlayMeta?.version ? { 'X-Overlay-Version': overlayMeta.version } : {}),
          ...(overlayMeta?.generated ? { 'X-Overlay-Generated': overlayMeta.generated } : {}),
          ...(overlayMeta?.sha256 ? { 'X-Overlay-Sha256': overlayMeta.sha256 } : {}),
        });
        return data;
      }
      // CACHE MISS - Fetch fresh data using the provided fetcher function
      logger.info(`Cache miss for ${fullCacheKey}`);
      const response = await fetcher();
      const overlayMeta = getOverlayHeadersMeta(response);
      // Store in edge cache with TTL
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
      setResponseHeaders(event, {
        'X-Cache-Status': 'MISS',
        'X-Cache-Key': fullCacheKey,
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
        ...(overlayMeta?.status ? { 'X-Overlay-Status': overlayMeta.status } : {}),
        ...(overlayMeta?.version ? { 'X-Overlay-Version': overlayMeta.version } : {}),
        ...(overlayMeta?.generated ? { 'X-Overlay-Generated': overlayMeta.generated } : {}),
        ...(overlayMeta?.sha256 ? { 'X-Overlay-Sha256': overlayMeta.sha256 } : {}),
      });
      return response;
    } else {
      // DEV MODE - No edge caching, direct fetch using provided fetcher
      logger.info(`Fetching data for ${fullCacheKey} (DEV)`);
      const response = await fetcher();
      const overlayMeta = getOverlayHeadersMeta(response);
      setResponseHeaders(event, {
        'X-Cache-Status': 'DEV',
        'X-Cache-Key': fullCacheKey,
        'Cache-Control': 'no-cache',
        ...(overlayMeta?.status ? { 'X-Overlay-Status': overlayMeta.status } : {}),
        ...(overlayMeta?.version ? { 'X-Overlay-Version': overlayMeta.version } : {}),
        ...(overlayMeta?.generated ? { 'X-Overlay-Generated': overlayMeta.generated } : {}),
        ...(overlayMeta?.sha256 ? { 'X-Overlay-Sha256': overlayMeta.sha256 } : {}),
      });
      return response;
    }
  } catch (error) {
    logger.error(`Error in edgeCache for ${fullCacheKey}:`, error);
    throw createError({
      statusCode: 502,
      statusMessage: `Failed to fetch data for ${fullCacheKey}`,
    });
  }
}
/**
 * Helper function create a GraphQL fetcher for tarkov.dev API
 */
export function createTarkovFetcher<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): () => Promise<T> {
  return async () => {
    return await $fetch<T>('https://api.tarkov.dev/graphql', {
      method: 'POST' as const,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        query,
        variables,
      },
    });
  };
}
