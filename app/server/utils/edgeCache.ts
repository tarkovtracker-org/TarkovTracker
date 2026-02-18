/**
 * Server-Side Caching Utility for Cloudflare Edge Cache
 *
 * This utility provides a centralized way to handle Cloudflare Cache API logic
 * with fallback for development environments where caches might not be available.
 */
import { getQuery } from 'h3';
import { $fetch } from 'ofetch';
import { useRuntimeConfig } from '#imports';
import { createLogger } from '@/server/utils/logger';
import type { H3Event } from 'h3';
const logger = createLogger('EdgeCache');
interface CacheOptions {
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
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    return isTruthyFlag(value[0]);
  }
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
      // Create a normalized cache key URL from configured app URL.
      const runtimeConfig = useRuntimeConfig();
      const appUrl = runtimeConfig?.public?.appUrl;
      let cacheHost = 'tarkovtracker.org';
      let protocol = 'https:';
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
            cacheHost = parsedAppUrl.host;
            protocol = parsedAppUrl.protocol || 'https:';
          }
        } catch (error) {
          logger.warn('[EdgeCache] Invalid appUrl, falling back to default cache host', error);
        }
      }
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error in edgeCache for ${fullCacheKey}:`, error);
    const sanitizedErrorMessage = sanitizeErrorMessage(errorMessage);
    throw createError({
      statusCode: 502,
      statusMessage: sanitizedErrorMessage
        ? `Failed to fetch data for ${fullCacheKey}: ${sanitizedErrorMessage}`
        : `Failed to fetch data for ${fullCacheKey}`,
    });
  }
}
const STATUS_MESSAGE_MAX_LENGTH = 160;
const REDACTED_PLACEHOLDER = '[redacted]';
// lgtm[js/redos] -- False positive: static anchored literal key patterns only.
const SENSITIVE_VARIABLE_PATTERNS = [
  '^access_token$',
  '^api_?key$',
  '^apikey$',
  '^auth$',
  '^authorization$',
  '^bearer$',
  '^card$',
  '^ccnum$',
  '^client_secret$',
  '^credential$',
  '^credit_card$',
  '^cvv$',
  '^dob$',
  '^email$',
  '^id_token$',
  '^otp$',
  '^passwd$',
  '^password$',
  '^phone$',
  '^pin$',
  '^private_key$',
  '^pwd$',
  '^refresh$',
  '^secret$',
  '^session$',
  '^signature$',
  '^ssn$',
  '^token$',
  '^user_?id$',
  '^userid$',
];
const SENSITIVE_VARIABLE_REGEX = SENSITIVE_VARIABLE_PATTERNS.map((pattern) => new RegExp(pattern));
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
const sanitizeErrorMessage = (message: string): string => {
  let sanitized = message.trim();
  if (!sanitized) return '';
  sanitized = sanitized.replace(/\bhttps?:\/\/[^\s]+/gi, '[host]');
  sanitized = sanitized.replace(/\b[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?\b/gi, '[host]');
  sanitized = sanitized.replace(/(?:[A-Za-z]:\\|\/)[^\s]+/g, '[path]');
  sanitized = sanitized.replace(
    /\b(select|insert|update|delete|drop|alter|create|truncate|union)\b\s+[^;]+/gi,
    '[sql]'
  );
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  if (sanitized.length > STATUS_MESSAGE_MAX_LENGTH) {
    sanitized = `${sanitized.slice(0, STATUS_MESSAGE_MAX_LENGTH - 3)}...`;
  }
  return sanitized;
};
const sanitizeGraphQLErrors = (errors: unknown): string => {
  try {
    if (Array.isArray(errors)) {
      const sanitized = errors.map((err) => {
        if (typeof err === 'object' && err !== null) {
          const e = err as Record<string, unknown>;
          return {
            code:
              e.extensions && typeof e.extensions === 'object'
                ? (e.extensions as Record<string, unknown>).code
                : undefined,
            type: typeof e.message === 'string' ? e.message.slice(0, 100) : 'Unknown error',
          };
        }
        return { type: 'Unknown error' };
      });
      return JSON.stringify(sanitized);
    }
    if (typeof errors === 'object' && errors !== null) {
      return JSON.stringify({ type: 'Non-array error object' });
    }
    return 'Unknown error format';
  } catch {
    return 'Error sanitization failed';
  }
};
function sanitizeVariables(variables: Record<string, unknown>): Record<string, unknown> {
  const sanitizeValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry) => sanitizeValue(entry));
    }
    if (isPlainObject(value)) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase();
        const shouldRedact = SENSITIVE_VARIABLE_REGEX.some((regex) => regex.test(normalizedKey));
        sanitized[key] = shouldRedact ? REDACTED_PLACEHOLDER : sanitizeValue(entry);
      }
      return sanitized;
    }
    return value;
  };
  return sanitizeValue(variables) as Record<string, unknown>;
}
export function createTarkovFetcher<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { maxRetries?: number; timeoutMs?: number } = {}
): () => Promise<T> {
  const { maxRetries = 3, timeoutMs = 30000 } = options;
  const safeMaxRetries = Number.isFinite(maxRetries) ? Math.max(1, Math.floor(maxRetries)) : 3;
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(1000, Math.floor(timeoutMs)) : 30000;
  return async () => {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= safeMaxRetries; attempt++) {
      try {
        const response = await $fetch<T>('https://api.tarkov.dev/graphql', {
          method: 'POST' as const,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            query,
            variables,
          },
          timeout: safeTimeoutMs,
          retry: 0,
        });
        if (response && typeof response === 'object' && 'errors' in response) {
          const responseErrors = (response as { errors?: unknown }).errors;
          if (Array.isArray(responseErrors)) {
            throw new Error(`GraphQL errors: ${sanitizeGraphQLErrors(responseErrors)}`);
          }
          throw new Error(
            `GraphQL response contained non-array errors (${typeof responseErrors}): ${sanitizeGraphQLErrors(responseErrors)}`
          );
        }
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isLastAttempt = attempt === safeMaxRetries;
        if (isLastAttempt) {
          logger.error(`[TarkovFetcher] All ${safeMaxRetries} attempts failed`, {
            error: lastError.message,
            variables: sanitizeVariables(variables),
          });
        } else {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          logger.warn(
            `[TarkovFetcher] Attempt ${attempt}/${safeMaxRetries} failed, retrying in ${delayMs}ms`,
            { error: lastError.message }
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError || new Error('All fetch attempts failed');
  };
}
