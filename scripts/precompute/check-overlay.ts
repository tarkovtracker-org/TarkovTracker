import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchOverlay } from '@/server/utils/overlay';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import { TASK_OBJECTIVES_CACHE_VERSION } from '@/utils/taskCatalogCache';
import {
  compareOverlayFleet,
  readTaskCatalogPair,
  compareImportCatalog,
  type ImportCatalogComparison,
  type OverlayManifest,
  type CatalogComparison,
} from './verify-overlay';
// This command verifies the production fleet and writes a private, unique report.
const productionOrigin = process.env.TARKOV_OPERATIONS_ORIGIN || 'https://tarkovtracker.org';
const operationsUrl = new URL(productionOrigin);
if (operationsUrl.protocol !== 'https:' || operationsUrl.origin !== productionOrigin) {
  throw new Error('TARKOV_OPERATIONS_ORIGIN must be an HTTPS origin without a path.');
}
const operationsId = process.env.TARKOV_OPERATIONS_CLIENT_ID;
const operationsSecret = process.env.TARKOV_OPERATIONS_CLIENT_SECRET;
if (Boolean(operationsId) !== Boolean(operationsSecret)) {
  throw new Error('Both operations Access credentials are required.');
}
// Reusable Access credentials only ever travel to an explicitly configured operations host.
if (operationsId && !process.env.TARKOV_OPERATIONS_ORIGIN) {
  throw new Error('TARKOV_OPERATIONS_ORIGIN is required when operations credentials are set.');
}
const operationsHeaders: Record<string, string> =
  operationsId && operationsSecret
    ? { 'CF-Access-Client-Id': operationsId, 'CF-Access-Client-Secret': operationsSecret }
    : {};
const getJson = async (url: string) => {
  const response = await fetch(url, {
    headers: { ...operationsHeaders, 'User-Agent': 'TarkovTracker-overlay-verification/1.0' },
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { payload: await response.json(), source: response.headers.get('X-Cache-Status') };
};
let published: unknown;
try {
  published = (await fetchOverlay(true)).overlay?.$meta;
} catch (error) {
  console.error(String(error));
}
let manifest: OverlayManifest | null = null;
try {
  manifest = (await getJson(`${productionOrigin}/api/tarkov/overlay-status`)).payload;
} catch (error) {
  console.error(String(error));
}
const served = [];
const catalogs: CatalogComparison[] = [];
for (const lang of API_SUPPORTED_LANGUAGES)
  for (const gameMode of VALID_GAME_MODES) {
    const pair = await readTaskCatalogPair(
      lang,
      gameMode,
      getJson(`${productionOrigin}/api/tarkov/tasks-core?lang=${lang}&gameMode=${gameMode}`),
      getJson(
        `${productionOrigin}/api/tarkov/tasks-objectives?lang=${lang}&gameMode=${gameMode}&version=${TASK_OBJECTIVES_CACHE_VERSION}`
      )
    );
    if (pair.served) served.push(pair.served);
    catalogs.push(pair.catalog);
    pair.errors.forEach((error) => console.error(error));
  }
const rows = compareOverlayFleet(published, manifest, served);
const imports: ImportCatalogComparison[] = [];
for (const gameMode of VALID_GAME_MODES) {
  let payload: unknown;
  try {
    payload = (await getJson(`${productionOrigin}/api/tarkov/tasks-import?gameMode=${gameMode}`))
      .payload;
  } catch (error) {
    console.error(String(error));
  }
  imports.push(compareImportCatalog(gameMode, published, payload));
}
const reportDirectory = await mkdtemp(join(tmpdir(), 'tarkov-overlay-fleet-'));
const output = join(reportDirectory, 'report.json');
await writeFile(
  output,
  JSON.stringify({ checkedAt: new Date().toISOString(), rows, catalogs, imports }, null, 2),
  {
    mode: 0o600,
    flag: 'wx',
  }
);
console.log(
  JSON.stringify({
    output,
    total: rows.length,
    current: rows.filter((row) => row.status === 'current').length,
    propagating: rows.filter((row) => row.status === 'propagating').length,
    drift: rows.filter((row) => row.status === 'drift').length,
    unverified: rows.filter((row) => row.status === 'unverified').length,
    catalogMismatches: catalogs.filter((row) => row.status !== 'covered').length,
    catalogIdentityDifferences: catalogs.filter((row) => !row.overlayIdentityMatches).length,
    importMismatches: imports.filter((row) => row.status !== 'current').length,
  })
);
if (
  rows.some((row) => row.status === 'drift' || row.status === 'unverified') ||
  catalogs.some((row) => row.status !== 'covered') ||
  imports.some((row) => row.status !== 'current')
)
  process.exitCode = 1;
