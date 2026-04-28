import { createError, defineEventHandler, getQuery, setResponseHeaders } from 'h3';
import { useRuntimeConfig } from '#imports';
import { createLogger } from '@/server/utils/logger';
import { getProxyAwareClientIdentifier } from '@/server/utils/requestIdentity';
import {
  consumeSharedRateLimit,
  createSharedCacheHandle,
  type SharedCacheHandle,
} from '@/server/utils/sharedEdgeStore';
import { resolveTarkovDevProfileSource } from '@/utils/tarkovDevProfileSource';
import type { ApiProtectionConfig } from '@/server/middleware/api-protection';
const logger = createLogger('TarkovDevProfileApi');
const PROFILE_FETCH_TIMEOUT_MS = 10_000;
const PROFILE_FETCH_USER_AGENT = 'TarkovTracker/1.x (+https://tarkovtracker.org)';
const PROFILE_RATE_LIMIT_PER_MINUTE = 30;
const PROFILE_RATE_LIMIT_PREFIX = 'tarkov-dev-profile-rate';
const RATE_LIMIT_WINDOW_MS = 60_000;
function readProfileUrlQuery(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}
function createProfileFetchError(statusCode = 502) {
  return createError({
    statusCode,
    statusMessage:
      'Unable to fetch Tarkov.dev profile. Open the profile on Tarkov.dev, then try again.',
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
async function consumeRateLimit(handle: SharedCacheHandle, key: string): Promise<boolean> {
  return consumeSharedRateLimit(
    handle,
    PROFILE_RATE_LIMIT_PREFIX,
    key,
    PROFILE_RATE_LIMIT_PER_MINUTE,
    RATE_LIMIT_WINDOW_MS,
    ({ action, error, key: failedKey }) => {
      logger.warn('Tarkov.dev profile rate-limit cache operation failed', {
        action,
        error: error instanceof Error ? error.message : String(error),
        key: failedKey,
      });
    }
  );
}
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'Cache-Control': 'no-store' });
  const query = getQuery(event);
  const source = resolveTarkovDevProfileSource(readProfileUrlQuery(query.url));
  if (!source.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: source.error,
    });
  }
  const typedConfig = useRuntimeConfig(event) as ReturnType<typeof useRuntimeConfig> &
    ApiProtectionConfig;
  const sharedCacheHandle = createSharedCacheHandle(typedConfig.public?.appUrl);
  const trustProxy = Boolean(typedConfig.apiProtection?.trustProxy);
  const rateLimitKey = `profile:ip:${getProxyAwareClientIdentifier(event, trustProxy)}`;
  if (!(await consumeRateLimit(sharedCacheHandle, rateLimitKey))) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' });
  }
  let response: Response;
  try {
    response = await fetch(source.data.profileJsonUrl, {
      headers: {
        accept: 'application/json',
        'user-agent': PROFILE_FETCH_USER_AGENT,
      },
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
  if (response.status === 404) {
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
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    logger.error('Tarkov.dev profile JSON parse failed', {
      error: readErrorForLog(error),
      profileJsonUrl: source.data.profileJsonUrl,
      status: response.status,
    });
    throw createProfileFetchError();
  }
});
