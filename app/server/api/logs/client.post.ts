import {
  defineEventHandler,
  getRequestHeader,
  readBody,
  setResponseHeader,
  setResponseStatus,
} from 'h3';
import { createLogger } from '@/server/utils/logger';
type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';
type ClientLogBody = {
  args?: unknown[];
  href?: unknown;
  level?: unknown;
  timestamp?: unknown;
};
const clientLogLevels: ClientLogLevel[] = ['debug', 'info', 'warn', 'error'];
const logger = createLogger('ClientLogsApi');
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
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0');
  const body = (await readBody(event).catch(() => null)) as ClientLogBody | null;
  if (!body || typeof body !== 'object') {
    setResponseStatus(event, 204);
    return null;
  }
  const level = toClientLogLevel(body.level);
  const args = sanitizeArgs(body.args);
  const href = toSafeString(body.href, 1024);
  const timestamp = toSafeString(body.timestamp, 64) ?? new Date().toISOString();
  const clientIp =
    toSafeString(getRequestHeader(event, 'cf-connecting-ip')) ||
    toSafeString(getRequestHeader(event, 'x-forwarded-for')) ||
    toSafeString(event.node?.req?.socket?.remoteAddress);
  const payload = {
    args,
    clientIp,
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
