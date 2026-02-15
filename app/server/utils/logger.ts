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
const rawLogLevel = process.env.LOG_LEVEL?.toLowerCase();
const configuredLevel: LogLevel | undefined = isLogLevel(rawLogLevel) ? rawLogLevel : undefined;
const isDevelopment = process.env.NODE_ENV === 'development';
const LOG_LEVEL: LogLevel = configuredLevel ?? (isDevelopment ? 'info' : 'warn');
/**
 * Checks if a message at the given level should be logged based on the configured LOG_LEVEL
 */
function shouldServerLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[LOG_LEVEL];
}
/**
 * Creates a tagged logger for server-side modules
 * @param tag - The tag to prefix log messages with
 */
export const createLogger = (tag: string) => {
  return {
    debug: (...args: unknown[]) => {
      if (shouldServerLog('debug')) {
        console.debug(`[${tag}:debug]`, ...args);
      }
    },
    info: (...args: unknown[]) => {
      if (shouldServerLog('info')) {
        console.info(`[${tag}]`, ...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (shouldServerLog('warn')) {
        console.warn(`[${tag}]`, ...args);
      }
    },
    error: (...args: unknown[]) => {
      // Errors are always logged
      console.error(`[${tag}]`, ...args);
    },
  };
};
/**
 * Default server logger
 */
export const logger = createLogger('Server');
