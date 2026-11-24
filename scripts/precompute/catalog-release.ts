import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import { buildOverlayResponseHeaders } from '@/server/utils/overlayResponseHeaders';
import { precomputedOverlayIdentity } from '@/server/utils/precomputedTarkov';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import {
  catalogByteLimit,
  CATALOG_DATASETS,
  CATALOG_LANGUAGES,
  CATALOG_MANIFEST_KEY,
} from '@/utils/catalogDatasets';
import { collectGameDataStrings } from '@/utils/gameDataStrings';
import { normalizeTaskObjectives } from '@/utils/taskNormalization';
import { KvReadNotFound } from './kv';
import { PRECOMPUTED_TTL_SECONDS } from './precompute';
import type { CatalogStore } from './kv';
import type { ValidGameMode } from '@/server/utils/tarkov-cache-config';
import type { TarkovTaskObjectivesQueryResult } from '@/types/tarkov';
import type { CatalogDataset, CatalogRelease } from '@/utils/catalogDatasets';
type Payload = { data: unknown; dataOverlay?: unknown };
type Builders = {
  buildNeutralCatalog: (dataset: CatalogDataset, mode: ValidGameMode) => Promise<Payload>;
  buildCatalogStrings: (lang: string, referenced: Set<string>) => Promise<Payload>;
};
function checkCatalog(dataset: CatalogDataset, payload: Payload, sha: string) {
  if (dataset === 'bootstrap' || dataset === 'map-spawns') return;
  if (precomputedOverlayIdentity(payload)?.sha256 !== sha)
    throw new Error(`Unexpected overlay in ${dataset}`);
}
async function readbackMatches(kv: CatalogStore, key: string, expected: Buffer) {
  // A previously cached value or miss can outlive a successful KV write by 60 seconds.
  for (const waitMs of [0, 5000, 15000, 45000]) {
    if (waitMs) await delay(waitMs);
    try {
      if (expected.equals(Buffer.from(await kv.read(key)))) return true;
    } catch (error) {
      if (!(error instanceof KvReadNotFound)) throw error;
    }
  }
  return false;
}
async function stage(kv: CatalogStore, scope: string, payload: Payload) {
  const body = JSON.stringify(payload);
  const bytes = Buffer.byteLength(body);
  if (bytes > catalogByteLimit(scope))
    throw new Error(`Uncompressed catalog exceeds limit for ${scope}`);
  const digest = createHash('sha256').update(body).digest('hex');
  const key = `neutral-catalog-v1/${scope}/${digest}`;
  const compressed = gzipSync(body);
  if (compressed.byteLength > 25 * 1024 * 1024)
    throw new Error(`Compressed catalog exceeds KV limit for ${scope}`);
  await kv.put(key, compressed, { expirationTtl: PRECOMPUTED_TTL_SECONDS });
  if (!(await readbackMatches(kv, key, compressed)))
    throw new Error(`KV readback differs for ${scope}`);
  return { key, bytes, headers: buildOverlayResponseHeaders(payload.dataOverlay) };
}
async function stageModeCatalogs(
  kv: CatalogStore,
  builders: Builders,
  mode: ValidGameMode,
  overlaySha: string,
  target: { entries: CatalogRelease['entries']; references: Set<string> }
) {
  for (const dataset of CATALOG_DATASETS) {
    const payload = await builders.buildNeutralCatalog(dataset, mode);
    checkCatalog(dataset, payload, overlaySha);
    collectGameDataStrings(payload.data, target.references);
    const scope = `${dataset}/${mode}`;
    target.entries[scope] = await stage(kv, scope, payload);
    if (dataset === 'tasks-objectives') {
      const { tasks } = payload.data as TarkovTaskObjectivesQueryResult;
      // Keep ordering and duplicate IDs for the same comparison rules as the full catalog.
      const counts = tasks.map(({ id, objectives }) => ({
        id,
        objectives: normalizeTaskObjectives<{ id: string; count?: number }>(objectives).map(
          ({ id, count }) => ({ id, count })
        ),
      }));
      const countsScope = scope + '/counts';
      target.entries[countsScope] = await stage(kv, countsScope, {
        data: { tasks: counts },
        dataOverlay: payload.dataOverlay,
      });
    }
  }
}
export async function publishCatalogRelease(
  kv: CatalogStore,
  builders: Builders,
  overlaySha: string
) {
  const startedAt = Date.now();
  const references = new Set<string>();
  const entries: CatalogRelease['entries'] = {};
  for (const mode of VALID_GAME_MODES) {
    await stageModeCatalogs(kv, builders, mode, overlaySha, { entries, references });
  }
  if (!references.size) throw new Error('Neutral catalogs contain no translation keys');
  for (const lang of CATALOG_LANGUAGES) {
    const payload = await builders.buildCatalogStrings(lang, references);
    if (precomputedOverlayIdentity(payload)?.sha256 !== overlaySha)
      throw new Error(`Unexpected overlay in strings/${lang}`);
    const strings = (payload.data as { strings: Record<string, string> }).strings;
    for (const ref of references) {
      if (typeof strings?.[ref] !== 'string')
        throw new Error(`Missing translation for ${lang}: ${ref}`);
    }
    const scope = `strings/${lang}`;
    entries[scope] = await stage(kv, scope, payload);
  }
  const manifest: CatalogRelease = { completedAt: Date.now(), overlaySha, entries };
  // Readers discover this release only after every referenced immutable object is stored.
  const pointer = JSON.stringify(manifest);
  // Expire the pointer before the earliest object even when staging takes several minutes.
  const remainingTtl = PRECOMPUTED_TTL_SECONDS - Math.ceil((Date.now() - startedAt) / 1000) - 60;
  if (remainingTtl < 60) throw new Error('Catalog objects expired during publication');
  await kv.put(CATALOG_MANIFEST_KEY, pointer, { expirationTtl: remainingTtl });
  try {
    if (!(await readbackMatches(kv, CATALOG_MANIFEST_KEY, Buffer.from(pointer))))
      throw new Error('active manifest bytes differ');
  } catch (error) {
    throw new Error(
      `Catalog pointer was already written but could not be confirmed: ${String(error)}`,
      { cause: error }
    );
  }
  return manifest;
}
/** Include failed neutral publication alongside legacy/import diagnostics in the workflow artifact. */
export async function catalogReleaseReport(
  kv: CatalogStore,
  builders: Builders,
  overlaySha: string
) {
  try {
    return {
      catalogRelease: await publishCatalogRelease(kv, builders, overlaySha),
      catalogReleaseError: undefined,
    };
  } catch (error) {
    return {
      catalogRelease: undefined,
      catalogReleaseError: error instanceof Error ? error.message : String(error),
    };
  }
}
