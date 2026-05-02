const STATUS_MESSAGE_MAX_LENGTH = 160;
const REDACTED_PLACEHOLDER = '[redacted]';
const SENSITIVE_VARIABLE_REGEX = [
  /^accesstoken$/,
  /^apikey$/,
  /^auth$/,
  /^authorization$/,
  /^bearer$/,
  /^card$/,
  /^ccnum$/,
  /^clientsecret$/,
  /^credential$/,
  /^creditcard$/,
  /^cvv$/,
  /^dob$/,
  /^email$/,
  /^idtoken$/,
  /^otp$/,
  /^passwd$/,
  /^password$/,
  /^phone$/,
  /^pin$/,
  /^privatekey$/,
  /^pwd$/,
  /^refresh$/,
  /^secret$/,
  /^session$/,
  /^signature$/,
  /^ssn$/,
  /^token$/,
  /^userid$/,
];
const normalizeSensitiveKey = (key: string): string => {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
};
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
export const sanitizeErrorMessage = (message: string): string => {
  let sanitized = message.trim();
  if (!sanitized) return '';
  sanitized = sanitized.replace(/\bhttps?:\/\/[^\s]+/gi, '[host]');
  sanitized = sanitized.replace(/\b[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?\b/gi, '[host]');
  sanitized = sanitized.replace(/(?:[A-Za-z]:\\|\/)[^\s]+/g, '[path]');
  sanitized = sanitized.replace(
    /\b(select|insert|update|delete|drop|alter|create|truncate|union)\b\s+[^;]+/gi,
    '[sql]'
  );
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  if (sanitized.length > STATUS_MESSAGE_MAX_LENGTH) {
    sanitized = `${sanitized.slice(0, STATUS_MESSAGE_MAX_LENGTH - 3)}...`;
  }
  return sanitized;
};
export const sanitizeGraphQLErrors = (errors: unknown): string => {
  try {
    if (Array.isArray(errors)) {
      const sanitized = errors.map((err) => {
        if (typeof err === 'object' && err !== null) {
          const e = err as Record<string, unknown>;
          return {
            code:
              e.extensions && typeof e.extensions === 'object'
                ? (e.extensions as Record<string, unknown>).code
                : undefined,
            type: typeof e.message === 'string' ? e.message.slice(0, 100) : 'Unknown error',
          };
        }
        return { type: 'Unknown error' };
      });
      return JSON.stringify(sanitized);
    }
    if (typeof errors === 'object' && errors !== null) {
      return JSON.stringify({ type: 'Non-array error object' });
    }
    return 'Unknown error format';
  } catch {
    return 'Error sanitization failed';
  }
};
export function sanitizeVariables(variables: Record<string, unknown>): Record<string, unknown> {
  const sanitizeValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry) => sanitizeValue(entry));
    }
    if (isPlainObject(value)) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        const normalizedKey = normalizeSensitiveKey(key);
        const shouldRedact = SENSITIVE_VARIABLE_REGEX.some((regex) => regex.test(normalizedKey));
        sanitized[key] = shouldRedact ? REDACTED_PLACEHOLDER : sanitizeValue(entry);
      }
      return sanitized;
    }
    return value;
  };
  return sanitizeValue(variables) as Record<string, unknown>;
}
