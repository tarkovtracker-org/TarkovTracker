import type { LocationQuery, LocationQueryRaw, RouteLocationNormalizedLoaded } from 'vue-router';
const IGNORED_QUERY_KEYS = new Set([
  '_tt_retry',
  'access_token',
  'code',
  'error',
  'error_code',
  'error_description',
  'expires_at',
  'expires_in',
  'provider_refresh_token',
  'provider_token',
  'redirect',
  'refresh_token',
  'state',
  'token',
  'token_type',
]);
const IGNORED_QUERY_PREFIXES = ['utm_'];
type QueryLike = LocationQuery | LocationQueryRaw;
type QueryLikeValue = QueryLike[string];
const shouldIgnoreQueryKey = (key: string): boolean => {
  const normalizedKey = key.toLowerCase();
  if (IGNORED_QUERY_KEYS.has(normalizedKey)) {
    return true;
  }
  return (
    IGNORED_QUERY_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix)) ||
    normalizedKey.endsWith('clid')
  );
};
const toQueryValues = (value: QueryLikeValue | undefined): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string | number => entry !== null && entry !== undefined)
      .map((entry) => String(entry));
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [String(value)];
};
const sanitizeQueryValue = (value: string): string => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }
  const malformedQueryIndex = trimmedValue.indexOf('?');
  if (malformedQueryIndex === -1) {
    return trimmedValue;
  }
  return trimmedValue.slice(0, malformedQueryIndex).trim();
};
const buildNormalizedSearch = (query: QueryLike): string => {
  const params = new URLSearchParams();
  Object.keys(query)
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => {
      if (shouldIgnoreQueryKey(key)) {
        return;
      }
      const uniqueValues = new Set(
        toQueryValues(query[key])
          .map(sanitizeQueryValue)
          .filter((value) => value.length > 0)
      );
      Array.from(uniqueValues)
        .sort((left, right) => left.localeCompare(right))
        .forEach((value) => {
          params.append(key, value);
        });
    });
  const search = params.toString();
  return search ? `?${search}` : '';
};
type AnalyticsRouteLike = Pick<RouteLocationNormalizedLoaded, 'path' | 'query'>;
const getLocationFallback = (): AnalyticsRouteLike => ({
  path: window.location.pathname || '/',
  query: Object.fromEntries(new URLSearchParams(window.location.search).entries()),
});
export const getAnalyticsPagePath = (route?: AnalyticsRouteLike): string => {
  if (!import.meta.client) {
    return '/';
  }
  const sourceRoute = route ?? getLocationFallback();
  const normalizedPath = sourceRoute.path || '/';
  const normalizedSearch = buildNormalizedSearch(sourceRoute.query ?? {});
  return `${normalizedPath}${normalizedSearch}`;
};
export const getAnalyticsPageLocation = (route?: AnalyticsRouteLike): string => {
  if (!import.meta.client) {
    return '/';
  }
  return `${window.location.origin}${getAnalyticsPagePath(route)}`;
};
