import type { LocationQuery, LocationQueryRaw, LocationQueryValue } from 'vue-router';
export const getQueryString = (
  value: LocationQueryValue | LocationQueryValue[] | undefined
): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.find((entry): entry is string => typeof entry === 'string');
  }
  return undefined;
};
type QueryLike = LocationQuery | LocationQueryRaw;
export const normalizeQuery = (query: QueryLike): string => {
  const normalized: Record<string, string> = {};
  Object.keys(query)
    .sort()
    .forEach((key) => {
      const value = query[key];
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) {
        const entries = value.filter(
          (entry): entry is string | number => entry !== undefined && entry !== null
        );
        const nonEmptyEntries = entries.filter((entry) =>
          typeof entry === 'string' ? entry !== '' : true
        );
        if (nonEmptyEntries.length === 0) return;
        normalized[key] = nonEmptyEntries.map(String).join(',');
        return;
      }
      normalized[key] = String(value);
    });
  return JSON.stringify(normalized);
};
let pendingQueryWrite: Promise<unknown> = Promise.resolve();
/**
 * Runs query writes one after another. Each writer builds on the current `route.query`, so two
 * writes started together (a status tab tapped while the search commits) would otherwise each
 * drop the other's param. Read `route.query` inside `write`, not before queueing it.
 */
export const queueQueryWrite = <T>(write: () => Promise<T> | T): Promise<T> => {
  const queued = pendingQueryWrite.then(write);
  pendingQueryWrite = queued.catch(() => undefined);
  return queued;
};
