type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && value in levelPriority;
}
const FALLBACK_LOG_LEVEL: LogLevel =
  import.meta.env.MODE === 'test' ? 'warn' : import.meta.env.DEV ? 'info' : 'warn';
let cachedLogLevel: LogLevel | null = null;
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
export const resetCachedLogLevel = (): void => {
  cachedLogLevel = null;
};
const shouldClientLog = (level: LogLevel) =>
  levelPriority[level] >= levelPriority[resolveLogLevel()];
export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldClientLog('debug')) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (shouldClientLog('info')) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldClientLog('warn')) console.warn(...args);
  },
  error: (...args: unknown[]) => console.error(...args),
};
function createDevLogger(method: 'debug' | 'warn' | 'error') {
  return (message: string, ...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console[method](`[DEV] ${message}`, ...args);
    }
  };
}
export const devLog = createDevLogger('debug');
