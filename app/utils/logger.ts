type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type ClientLogPayload = {
  args: unknown[];
  href: string | null;
  level: LogLevel;
  timestamp: string;
};
type Logger = {
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};
const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
const FALLBACK_LOG_LEVEL: LogLevel =
  import.meta.env.MODE === 'test' ? 'warn' : import.meta.env.DEV ? 'info' : 'warn';
const MAX_LOG_ARG_LENGTH = 2000;
let cachedClientLogSinkUrl: string | null = null;
let cachedLogLevel: LogLevel | null = null;
function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && value in levelPriority;
}
function normalizeLogArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    return {
      message: arg.message,
      name: arg.name,
      stack: typeof arg.stack === 'string' ? arg.stack.slice(0, MAX_LOG_ARG_LENGTH) : undefined,
    };
  }
  if (typeof arg === 'bigint') {
    return arg.toString();
  }
  if (typeof arg === 'function') {
    return `[Function ${arg.name || 'anonymous'}]`;
  }
  if (typeof arg === 'string') {
    return arg.length > MAX_LOG_ARG_LENGTH ? `${arg.slice(0, MAX_LOG_ARG_LENGTH)}...` : arg;
  }
  if (
    typeof arg === 'number' ||
    typeof arg === 'boolean' ||
    arg === null ||
    typeof arg === 'undefined'
  ) {
    return arg;
  }
  try {
    const serialized = JSON.stringify(arg);
    if (typeof serialized !== 'string') {
      return String(arg);
    }
    if (serialized.length > MAX_LOG_ARG_LENGTH) {
      return `${serialized.slice(0, MAX_LOG_ARG_LENGTH)}...`;
    }
    return JSON.parse(serialized);
  } catch {
    return String(arg);
  }
}
const resolveClientLogSinkUrl = (): string => {
  if (cachedClientLogSinkUrl !== null) {
    return cachedClientLogSinkUrl;
  }
  const nuxtApp = tryUseNuxtApp();
  const runtimeSink = nuxtApp?.$config?.public?.clientLogSinkUrl;
  const normalizedSink = typeof runtimeSink === 'string' ? runtimeSink.trim() : '';
  cachedClientLogSinkUrl = normalizedSink;
  return cachedClientLogSinkUrl;
};
const resolveLogLevel = (): LogLevel => {
  if (cachedLogLevel !== null) return cachedLogLevel;
  const nuxtApp = tryUseNuxtApp();
  const runtimeLevel = nuxtApp?.$config?.public?.logLevel;
  const envLevel =
    import.meta.env.NUXT_PUBLIC_LOG_LEVEL ||
    // deprecated — remove after 2026-07-31
    import.meta.env.VITE_LOG_LEVEL;
  const runtimeLevelString = typeof runtimeLevel === 'string' ? runtimeLevel.trim() : undefined;
  const rawLevel = runtimeLevelString ? runtimeLevelString : envLevel;
  const normalizedLevel = typeof rawLevel === 'string' ? rawLevel.toLowerCase() : undefined;
  cachedLogLevel = isLogLevel(normalizedLevel) ? normalizedLevel : FALLBACK_LOG_LEVEL;
  return cachedLogLevel;
};
const shouldClientLog = (level: LogLevel): boolean =>
  levelPriority[level] >= levelPriority[resolveLogLevel()];
const CLIENT_LOG_MAX_PER_SESSION = 30;
const CLIENT_LOG_MAX_PER_MINUTE = 5;
const CLIENT_LOG_WINDOW_MS = 60_000;
let clientLogSessionCount = 0;
let clientLogWindowTimestamps: number[] = [];
const canSendClientLog = (): boolean => {
  if (clientLogSessionCount >= CLIENT_LOG_MAX_PER_SESSION) {
    return false;
  }
  const now = Date.now();
  clientLogWindowTimestamps = clientLogWindowTimestamps.filter(
    (ts) => now - ts < CLIENT_LOG_WINDOW_MS
  );
  if (clientLogWindowTimestamps.length >= CLIENT_LOG_MAX_PER_MINUTE) {
    return false;
  }
  clientLogWindowTimestamps.push(now);
  clientLogSessionCount++;
  return true;
};
const sendClientLog = (level: LogLevel, args: unknown[]): void => {
  if (import.meta.env.MODE === 'test') {
    return;
  }
  if (typeof window === 'undefined') {
    return;
  }
  if (!shouldClientLog(level)) {
    return;
  }
  const sinkUrl = resolveClientLogSinkUrl();
  if (!sinkUrl) {
    return;
  }
  if (!canSendClientLog()) {
    return;
  }
  const payload: ClientLogPayload = {
    args: args.map((arg) => normalizeLogArg(arg)),
    href: window.location.href || null,
    level,
    timestamp: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(sinkUrl, blob);
    return;
  }
  void fetch(sinkUrl, {
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => undefined);
};
export const resetCachedLogLevel = (): void => {
  cachedLogLevel = null;
  cachedClientLogSinkUrl = null;
};
export const logger: Logger = {
  debug: (...args: unknown[]) => {
    if (shouldClientLog('debug')) console.debug(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
    sendClientLog('error', args);
  },
  info: (...args: unknown[]) => {
    if (shouldClientLog('info')) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldClientLog('warn')) console.warn(...args);
    sendClientLog('warn', args);
  },
};
function createDevLogger(method: 'debug' | 'warn' | 'error') {
  return (message: string, ...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console[method](`[DEV] ${message}`, ...args);
    }
  };
}
export const devLog = createDevLogger('debug');
