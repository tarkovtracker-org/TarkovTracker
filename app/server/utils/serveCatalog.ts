import {
  createError,
  defineEventHandler,
  getQuery,
  getRequestURL,
  setHeader,
  type H3Event,
} from 'h3';
import { scheduleBackgroundTask } from '@/server/utils/backgroundTask';
import { createLogger } from '@/server/utils/logger';
import { getPrecomputedStore, type CatalogKvReader } from '@/server/utils/precomputedTarkov';
import { validateGameMode } from '@/server/utils/tarkov-cache-config';
import { CATALOG_LANGUAGES, CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
import type { CatalogDataset, CatalogRelease } from '@/utils/catalogDatasets';
function catalogLanguage(input: unknown) {
  const lang = typeof input === 'string' ? input.toLowerCase() : 'en';
  return CATALOG_LANGUAGES.includes(lang) ? lang : 'en';
}
const logger = createLogger('CatalogSnapshot');
type EdgeStorage = Pick<Cache, 'match' | 'put'>;
function responseFromStored(value: Response, status: 'PRECOMPUTE' | 'STALE') {
  const headers = new Headers(value.headers);
  headers.delete('X-Catalog-Key');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  headers.set('X-Cache-Status', status);
  headers.set('Content-Type', 'application/json');
  return new Response(value.body?.pipeThrough(new DecompressionStream('gzip')), { headers });
}
async function readCatalogSnapshot(store: CatalogKvReader, scope: string, cached?: Response) {
  const manifest = (await store.get(CATALOG_MANIFEST_KEY, 'json')) as CatalogRelease | null;
  const entry = manifest?.entries?.[scope];
  if (!entry || !entry.key.startsWith(`neutral-catalog-v1/${scope}/`)) {
    throw new Error('Missing catalog manifest entry');
  }
  if (
    cached?.headers.get('X-Catalog-Key') === entry.key &&
    cached.headers.get('X-Catalog-Release') === String(manifest!.completedAt)
  )
    return cached;
  const body = await store.get(entry.key, 'stream');
  if (!(body instanceof ReadableStream)) throw new Error('Missing catalog body');
  const seconds = Math.max(
    0,
    Math.floor((manifest!.completedAt + 7 * 86400_000 - Date.now()) / 1000)
  );
  return new Response(body, {
    headers: {
      ...entry.headers,
      'Cache-Control': 'public, max-age=' + seconds,
      'X-Catalog-Key': entry.key,
      'X-Catalog-Release': String(manifest!.completedAt),
    },
  });
}
async function serveSnapshot(event: H3Event, store: CatalogKvReader | null, scope: string) {
  const cache = (globalThis.caches as (CacheStorage & { default?: EdgeStorage }) | undefined)
    ?.default;
  const key = new URL('/__neutral-catalog-v1/' + scope, getRequestURL(event).origin).href;
  const cached = await cache?.match(key).catch(() => undefined);
  try {
    if (!store) throw new Error('Missing catalog store');
    const value = await readCatalogSnapshot(store, scope, cached);
    if (cache && value !== cached) scheduleBackgroundTask(event, cache.put(key, value.clone()));
    return responseFromStored(value, 'PRECOMPUTE');
  } catch (error) {
    logger.warn('Unable to read catalog snapshot', { scope, error });
    if (cached) return responseFromStored(cached, 'STALE');
    throw createError({ statusCode: 503, statusMessage: 'Catalog snapshot unavailable' });
  }
}
export function catalogHandler(dataset: CatalogDataset | 'strings') {
  return defineEventHandler(async (event) => {
    const query = getQuery(event);
    const lang = catalogLanguage(query.lang);
    const mode = validateGameMode(query.gameMode);
    const scope = dataset === 'strings' ? `strings/${lang}` : `${dataset}/${mode}`;
    setHeader(event, 'Cache-Control', 'no-store');
    const store = getPrecomputedStore(event);
    if (import.meta.dev && !store) {
      const { devCatalog } = await import('@/server/utils/devCatalog');
      return devCatalog(dataset, mode, lang);
    }
    return serveSnapshot(event, store, scope);
  });
}
