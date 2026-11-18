import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { buildOverlayResponseHeaders } from '@/server/utils/overlayResponseHeaders';
import { precomputedOverlayIdentity } from '@/server/utils/precomputedTarkov';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { CATALOG_DATASETS, CATALOG_LANGUAGES, CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
import { collectGameDataStrings } from '@/utils/gameDataStrings';
import { PRECOMPUTED_TTL_SECONDS } from './precompute';
import type { CatalogStore } from './kv';
import type { ValidGameMode } from '@/server/utils/tarkov-cache-config';
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
async function stage(kv: CatalogStore, scope: string, payload: Payload) {
  const body = JSON.stringify(payload);
  const bytes = Buffer.byteLength(body);
  const digest = createHash('sha256').update(body).digest('hex');
  const key = `neutral-catalog-v1/${scope}/${digest}`;
  const compressed = gzipSync(body);
  if (compressed.byteLength > 25 * 1024 * 1024)
    throw new Error(`Compressed catalog exceeds KV limit for ${scope}`);
  await kv.put(key, compressed, { expirationTtl: PRECOMPUTED_TTL_SECONDS });
  if (!compressed.equals(Buffer.from(await kv.read(key))))
    throw new Error(`KV readback differs for ${scope}`);
  return { key, bytes, headers: buildOverlayResponseHeaders(payload.dataOverlay) };
}
export async function publishCatalogRelease(
  kv: CatalogStore,
  builders: Builders,
  overlaySha: string
) {
  const references = new Set<string>();
  const entries: CatalogRelease['entries'] = {};
  for (const mode of VALID_GAME_MODES) {
    for (const dataset of CATALOG_DATASETS) {
      const payload = await builders.buildNeutralCatalog(dataset, mode);
      checkCatalog(dataset, payload, overlaySha);
      collectGameDataStrings(payload.data, references);
      const scope = `${dataset}/${mode}`;
      entries[scope] = await stage(kv, scope, payload);
    }
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
  await kv.put(CATALOG_MANIFEST_KEY, pointer, {
    expirationTtl: PRECOMPUTED_TTL_SECONDS,
  });
  if (new TextDecoder().decode(await kv.read(CATALOG_MANIFEST_KEY)) !== pointer)
    throw new Error('Active catalog manifest did not match the completed release on readback');
  return manifest;
}
