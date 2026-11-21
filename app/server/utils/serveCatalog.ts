import {
  appendHeader,
  createError,
  defineEventHandler,
  getQuery,
  getRequestURL,
  setHeader,
  type H3Event,
} from 'h3';
import { scheduleBackgroundTask } from '@/server/utils/backgroundTask';
import {
  canSendCatalogGzip,
  markCatalogGzip,
  negotiatesCatalogGzip,
} from '@/server/utils/catalogEncoding';
import {
  CATALOG_BYTES_HEADER,
  gateCatalogCacheBody,
  limitCompressedCatalog,
  openCatalogBody,
  validateCatalogBytes,
} from '@/server/utils/catalogStream';
import { shouldBypassCache } from '@/server/utils/edgeCache';
import { createLogger } from '@/server/utils/logger';
import { getPrecomputedStore, type CatalogKvReader } from '@/server/utils/precomputedTarkov';
import { validateGameMode } from '@/server/utils/tarkov-cache-config';
import { CATALOG_LANGUAGES, CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
import type { CatalogDataset, CatalogRelease } from '@/utils/catalogDatasets';
function catalogLanguage(input: unknown) {
  const first = Array.isArray(input) ? input[0] : input;
  const lang = typeof first === 'string' ? first.toLowerCase() : 'en';
  return CATALOG_LANGUAGES.includes(lang) ? lang : 'en';
}
const logger = createLogger('CatalogSnapshot');
type EdgeStorage = Pick<Cache, 'match' | 'put'>;
function snapshotHeaders(value: Response, status: 'PRECOMPUTE' | 'STALE') {
  const headers = new Headers(value.headers);
  headers.delete('X-Catalog-Key');
  headers.delete(CATALOG_BYTES_HEADER);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  headers.set('X-Cache-Status', status);
  headers.set('Content-Type', 'application/json');
  return headers;
}
async function responseFromStored(value: Response, status: 'PRECOMPUTE' | 'STALE', scope: string) {
  const { body, completion } = await openCatalogBody(value, scope);
  return { response: new Response(body, { headers: snapshotHeaders(value, status) }), completion };
}
async function serveCachedSnapshot(event: H3Event, value: Response, scope: string) {
  // Cache writes close only after the entire gzip stream passes expanded-length validation.
  if (value.body && canSendCatalogGzip(event.context.cloudflare?.request, scope.split('/')[0])) {
    const headers = snapshotHeaders(value, 'PRECOMPUTE');
    markCatalogGzip(headers);
    return new Response(value.body, { headers });
  }
  return (await responseFromStored(value, 'PRECOMPUTE', scope)).response;
}
function catalogEntry(manifest: CatalogRelease | null, scope: string) {
  const entries = manifest?.entries;
  // Older releases still serve the full catalog to comparison clients during rollout.
  const entryScope =
    scope.endsWith('/counts') && !entries?.[scope] ? scope.slice(0, -'/counts'.length) : scope;
  const entry = entries?.[entryScope];
  if (!entry || !entry.key.startsWith(`neutral-catalog-v1/${entryScope}/`)) {
    throw new Error('Missing catalog manifest entry');
  }
  return entry;
}
async function readCatalogSnapshot(store: CatalogKvReader, scope: string, cached?: Response) {
  const manifest = (await store.get(CATALOG_MANIFEST_KEY, 'json')) as CatalogRelease | null;
  const entry = catalogEntry(manifest, scope);
  const bytes = validateCatalogBytes(entry.bytes, scope);
  if (
    cached?.headers.get('X-Catalog-Key') === entry.key &&
    cached.headers.get('X-Catalog-Release') === String(manifest!.completedAt) &&
    cached.headers.get(CATALOG_BYTES_HEADER) === String(bytes)
  )
    return cached;
  const body = await store.get(entry.key, 'stream');
  if (!(body instanceof ReadableStream)) throw new Error('Missing catalog body');
  const seconds = Math.max(
    0,
    Math.floor((manifest!.completedAt + 7 * 86400_000 - Date.now()) / 1000)
  );
  return new Response(limitCompressedCatalog(body), {
    headers: {
      ...entry.headers,
      'Cache-Control': 'public, max-age=' + seconds,
      'X-Catalog-Key': entry.key,
      'X-Catalog-Release': String(manifest!.completedAt),
      [CATALOG_BYTES_HEADER]: String(bytes),
    },
  });
}
function writeSnapshotCache(
  event: H3Event,
  target: { cache: EdgeStorage; key: string } | undefined,
  stored: Response | undefined,
  completion: Promise<void>
) {
  if (!stored) return;
  const body = gateCatalogCacheBody(stored.body!, completion);
  scheduleBackgroundTask(
    event,
    target!.cache.put(target!.key, new Response(body, { headers: stored.headers }))
  );
}
function cancelStoredSnapshot(stored: Response | undefined) {
  void stored?.body?.cancel().catch(() => undefined);
}
async function prepareSnapshot(
  event: H3Event,
  target: { cache: EdgeStorage; key: string } | undefined,
  value: Response,
  scope: string
) {
  const stored = target ? value.clone() : undefined;
  try {
    const { response, completion } = await responseFromStored(value, 'PRECOMPUTE', scope);
    writeSnapshotCache(event, target, stored, completion);
    return response;
  } catch (error) {
    cancelStoredSnapshot(stored);
    throw error;
  }
}
async function fallbackSnapshot(cached: Response | undefined, scope: string) {
  if (cached) {
    try {
      return (await responseFromStored(cached, 'STALE', scope)).response;
    } catch (error) {
      logger.warn('Unable to read cached catalog snapshot', { scope, error });
    }
  }
  throw createError({ statusCode: 503, statusMessage: 'Catalog snapshot unavailable' });
}
async function serveSnapshot(event: H3Event, store: CatalogKvReader | null, scope: string) {
  const cache = (globalThis.caches as (CacheStorage & { default?: EdgeStorage }) | undefined)
    ?.default;
  const key = new URL('/__neutral-catalog-v1/' + scope, getRequestURL(event).origin).href;
  const cached = shouldBypassCache(event)
    ? undefined
    : await cache?.match(key).catch(() => undefined);
  try {
    if (!store) throw new Error('Missing catalog store');
    const value = await readCatalogSnapshot(store, scope, cached);
    if (value === cached) return await serveCachedSnapshot(event, value, scope);
    return await prepareSnapshot(event, cache ? { cache, key } : undefined, value, scope);
  } catch (error) {
    logger.warn('Unable to read catalog snapshot', { scope, error });
    return fallbackSnapshot(cached, scope);
  }
}
export function catalogHandler(dataset: CatalogDataset | 'strings') {
  return defineEventHandler(async (event) => {
    const query = getQuery(event);
    const lang = catalogLanguage(query.lang);
    const mode = validateGameMode(query.gameMode);
    const baseScope = dataset === 'strings' ? `strings/${lang}` : `${dataset}/${mode}`;
    const scope =
      dataset === 'tasks-objectives' && query.view === 'counts' ? baseScope + '/counts' : baseScope;
    setHeader(event, 'Cache-Control', 'no-store');
    if (negotiatesCatalogGzip(dataset)) appendHeader(event, 'Vary', 'Accept-Encoding');
    const store = getPrecomputedStore(event);
    if (import.meta.dev && !store) {
      setHeader(event, 'X-Catalog-Release', 'development');
      const { devCatalog } = await import('@/server/utils/devCatalog');
      return devCatalog(dataset, mode, lang);
    }
    return serveSnapshot(event, store, scope);
  });
}
