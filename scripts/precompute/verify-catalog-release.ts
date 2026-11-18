import { createHash } from 'node:crypto';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { CATALOG_DATASETS, CATALOG_LANGUAGES } from '@/utils/catalogDatasets';
import { OVERLAY_PROPAGATION_WINDOW_MS } from './verify-overlay';
import type { CatalogRelease } from '@/utils/catalogDatasets';
export const CATALOG_SCOPES = [
  ...CATALOG_DATASETS.flatMap((dataset) => VALID_GAME_MODES.map((mode) => `${dataset}/${mode}`)),
  ...CATALOG_LANGUAGES.map((lang) => `strings/${lang}`),
];
export type CatalogVerificationRow = {
  scope: string;
  key?: string;
  sha256?: string;
  bytes?: number;
  status: 'current' | 'unverified';
  problems: string[];
};
export type CatalogHttpEvidence = { body: Uint8Array; headers: Headers };
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const sha = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const failed = (checks: Array<[boolean, string]>): string[] =>
  checks.filter(([valid]) => !valid).map(([, problem]) => problem);
const overlayScope = (scope: string): boolean =>
  !scope.startsWith('bootstrap/') && !scope.startsWith('map-spawns/');
const timestampCurrent = (value: unknown, now: number): boolean =>
  Number.isSafeInteger(value) &&
  Number(value) > 0 &&
  Number(value) <= now &&
  now - Number(value) <= OVERLAY_PROPAGATION_WINDOW_MS;
const validPublishedIdentity = (meta: Record<string, unknown>): boolean =>
  sha(meta.sha256) && nonempty(meta.version);
const validByteLength = (value: unknown): boolean =>
  Number.isSafeInteger(value) && Number(value) > 0;
const validHeaders = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const stringHeaders = (value: unknown): boolean =>
  validHeaders(value) && Object.values(record(value)).every((entry) => typeof entry === 'string');
const overlayHeaderMatches = (
  scope: string,
  headers: Record<string, unknown>,
  name: string,
  expected: unknown
): boolean => !overlayScope(scope) || headers[name] === expected;
function validImmutableKey(scope: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const prefix = `neutral-catalog-v1/${scope}/`;
  return value.startsWith(prefix) && sha(value.slice(prefix.length));
}
function entryProblems(
  scope: string,
  value: unknown,
  published: Record<string, unknown>
): string[] {
  const entry = record(value);
  const headers = record(entry.headers);
  return failed([
    [validImmutableKey(scope, entry.key), `Invalid immutable key for ${scope}`],
    [validByteLength(entry.bytes), `Invalid byte length for ${scope}`],
    [stringHeaders(entry.headers), `Invalid headers for ${scope}`],
    [
      overlayHeaderMatches(scope, headers, 'X-Overlay-Sha256', published.sha256),
      `Missing overlay SHA header for ${scope}`,
    ],
    [
      overlayHeaderMatches(scope, headers, 'X-Overlay-Version', published.version),
      `Invalid overlay version header for ${scope}`,
    ],
  ]);
}
/** Certification has no propagation grace. Every expected scope must belong to this release. */
export function catalogManifestProblems(
  published: unknown,
  value: unknown,
  expectedSha?: string,
  now = Date.now()
): string[] {
  const meta = record(published);
  const manifest = record(value);
  const entries = record(manifest.entries);
  const scopes = Object.keys(entries);
  const problems = failed([
    [validPublishedIdentity(meta), 'Published overlay identity unavailable'],
    [!expectedSha || expectedSha === meta.sha256, 'Published overlay differs from requested SHA'],
    [
      manifest.overlaySha === meta.sha256 && sha(manifest.overlaySha),
      'Manifest overlay differs from published overlay',
    ],
    [
      timestampCurrent(manifest.completedAt, now),
      'Manifest timestamp is stale, future, or invalid',
    ],
    [
      scopes.length === CATALOG_SCOPES.length &&
        CATALOG_SCOPES.every((scope) => scopes.includes(scope)),
      'Manifest does not contain the exact complete catalog scope set',
    ],
  ]);
  return [
    ...problems,
    ...CATALOG_SCOPES.flatMap((scope) => entryProblems(scope, entries[scope], meta)),
  ];
}
export function parseCatalogJson(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    throw new Error('Response contains invalid JSON or UTF-8');
  }
}
const responseHeaderProblems = (
  evidence: CatalogHttpEvidence,
  entry: CatalogRelease['entries'][string],
  completedAt: number
): string[] =>
  failed([
    [evidence.headers.get('X-Cache-Status') === 'PRECOMPUTE', 'Response is not precomputed'],
    [
      evidence.headers.get('X-Catalog-Release') === String(completedAt),
      'Response release timestamp differs',
    ],
    [evidence.headers.get('Cache-Control') === 'no-store', 'Response cache policy differs'],
    [
      evidence.headers.get('Content-Type')?.split(';')[0]?.trim() === 'application/json',
      'Response is not JSON',
    ],
    [
      Object.entries(entry.headers).every(([name, value]) => evidence.headers.get(name) === value),
      'Response overlay headers differ from manifest',
    ],
  ]);
function responseOverlayProblems(scope: string, published: unknown, payload: unknown): string[] {
  if (!overlayScope(scope)) return [];
  const expected = record(published);
  const overlay = record(record(payload).dataOverlay);
  return failed([
    [
      overlay.sha256 === expected.sha256 && overlay.version === expected.version,
      'Response overlay identity differs',
    ],
    [overlay.status !== 'missing', 'Response overlay is missing'],
  ]);
}
/** Hash the bytes received from the route, before parsing or reserializing the JSON. */
export function verifyCatalogResponse(
  scope: string,
  published: unknown,
  manifest: CatalogRelease,
  evidence: CatalogHttpEvidence
): CatalogVerificationRow {
  const entry = manifest.entries[scope];
  if (!entry) return { scope, status: 'unverified', problems: ['Manifest entry missing'] };
  const digest = createHash('sha256').update(evidence.body).digest('hex');
  const expectedDigest = entry.key.slice(entry.key.lastIndexOf('/') + 1);
  const payload = parseCatalogJson(evidence.body);
  const problems = [
    ...failed([
      [digest === expectedDigest, 'Response bytes differ from immutable key digest'],
      [evidence.body.byteLength === entry.bytes, 'Response byte length differs from manifest'],
      [Object.keys(record(record(payload).data)).length > 0, 'Response data is missing'],
    ]),
    ...responseHeaderProblems(evidence, entry, manifest.completedAt),
    ...responseOverlayProblems(scope, published, payload),
  ];
  return {
    scope,
    key: entry.key,
    sha256: digest,
    bytes: evidence.body.byteLength,
    status: problems.length ? 'unverified' : 'current',
    problems,
  };
}
