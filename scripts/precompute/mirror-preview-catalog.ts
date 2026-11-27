import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { buildTaskImportKey, isTaskImportSnapshot } from '@/server/utils/taskImportSnapshot';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { catalogByteLimit, CATALOG_MANIFEST_KEY } from '@/utils/catalogDatasets';
import { TASK_IMPORT_MAX_AGE_MS } from '@/utils/taskImportCatalog';
import { KvReadNotFound, readbackMatches, type CatalogStore } from './kv';
import { PRECOMPUTED_TTL_SECONDS } from './precompute';
import { catalogManifestProblems, parseCatalogJson } from './verify-catalog-release';
import type { CatalogRelease } from '@/utils/catalogDatasets';
type CatalogSource = Pick<CatalogStore, 'read'>;
async function readRelease(source: CatalogSource, expectedSha?: string) {
  const raw = Buffer.from(await source.read(CATALOG_MANIFEST_KEY));
  const manifest = parseCatalogJson(raw) as CatalogRelease | null;
  const headers = manifest?.entries?.['hideout/regular']?.headers;
  const identity = {
    sha256: manifest?.overlaySha,
    version: headers?.['X-Overlay-Version'],
    generated: headers?.['X-Overlay-Generated'],
  };
  const problems = catalogManifestProblems(identity, manifest, expectedSha);
  if (problems.length) throw new Error(problems.join('; '));
  return { raw, manifest: manifest! };
}
function remainingTtl(expiresAt: number): number {
  const seconds = Math.floor((expiresAt - Date.now()) / 1000);
  if (seconds < 60) throw new Error('Preview snapshot is too close to expiration');
  return seconds;
}
async function writeVerified(
  preview: CatalogStore,
  key: string,
  body: Buffer,
  expirationTtl: number
) {
  await preview.put(key, new Uint8Array(body), { expirationTtl });
  if (!(await readbackMatches(preview, key, body))) {
    throw new Error(`Preview KV readback differs for ${key}`);
  }
}
async function stageCatalog(
  source: CatalogSource,
  preview: CatalogStore,
  scope: string,
  entry: CatalogRelease['entries'][string]
) {
  const body = Buffer.from(await source.read(entry.key));
  const expanded = gunzipSync(body, { maxOutputLength: catalogByteLimit(scope) });
  const digest = createHash('sha256').update(expanded).digest('hex');
  if (expanded.byteLength !== entry.bytes || !entry.key.endsWith('/' + digest)) {
    throw new Error(`Production catalog bytes differ from the manifest for ${scope}`);
  }
  await writeVerified(preview, entry.key, body, PRECOMPUTED_TTL_SECONDS);
}
async function readImport(source: CatalogSource, mode: string, overlaySha: string) {
  const key = buildTaskImportKey(mode);
  const body = Buffer.from(await source.read(key));
  const snapshot = parseCatalogJson(body);
  if (!isTaskImportSnapshot(snapshot, mode) || snapshot.overlay?.sha256 !== overlaySha) {
    throw new Error(`Production import snapshot does not match the catalog release for ${mode}`);
  }
  return { key, body, expiresAt: snapshot.storedAt + TASK_IMPORT_MAX_AGE_MS };
}
async function currentPreviewTimestamp(preview: CatalogStore): Promise<number> {
  let body: ArrayBuffer;
  try {
    body = await preview.read(CATALOG_MANIFEST_KEY);
  } catch (error) {
    if (error instanceof KvReadNotFound) return 0;
    throw error;
  }
  try {
    const current = parseCatalogJson(new Uint8Array(body)) as Partial<CatalogRelease> | null;
    return Number.isSafeInteger(current?.completedAt) ? current!.completedAt! : 0;
  } catch {
    return 0;
  }
}
async function checkPreviewRevision(preview: CatalogStore, revision: number) {
  if ((await currentPreviewTimestamp(preview)) > revision) {
    throw new Error('The preview namespace already has a newer catalog release');
  }
}
/** Stage only public release objects and publish the manifest after every readback succeeds. */
export async function mirrorPreviewCatalog(
  source: CatalogSource,
  preview: CatalogStore,
  expectedSha?: string
) {
  const { raw, manifest } = await readRelease(source, expectedSha);
  await checkPreviewRevision(preview, manifest.completedAt);
  const imports = await Promise.all(
    VALID_GAME_MODES.map((mode) => readImport(source, mode, manifest.overlaySha))
  );
  for (const [scope, entry] of Object.entries(manifest.entries)) {
    await stageCatalog(source, preview, scope, entry);
  }
  for (const { key, body, expiresAt } of imports) {
    await writeVerified(preview, key, body, remainingTtl(expiresAt));
  }
  const current = Buffer.from(await source.read(CATALOG_MANIFEST_KEY));
  if (!raw.equals(current)) throw new Error('Production catalog changed during preview staging');
  await checkPreviewRevision(preview, manifest.completedAt);
  const expiresAt = Math.min(
    manifest.completedAt + PRECOMPUTED_TTL_SECONDS * 1000,
    ...imports.map((snapshot) => snapshot.expiresAt)
  );
  await writeVerified(preview, CATALOG_MANIFEST_KEY, raw, remainingTtl(expiresAt - 60_000));
  return {
    completedAt: manifest.completedAt,
    overlaySha: manifest.overlaySha,
    catalogObjects: Object.keys(manifest.entries).length,
    importSnapshots: imports.length,
  };
}
