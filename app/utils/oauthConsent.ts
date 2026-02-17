export const REDACTED_LOG_VALUE = '[REDACTED]' as const;
export const CIRCULAR_LOG_VALUE = '[Circular]' as const;
const DEFAULT_OAUTH_BASE_ORIGIN = 'http://localhost';
const OAUTH_SECURE_PROTOCOLS = new Set(['http:', 'https:']);
const OAUTH_REQUIRED_QUERY_PARAMS = ['code', 'state'] as const;
export const PII_LOG_KEYS = new Set<string>([
  'address',
  'email',
  'first_name',
  'full_name',
  'last_name',
  'name',
  'phone',
  'user_metadata',
]);
function sanitizeForDebugLogWithSeen(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return CIRCULAR_LOG_VALUE;
    seen.add(value);
    return value.map((entry) => sanitizeForDebugLogWithSeen(entry, seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return CIRCULAR_LOG_VALUE;
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
        if (PII_LOG_KEYS.has(key.toLowerCase())) {
          return [key, REDACTED_LOG_VALUE];
        }
        return [key, sanitizeForDebugLogWithSeen(nestedValue, seen)];
      })
    );
  }
  return value;
}
export function sanitizeForDebugLog(value: unknown): unknown {
  return sanitizeForDebugLogWithSeen(value, new WeakSet<object>());
}
export function toSafeRedirectUri(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0]?.split('#')[0] || url;
  }
}
const resolveOAuthBaseOrigin = (baseOrigin?: string): string => {
  if (baseOrigin) {
    return baseOrigin;
  }
  if (typeof globalThis.location?.origin === 'string' && globalThis.location.origin.length > 0) {
    return globalThis.location.origin;
  }
  return DEFAULT_OAUTH_BASE_ORIGIN;
};
const parseOAuthUrl = (value: string, baseOrigin: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(value, baseOrigin);
    } catch {
      return null;
    }
  }
};
const hasNonEmptySearchParam = (url: URL | null, key: string): boolean => {
  const value = url?.searchParams.get(key);
  return typeof value === 'string' && value.trim().length > 0;
};
export interface OAuthRedirectValidationOptions {
  baseOrigin?: string;
  expectedRedirectUri?: string;
  preservedQuerySource?: string;
  requiredQueryParams?: readonly string[];
}
export function validateOAuthRedirectUri(
  redirectUrl: string | undefined,
  options: OAuthRedirectValidationOptions = {}
): boolean {
  if (!redirectUrl) {
    return false;
  }
  const baseOrigin = resolveOAuthBaseOrigin(options.baseOrigin);
  const redirectTarget = parseOAuthUrl(redirectUrl, baseOrigin);
  if (!redirectTarget || !OAUTH_SECURE_PROTOCOLS.has(redirectTarget.protocol)) {
    return false;
  }
  const expectedTarget = options.expectedRedirectUri
    ? parseOAuthUrl(options.expectedRedirectUri, baseOrigin)
    : null;
  if (options.expectedRedirectUri && !expectedTarget) {
    return false;
  }
  if (
    expectedTarget &&
    (redirectTarget.origin !== expectedTarget.origin ||
      redirectTarget.pathname !== expectedTarget.pathname)
  ) {
    return false;
  }
  const preservedSource = options.preservedQuerySource
    ? parseOAuthUrl(options.preservedQuerySource, baseOrigin)
    : null;
  const hasErrorParam = hasNonEmptySearchParam(redirectTarget, 'error');
  const requiredQueryParams =
    options.requiredQueryParams ?? (hasErrorParam ? ['state'] : [...OAUTH_REQUIRED_QUERY_PARAMS]);
  return requiredQueryParams.every((key) => {
    return (
      hasNonEmptySearchParam(redirectTarget, key) || hasNonEmptySearchParam(preservedSource, key)
    );
  });
}
