import { buildCatalogStrings, buildNeutralCatalog } from '@/server/utils/neutralCatalog';
import { VALID_GAME_MODES, type ValidGameMode } from '@/server/utils/tarkov-cache-config';
import { CATALOG_DATASETS, type CatalogDataset } from '@/utils/catalogDatasets';
import { collectGameDataStrings } from '@/utils/gameDataStrings';
let referenceInventory: Promise<Set<string>> | undefined;
async function collectPublishedReferences() {
  const refs = new Set<string>();
  for (const source of VALID_GAME_MODES)
    for (const name of CATALOG_DATASETS)
      collectGameDataStrings((await buildNeutralCatalog(name, source)).data, refs);
  return refs;
}
/** Nuxt development servers have no production KV binding. */
export async function devCatalog(
  dataset: CatalogDataset | 'strings',
  mode: ValidGameMode,
  lang: string
) {
  if (dataset !== 'strings') return buildNeutralCatalog(dataset, mode);
  referenceInventory ??= collectPublishedReferences().catch((error) => {
    referenceInventory = undefined;
    throw error;
  });
  return buildCatalogStrings(lang, await referenceInventory);
}
