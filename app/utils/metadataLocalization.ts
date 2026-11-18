import {
  collectGameDataStrings,
  hasGameDataStrings,
  localizeGameData,
  MissingGameDataStringError,
} from '@/utils/gameDataStrings';
import { logger } from '@/utils/logger';
import { abandonSharedWait, tarkovApiFetch } from '@/utils/tarkovApiFetch';
import { CACHE_CONFIG, getCachedData, setCachedData } from '@/utils/tarkovCache';
type StringTable = Record<string, string>;
type TableEntry = { strings: StringTable; expires: number };
type TableResult = { strings: StringTable; fetched: boolean };
type PendingTable = { promise: Promise<StringTable>; refresh: boolean };
type StringCache = {
  tables: Map<string, TableEntry>;
  pending: Map<string, PendingTable>;
  writes: Map<string, symbol>;
};
const caches = new WeakMap<object, StringCache>();
const invalidatedOwners = new WeakSet<object>();
const STRINGS_CACHE_VERSION = 'strings-v1';
const stringCache = (owner: object): StringCache => {
  let cache = caches.get(toRaw(owner));
  if (!cache) {
    cache = { tables: new Map(), pending: new Map(), writes: new Map() };
    caches.set(toRaw(owner), cache);
  }
  return cache;
};
export function claimMetadataCacheWrite(owner: object, scope: string): () => boolean {
  const cache = stringCache(owner);
  const claim = Symbol(scope);
  cache.writes.set(scope, claim);
  return () => caches.get(toRaw(owner)) === cache && cache.writes.get(scope) === claim;
}
const validStrings = (value: unknown): value is StringTable =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === 'string');
export function invalidateGameDataStrings(owner: object, invalidate = true): void {
  if (!invalidate) return;
  caches.delete(toRaw(owner));
  invalidatedOwners.add(toRaw(owner));
}
export async function hasCachedGameDataStrings(
  owner: object,
  language: string,
  data?: unknown
): Promise<boolean> {
  const saved = stringCache(owner).tables.get(language);
  const strings =
    saved && saved.expires > Date.now()
      ? saved.strings
      : await getCachedData<StringTable>('strings', STRINGS_CACHE_VERSION, language);
  if (!validStrings(strings)) return false;
  return [...collectGameDataStrings(data)].every((key) => Object.hasOwn(strings, key));
}
export function localizeCachedMetadata<T>(owner: object, data: T, language: string): T | null {
  if (!hasGameDataStrings(data)) return data;
  const saved = stringCache(owner).tables.get(language);
  if (!saved || saved.expires <= Date.now()) return null;
  const keys = collectGameDataStrings(data);
  if ([...keys].some((key) => !Object.hasOwn(saved.strings, key))) return null;
  return localizeGameData(data, saved.strings);
}
async function fetchStrings(language: string, refresh = false): Promise<TableResult> {
  const cached = refresh
    ? null
    : await getCachedData<StringTable>('strings', STRINGS_CACHE_VERSION, language);
  if (validStrings(cached)) return { strings: cached, fetched: false };
  const response = await tarkovApiFetch<{ data: { strings: StringTable } }>('/api/tarkov/strings', {
    query: { lang: language, ...(refresh ? { cacheBust: '1' } : {}) },
  });
  if (!validStrings(response?.data?.strings)) throw new TypeError('Invalid game string table');
  return { strings: response.data.strings, fetched: true };
}
const freshStringTable = (
  cache: StringCache,
  language: string,
  refresh: boolean
): StringTable | null => {
  if (refresh) return null;
  const saved = cache.tables.get(language);
  return saved && saved.expires > Date.now() ? saved.strings : null;
};
const pendingStringRequest = (cache: StringCache, language: string, refresh: boolean) => {
  const pending = cache.pending.get(language);
  return pending && (!refresh || pending.refresh) ? pending : null;
};
const publishStringTable = (
  owner: object,
  context: { cache: StringCache; language: string; request: PendingTable; result: TableResult }
) => {
  const { cache, language, request, result } = context;
  if (caches.get(toRaw(owner)) !== cache) return;
  if (cache.pending.get(language) !== request) return;
  cache.tables.set(language, {
    strings: result.strings,
    expires: Date.now() + CACHE_CONFIG.DEFAULT_TTL,
  });
  invalidatedOwners.delete(toRaw(owner));
  if (result.fetched) {
    const canWrite = claimMetadataCacheWrite(owner, `strings/${language}`);
    void setCachedData(
      'strings',
      STRINGS_CACHE_VERSION,
      language,
      result.strings,
      undefined,
      canWrite
    ).catch((error) => logger.warn('[MetadataStore] Failed to cache game strings:', error));
  }
};
const createStringRequest = (
  owner: object,
  language: string,
  cache: StringCache,
  refresh: boolean
) => {
  const request: PendingTable = {
    refresh,
    promise: Promise.resolve()
      .then(() => fetchStrings(language, refresh))
      .then((result) => {
        publishStringTable(owner, { cache, language, request, result });
        return result.strings;
      })
      .finally(() => {
        if (cache.pending.get(language) === request) cache.pending.delete(language);
      }),
  };
  cache.pending.set(language, request);
  return request.promise;
};
async function loadGameDataStrings(
  owner: object,
  language: string,
  signal?: AbortSignal,
  refresh = invalidatedOwners.has(toRaw(owner))
): Promise<StringTable> {
  signal?.throwIfAborted();
  const cache = stringCache(owner);
  const saved = freshStringTable(cache, language, refresh);
  if (saved) return saved;
  const pending = pendingStringRequest(cache, language, refresh);
  const shared = pending ? pending.promise : createStringRequest(owner, language, cache, refresh);
  return abandonSharedWait(shared, signal);
}
/** Neutral catalogs stay in the cache. Consumers receive their own localized view. */
export async function localizeMetadata<T>(
  owner: object,
  data: T,
  language: string,
  signal?: AbortSignal
): Promise<T> {
  if (!hasGameDataStrings(data)) return data;
  let strings = await loadGameDataStrings(owner, language, signal);
  const references = collectGameDataStrings(data);
  // A newly published neutral catalog can reference keys absent from an older cached table.
  if ([...references].some((key) => !Object.hasOwn(strings, key))) {
    strings = await loadGameDataStrings(owner, language, signal, true);
  }
  signal?.throwIfAborted();
  return localizeGameData(data, strings);
}
/** Retry one incompatible network snapshot after refreshing the current string inventory. */
export async function fetchLocalizedMetadata<T>(
  owner: object,
  context: { load: () => Promise<T>; language: string; signal?: AbortSignal }
): Promise<{ neutral: T; localized: T }> {
  const load = async () => {
    const neutral = await context.load();
    const localized = await localizeMetadata(owner, neutral, context.language, context.signal);
    return { neutral, localized };
  };
  try {
    return await load();
  } catch (error) {
    if (!(error instanceof MissingGameDataStringError)) throw error;
    return load();
  }
}
