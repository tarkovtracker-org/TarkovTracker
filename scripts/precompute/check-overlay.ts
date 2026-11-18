import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchOverlay } from '@/server/utils/overlay';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import {
  CATALOG_SCOPES,
  catalogManifestProblems,
  parseCatalogJson,
  verifyCatalogResponse,
} from './verify-catalog-release';
import { compareImportCatalog } from './verify-overlay';
import type { CatalogHttpEvidence, CatalogVerificationRow } from './verify-catalog-release';
import type { CatalogRelease } from '@/utils/catalogDatasets';
// Reusable Access credentials travel only to the explicitly configured operations origin.
const origin = process.env.TARKOV_OPERATIONS_ORIGIN || 'https://tarkovtracker.org';
const operationsUrl = new URL(origin);
if (operationsUrl.protocol !== 'https:' || operationsUrl.origin !== origin)
  throw new Error('TARKOV_OPERATIONS_ORIGIN must be an HTTPS origin without a path.');
const operationsId = process.env.TARKOV_OPERATIONS_CLIENT_ID;
const operationsSecret = process.env.TARKOV_OPERATIONS_CLIENT_SECRET;
if (Boolean(operationsId) !== Boolean(operationsSecret))
  throw new Error('Both operations Access credentials are required.');
if (operationsId && !process.env.TARKOV_OPERATIONS_ORIGIN)
  throw new Error('TARKOV_OPERATIONS_ORIGIN is required when operations credentials are set.');
const operationsHeaders: Record<string, string> =
  operationsId && operationsSecret
    ? { 'CF-Access-Client-Id': operationsId, 'CF-Access-Client-Secret': operationsSecret }
    : {};
async function readResponse(path: string): Promise<CatalogHttpEvidence> {
  const response = await fetch(`${origin}${path}`, {
    headers: { ...operationsHeaders, 'User-Agent': 'TarkovTracker-overlay-verification/2.0' },
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
  return { body: new Uint8Array(await response.arrayBuffer()), headers: response.headers };
}
const readManifest = async () =>
  parseCatalogJson((await readResponse('/api/tarkov/overlay-status')).body);
const problem = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
async function checkScope(
  scope: string,
  published: unknown,
  manifest: CatalogRelease
): Promise<CatalogVerificationRow> {
  const [dataset, value] = scope.split('/');
  const query = dataset === 'strings' ? `lang=${value}` : `gameMode=${value}`;
  try {
    return verifyCatalogResponse(
      scope,
      published,
      manifest,
      await readResponse(`/api/tarkov/${dataset}?${query}`)
    );
  } catch (error) {
    return { scope, status: 'unverified', problems: [problem(error)] };
  }
}
function importHeadersCurrent(headers: Headers, published: unknown): boolean {
  const meta = (published ?? {}) as { sha256?: string; version?: string };
  const expected = {
    'X-Cache-Status': 'PRECOMPUTE',
    'Cache-Control': 'no-store',
    'X-Overlay-Sha256': meta.sha256,
    'X-Overlay-Version': meta.version,
  };
  return Object.entries(expected).every(
    ([name, value]) => typeof value === 'string' && headers.get(name) === value
  );
}
async function checkImport(gameMode: string, published: unknown) {
  try {
    const evidence = await readResponse(`/api/tarkov/tasks-import?gameMode=${gameMode}`);
    const comparison = compareImportCatalog(gameMode, published, parseCatalogJson(evidence.body));
    const healthyHeaders = importHeadersCurrent(evidence.headers, published);
    return {
      ...comparison,
      status: healthyHeaders ? comparison.status : 'unverified',
      problems: healthyHeaders ? [] : ['Import response headers differ from published overlay'],
    };
  } catch (error) {
    return { ...compareImportCatalog(gameMode, published, undefined), problems: [problem(error)] };
  }
}
async function inspectRelease(published: unknown) {
  let manifest: unknown;
  let manifestProblems: string[];
  try {
    manifest = await readManifest();
    manifestProblems = catalogManifestProblems(
      published,
      manifest,
      process.env.EXPECTED_OVERLAY_SHA
    );
  } catch (error) {
    manifestProblems = [problem(error)];
  }
  const rows: CatalogVerificationRow[] = [];
  for (const scope of CATALOG_SCOPES) {
    rows.push(
      manifestProblems.length
        ? { scope, status: 'unverified', problems: ['Complete release manifest is unverified'] }
        : await checkScope(scope, published, manifest as CatalogRelease)
    );
  }
  const imports = await Promise.all(VALID_GAME_MODES.map((mode) => checkImport(mode, published)));
  return { manifest, manifestProblems, rows, imports };
}
let published: unknown;
try {
  const result = await fetchOverlay(true);
  if (result.meta.status !== 'fresh') throw new Error('Published overlay refresh is unverified');
  if (result.meta.unconsumedSections?.length)
    throw new Error('Published overlay has unconsumed sections');
  published = result.overlay?.$meta;
} catch (error) {
  console.error(problem(error));
}
let result = await inspectRelease(published);
let attempts = 1;
try {
  if (JSON.stringify(await readManifest()) !== JSON.stringify(result.manifest)) {
    result = await inspectRelease(published);
    attempts = 2;
    if (JSON.stringify(await readManifest()) !== JSON.stringify(result.manifest))
      result.manifestProblems.push('Catalog release changed again during verification');
  }
} catch (error) {
  result.manifestProblems.push(problem(error));
}
const { rows, imports, manifestProblems } = result;
const manifest = result.manifest as CatalogRelease | undefined;
const reportDirectory = await mkdtemp(join(tmpdir(), 'tarkov-overlay-fleet-'));
const output = join(reportDirectory, 'report.json');
await writeFile(
  output,
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      origin,
      attempts,
      release: { completedAt: manifest?.completedAt, overlaySha: manifest?.overlaySha },
      manifestProblems,
      rows,
      imports,
    },
    null,
    2
  ),
  { mode: 0o600, flag: 'wx' }
);
console.log(
  JSON.stringify({
    output,
    attempts,
    total: rows.length,
    current: rows.filter((row) => row.status === 'current').length,
    unverified: rows.filter((row) => row.status !== 'current').length,
    manifestProblems,
    importMismatches: imports.filter((row) => row.status === 'mismatch').length,
    importUnverified: imports.filter((row) => row.status === 'unverified').length,
  })
);
if (
  manifestProblems.length ||
  rows.some((row) => row.status !== 'current') ||
  imports.some((row) => row.status !== 'current')
)
  process.exitCode = 1;
