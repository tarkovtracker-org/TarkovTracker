import { useRuntimeConfig } from '#imports';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type ServerLogPayload = {
  args: unknown[];
  level: LogLevel;
  source: string;
  timestamp: string;
};
const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
const LOG_PAYLOAD_ARG_MAX_LENGTH = 4000;
const rawLogLevel = process.env.LOG_LEVEL?.toLowerCase();
const configuredLevel: LogLevel | undefined = isLogLevel(rawLogLevel) ? rawLogLevel : undefined;
const isDevelopment = process.env.NODE_ENV === 'development';
const LOG_LEVEL: LogLevel = configuredLevel ?? (isDevelopment ? 'info' : 'warn');
let cachedLogSinkUrl = '';
let hasResolvedSinkUrl = false;
function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && value in levelPriority;
}
function shouldServerLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[LOG_LEVEL];
}
function normalizeLogArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    return {
      message: arg.message,
      name: arg.name,
      stack: typeof arg.stack === 'string' ? arg.stack.slice(0, LOG_PAYLOAD_ARG_MAX_LENGTH) : null,
    };
  }
  if (typeof arg === 'bigint') {
    return arg.toString();
  }
  if (typeof arg === 'function') {
    return `[Function ${arg.name || 'anonymous'}]`;
  }
  if (typeof arg === 'string') {
    return arg.length > LOG_PAYLOAD_ARG_MAX_LENGTH
      ? `${arg.slice(0, LOG_PAYLOAD_ARG_MAX_LENGTH)}...`
      : arg;
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
    return JSON.parse(JSON.stringify(arg));
  } catch {
    return String(arg);
  }
}
function resolveLogSinkUrl(): string {
  if (hasResolvedSinkUrl) {
    return cachedLogSinkUrl;
  }
  hasResolvedSinkUrl = true;
  try {
    const runtimeConfig = useRuntimeConfig();
    const runtimeSink = runtimeConfig?.logSinkUrl;
    if (typeof runtimeSink === 'string' && runtimeSink.trim().length > 0) {
      cachedLogSinkUrl = runtimeSink.trim();
      return cachedLogSinkUrl;
    }
  } catch {
    cachedLogSinkUrl = '';
    return cachedLogSinkUrl;
  }
  const envSink = process.env.LOG_SINK_URL;
  cachedLogSinkUrl = typeof envSink === 'string' ? envSink.trim() : '';
  return cachedLogSinkUrl;
}
function sendServerLog(level: LogLevel, source: string, args: unknown[]): void {
  const sinkUrl = resolveLogSinkUrl();
  if (!sinkUrl) {
    return;
  }
  const payload: ServerLogPayload = {
    args: args.map((arg) => normalizeLogArg(arg)),
    level,
    source,
    timestamp: new Date().toISOString(),
  };
  void fetch(sinkUrl, {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  }).catch(() => undefined);
}
export const createLogger = (tag: string) => {
  return {
    debug: (...args: unknown[]) => {
      if (shouldServerLog('debug')) {
        console.debug(`[${tag}:debug]`, ...args);
        sendServerLog('debug', tag, args);
      }
    },
    error: (...args: unknown[]) => {
      console.error(`[${tag}]`, ...args);
      sendServerLog('error', tag, args);
    },
    info: (...args: unknown[]) => {
      if (shouldServerLog('info')) {
        console.info(`[${tag}]`, ...args);
        sendServerLog('info', tag, args);
      }
    },
    warn: (...args: unknown[]) => {
      if (shouldServerLog('warn')) {
        console.warn(`[${tag}]`, ...args);
        sendServerLog('warn', tag, args);
      }
    },
  };
};
export const logger = createLogger('Server');
