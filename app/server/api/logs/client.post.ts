import { defineEventHandler, readBody, setResponseHeader, setResponseStatus } from 'h3';
import { useRuntimeConfig } from '#imports';
import { createLogger } from '@/server/utils/logger';
import { getProxyAwareClientIdentifier } from '@/server/utils/requestIdentity';
import {
  consumeSharedRateLimit,
  createSharedCacheHandle,
  type SharedCacheHandle,
} from '@/server/utils/sharedEdgeStore';
import type { ApiProtectionConfig } from '@/server/middleware/api-protection';
type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';
type ClientLogBody = {
  args?: unknown[];
  href?: unknown;
  level?: unknown;
  timestamp?: unknown;
};
const clientLogLevels: ClientLogLevel[] = ['debug', 'info', 'warn', 'error'];
const logger = createLogger('ClientLogsApi');
const CLIENT_LOG_RATE_LIMIT_PREFIX = 'client-logs-rate';
const CLIENT_LOG_RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const toClientLogLevel = (value: unknown): ClientLogLevel => {
  if (typeof value === 'string' && clientLogLevels.includes(value as ClientLogLevel)) {
    return value as ClientLogLevel;
  }
  return 'info';
};
const toSafeString = (value: unknown, maxLength = 512): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
};
const sanitizeArgs = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 20);
};
const consumeRateLimit = async (handle: SharedCacheHandle, key: string): Promise<boolean> => {
  return consumeSharedRateLimit(
    handle,
    CLIENT_LOG_RATE_LIMIT_PREFIX,
    key,
    CLIENT_LOG_RATE_LIMIT_PER_MINUTE,
    RATE_LIMIT_WINDOW_MS,
    ({ action, error, key: failedKey }) => {
      console.warn('[ClientLogsApi] Client log rate-limit cache operation failed', {
        action,
        error: error instanceof Error ? error.message : String(error),
        key: failedKey,
      });
    }
  );
};
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');
  const typedConfig = useRuntimeConfig(event) as ReturnType<typeof useRuntimeConfig> &
    ApiProtectionConfig;
  const trustProxy = Boolean(typedConfig.apiProtection?.trustProxy);
  const sharedCacheHandle = createSharedCacheHandle(typedConfig.public?.appUrl);
  const rateLimitKey = `client-logs:ip:${getProxyAwareClientIdentifier(event, trustProxy)}`;
  if (!(await consumeRateLimit(sharedCacheHandle, rateLimitKey))) {
    setResponseStatus(event, 204);
    return null;
  }
  const body = (await readBody(event).catch(() => null)) as ClientLogBody | null;
  if (!body || typeof body !== 'object') {
    setResponseStatus(event, 204);
    return null;
  }
  const level = toClientLogLevel(body.level);
  const args = sanitizeArgs(body.args);
  const href = toSafeString(body.href, 1024);
  const timestamp = toSafeString(body.timestamp, 64) ?? new Date().toISOString();
  const payload = {
    args,
    href,
    timestamp,
  };
  if (level === 'debug') logger.debug('Client log', payload);
  if (level === 'info') logger.info('Client log', payload);
  if (level === 'warn') logger.warn('Client log', payload);
  if (level === 'error') logger.error('Client log', payload);
  setResponseStatus(event, 204);
  return null;
});
