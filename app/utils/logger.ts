type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type ClientLogPayload = {
  args: unknown[];
  href: string | null;
  level: LogLevel;
  timestamp: string;
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
      const truncated = `${serialized.slice(0, MAX_LOG_ARG_LENGTH)}...`;
      return truncated;
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
  const runtimeLevel = nuxtApp?.$config?.public?.VITE_LOG_LEVEL;
  const envLevel = import.meta.env.VITE_LOG_LEVEL;
  const runtimeLevelString = typeof runtimeLevel === 'string' ? runtimeLevel.trim() : undefined;
  const rawLevel = runtimeLevelString ? runtimeLevelString : envLevel;
  const normalizedLevel = typeof rawLevel === 'string' ? rawLevel.toLowerCase() : undefined;
  cachedLogLevel = isLogLevel(normalizedLevel) ? normalizedLevel : FALLBACK_LOG_LEVEL;
  return cachedLogLevel;
};
const shouldClientLog = (level: LogLevel): boolean =>
  levelPriority[level] >= levelPriority[resolveLogLevel()];
const sendClientLog = (level: LogLevel, args: unknown[]): void => {
  if (import.meta.env.MODE === 'test') {
    return;
  }
  if (typeof window === 'undefined') {
    return;
  }
  const sinkUrl = resolveClientLogSinkUrl();
  if (!sinkUrl) {
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
export const logger = {
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
