type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
/**
 * Type guard to check if a value is a valid LogLevel
 */
function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && value in levelPriority;
}
// Default to "warn" to keep consoles clean; can be raised with VITE_LOG_LEVEL=info|debug
const rawEnvLevel = import.meta.env.VITE_LOG_LEVEL;
const normalizedLevel = typeof rawEnvLevel === 'string' ? rawEnvLevel.toLowerCase() : undefined;
const configuredLevel: LogLevel | undefined = isLogLevel(normalizedLevel)
  ? normalizedLevel
  : undefined;
const LOG_LEVEL: LogLevel = configuredLevel ?? (import.meta.env.DEV ? 'info' : 'warn');
const shouldLog = (level: LogLevel) => levelPriority[level] >= levelPriority[LOG_LEVEL];
export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(...args);
  },
  error: (...args: unknown[]) => console.error(...args),
};
/**
 * Creates a development-only logger function for a specific console method.
 * These always emit when import.meta.env.DEV is true, bypassing LOG_LEVEL.
 * Use these for debugging information that should never appear in production.
 */
function createDevLogger(method: 'debug' | 'warn' | 'error') {
  return (message: string, ...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console[method](`[DEV] ${message}`, ...args);
    }
  };
}
export const devLog = createDevLogger('debug');
export const devWarn = createDevLogger('warn');
export const devError = createDevLogger('error');
