import {
  createError,
  defineEventHandler,
  getQuery,
  getRequestHeader,
  setResponseHeader,
  setResponseHeaders,
} from 'h3';
import { useRuntimeConfig } from '#imports';
import { createLogger } from '@/server/utils/logger';
import { getProxyAwareClientIdentifier } from '@/server/utils/requestIdentity';
import {
  consumeSharedRateLimit,
  createSharedCacheHandle,
  getRateLimiterBinding,
  readSharedCache,
  writeSharedCache,
  type SharedCacheHandle,
} from '@/server/utils/sharedEdgeStore';
import { verifyTurnstileToken } from '@/server/utils/turnstile';
import { TARKOVTRACKER_USER_AGENT } from '@/server/utils/userAgent';
import { resolveTarkovDevProfileSource } from '@/utils/tarkovDevProfileSource';
import type { ApiProtectionConfig } from '@/server/middleware/api-protection';
import type { H3Event } from 'h3';
const logger = createLogger('TarkovDevProfileApi');
const PROFILE_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_PROFILE_RATE_LIMIT_PER_MINUTE = 5;
const DEFAULT_PROFILE_RATE_LIMIT_PER_HOUR = 20;
const DEFAULT_PROFILE_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_PROFILE_MAX_UPDATED_AGE_DAYS = 7;
const PROFILE_NOT_FOUND_CACHE_TTL_MS = 60_000;
const PROFILE_CACHE_PREFIX = 'tarkov-dev-profile';
const PROFILE_RATE_LIMIT_PREFIX = 'tarkov-dev-profile-rate';
const PROFILE_HOURLY_RATE_LIMIT_PREFIX = 'tarkov-dev-profile-hourly-rate';
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
type CachedProfileEntry = {
  body?: unknown;
  etag?: string | null;
  fetchedAt: number;
  status: 200 | 404;
};
function readSingleQueryValue(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}
function toPositiveInteger(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const integer = Math.trunc(numeric);
  return integer > 0 ? integer : fallback;
}
function toNonNegativeInteger(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const integer = Math.trunc(numeric);
  return integer >= 0 ? integer : fallback;
}
function createProfileFetchError(statusCode = 502) {
  return createError({
    statusCode,
    statusMessage:
      'Unable to fetch Tarkov.dev profile. Open the profile on Tarkov.dev, then try again.',
    data: statusCode === 404 ? { code: 'profile_not_generated' } : { code: 'profile_fetch_failed' },
  });
}
function createRateLimitError(event: H3Event, retryAfterSeconds: number) {
  setResponseHeader(event, 'Retry-After', retryAfterSeconds);
  return createError({
    statusCode: 429,
    statusMessage: 'Too many requests',
    data: { code: 'rate_limited', retryAfterSeconds },
  });
}
function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')) ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
  );
}
function readErrorForLog(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function isCachedProfileEntry(value: unknown): value is CachedProfileEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as CachedProfileEntry;
  if (typeof candidate.fetchedAt !== 'number' || !Number.isFinite(candidate.fetchedAt)) {
    return false;
  }
  return candidate.status === 200 || candidate.status === 404;
}
function readUpdatedAt(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const updated = (body as { updated?: unknown }).updated;
  return typeof updated === 'number' && Number.isFinite(updated) && updated > 0 ? updated : null;
}
function enforceProfileFreshness(body: unknown, maxUpdatedAgeDays: number): void {
  if (maxUpdatedAgeDays <= 0) return;
  const updatedAt = readUpdatedAt(body);
  if (updatedAt === null) return;
  const ageMs = Date.now() - updatedAt;
  if (ageMs <= maxUpdatedAgeDays * DAY_MS) return;
  const ageDays = Math.floor(ageMs / DAY_MS);
  throw createError({
    statusCode: 422,
    statusMessage:
      'Tarkov.dev profile data is too old to import. Open the profile on Tarkov.dev to refresh it, then try again.',
    data: { code: 'profile_stale', ageDays, maxUpdatedAgeDays, updatedAt },
  });
}
function setSuccessCacheHeaders(event: H3Event, cacheTtlMs: number): void {
  const maxAgeSeconds = Math.max(1, Math.floor(cacheTtlMs / 1000));
  setResponseHeader(event, 'Cache-Control', `private, max-age=${maxAgeSeconds}`);
}
function logSharedStoreFailure(message: string) {
  return ({ action, error, key }: { action: string; error: unknown; key: string }) => {
    logger.warn(message, {
      action,
      error: error instanceof Error ? error.message : String(error),
      key,
    });
  };
}
async function consumeRateLimit(
  handle: SharedCacheHandle,
  prefix: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  return consumeSharedRateLimit(
    handle,
    prefix,
    key,
    limit,
    windowMs,
    logSharedStoreFailure('Tarkov.dev profile rate-limit cache operation failed')
  );
}
async function readCachedProfile(
  handle: SharedCacheHandle,
  key: string
): Promise<CachedProfileEntry | null> {
  const payload = await readSharedCache<unknown>(
    handle,
    PROFILE_CACHE_PREFIX,
    key,
    logSharedStoreFailure('Tarkov.dev profile cache operation failed')
  );
  return isCachedProfileEntry(payload) ? payload : null;
}
async function writeCachedProfile(
  handle: SharedCacheHandle,
  key: string,
  entry: CachedProfileEntry,
  ttlMs: number
): Promise<void> {
  await writeSharedCache(
    handle,
    PROFILE_CACHE_PREFIX,
    key,
    entry,
    ttlMs,
    logSharedStoreFailure('Tarkov.dev profile cache operation failed')
  );
}
function resolveAllowedTurnstileHostnames(appUrl: unknown): string[] {
  const hostnames = new Set(['tarkovtracker.org', 'localhost', '127.0.0.1']);
  if (typeof appUrl === 'string' && appUrl.trim().length > 0) {
    try {
      hostnames.add(new URL(appUrl).hostname.toLowerCase());
    } catch {
      // Ignore unparsable app URLs; the static allowlist still applies.
    }
  }
  return [...hostnames];
}
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'Cache-Control': 'no-store' });
  const query = getQuery(event);
  const source = resolveTarkovDevProfileSource(readSingleQueryValue(query.url));
  if (!source.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: source.error,
    });
  }
  const typedConfig = useRuntimeConfig(event) as ReturnType<typeof useRuntimeConfig> &
    ApiProtectionConfig & {
      tarkovDevProfileCacheTtlMs?: unknown;
      tarkovDevProfileRateLimitPerMinute?: unknown;
      tarkovDevProfileRateLimitPerHour?: unknown;
      tarkovDevProfileMaxUpdatedAgeDays?: unknown;
      turnstileSecretKey?: unknown;
    };
  const cacheTtlMs = toPositiveInteger(
    typedConfig.tarkovDevProfileCacheTtlMs,
    DEFAULT_PROFILE_CACHE_TTL_MS
  );
  const rateLimitPerMinute = toPositiveInteger(
    typedConfig.tarkovDevProfileRateLimitPerMinute,
    DEFAULT_PROFILE_RATE_LIMIT_PER_MINUTE
  );
  const rateLimitPerHour = toPositiveInteger(
    typedConfig.tarkovDevProfileRateLimitPerHour,
    DEFAULT_PROFILE_RATE_LIMIT_PER_HOUR
  );
  const maxUpdatedAgeDays = toNonNegativeInteger(
    typedConfig.tarkovDevProfileMaxUpdatedAgeDays,
    DEFAULT_PROFILE_MAX_UPDATED_AGE_DAYS
  );
  const turnstileSecretKey =
    typeof typedConfig.turnstileSecretKey === 'string' ? typedConfig.turnstileSecretKey.trim() : '';
  const sharedCacheHandle = createSharedCacheHandle(
    typedConfig.public?.appUrl,
    getRateLimiterBinding(event)
  );
  const trustProxy = Boolean(typedConfig.apiProtection?.trustProxy);
  const rateLimitKey = `profile:ip:${getProxyAwareClientIdentifier(event, trustProxy)}`;
  if (
    !(await consumeRateLimit(
      sharedCacheHandle,
      PROFILE_RATE_LIMIT_PREFIX,
      rateLimitKey,
      rateLimitPerMinute,
      MINUTE_MS
    ))
  ) {
    throw createRateLimitError(event, 60);
  }
  if (
    !(await consumeRateLimit(
      sharedCacheHandle,
      PROFILE_HOURLY_RATE_LIMIT_PREFIX,
      rateLimitKey,
      rateLimitPerHour,
      HOUR_MS
    ))
  ) {
    throw createRateLimitError(event, 3600);
  }
  if (turnstileSecretKey) {
    const verification = await verifyTurnstileToken({
      secretKey: turnstileSecretKey,
      token: getRequestHeader(event, 'x-turnstile-token'),
      allowedHostnames: resolveAllowedTurnstileHostnames(typedConfig.public?.appUrl),
    });
    if (!verification.ok) {
      logger.warn('Tarkov.dev profile request failed Turnstile verification', {
        reason: verification.reason,
      });
      throw createError({
        statusCode: 403,
        statusMessage: 'Verification failed. Reload the page and try again.',
        data: { code: 'turnstile_failed' },
      });
    }
  }
  const wantsFresh = readSingleQueryValue(query.fresh) === '1';
  const cacheKey = source.data.profileJsonUrl;
  const cached = await readCachedProfile(sharedCacheHandle, cacheKey);
  if (cached && !wantsFresh) {
    if (cached.status === 404) {
      throw createProfileFetchError(404);
    }
    enforceProfileFreshness(cached.body, maxUpdatedAgeDays);
    setSuccessCacheHeaders(event, cacheTtlMs);
    return cached.body;
  }
  const upstreamHeaders: Record<string, string> = {
    accept: 'application/json',
    'user-agent': TARKOVTRACKER_USER_AGENT,
  };
  if (wantsFresh && cached?.status === 200 && cached.etag) {
    upstreamHeaders['if-none-match'] = cached.etag;
  }
  let response: Response;
  try {
    response = await fetch(source.data.profileJsonUrl, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error('Tarkov.dev profile fetch failed', {
      error: readErrorForLog(error),
      profileJsonUrl: source.data.profileJsonUrl,
      statusCode: isAbortError(error) ? 504 : 502,
    });
    throw createProfileFetchError(isAbortError(error) ? 504 : 502);
  }
  if (response.status === 304 && cached?.status === 200) {
    await writeCachedProfile(
      sharedCacheHandle,
      cacheKey,
      { ...cached, fetchedAt: Date.now() },
      cacheTtlMs
    );
    enforceProfileFreshness(cached.body, maxUpdatedAgeDays);
    setSuccessCacheHeaders(event, cacheTtlMs);
    return cached.body;
  }
  if (response.status === 404) {
    await writeCachedProfile(
      sharedCacheHandle,
      cacheKey,
      { fetchedAt: Date.now(), status: 404 },
      PROFILE_NOT_FOUND_CACHE_TTL_MS
    );
    logger.error('Tarkov.dev profile returned 404', {
      profileJsonUrl: source.data.profileJsonUrl,
      status: response.status,
    });
    throw createProfileFetchError(404);
  }
  if (!response.ok) {
    logger.error('Tarkov.dev profile returned an upstream error', {
      profileJsonUrl: source.data.profileJsonUrl,
      status: response.status,
    });
    throw createProfileFetchError();
  }
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch (error) {
    logger.error('Tarkov.dev profile JSON parse failed', {
      error: readErrorForLog(error),
      profileJsonUrl: source.data.profileJsonUrl,
      status: response.status,
    });
    throw createProfileFetchError();
  }
  await writeCachedProfile(
    sharedCacheHandle,
    cacheKey,
    {
      body,
      etag: response.headers.get('etag'),
      fetchedAt: Date.now(),
      status: 200,
    },
    cacheTtlMs
  );
  enforceProfileFreshness(body, maxUpdatedAgeDays);
  setSuccessCacheHeaders(event, cacheTtlMs);
  return body;
});
