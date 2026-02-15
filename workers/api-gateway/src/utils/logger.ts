type LogMethod = (...args: unknown[]) => void;
type Logger = {
  debug: LogMethod;
  error: LogMethod;
  info: LogMethod;
  warn: LogMethod;
};
const withPrefix =
  (method: LogMethod, level: string): LogMethod =>
  (...args: unknown[]) => {
    method(`[api-gateway:${level}]`, ...args);
  };
export const logger: Logger = {
  debug: withPrefix(console.debug.bind(console), 'debug'),
  error: withPrefix(console.error.bind(console), 'error'),
  info: withPrefix(console.info.bind(console), 'info'),
  warn: withPrefix(console.warn.bind(console), 'warn'),
};
