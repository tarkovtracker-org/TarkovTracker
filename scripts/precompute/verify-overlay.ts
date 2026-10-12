import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
// 12h schedule plus a 2h operational allowance; browser retention is separate.
export const OVERLAY_PROPAGATION_WINDOW_MS = 14 * 60 * 60 * 1000;
type Identity = { version?: string; sha256?: string };
export type OverlayManifest = {
  completedAt: number;
  entries: Array<{ lang: string; gameMode: string; overlay: Identity }>;
};
export type ServedOverlay = {
  lang: string;
  gameMode: string;
  overlay: Identity;
  source?: string | null;
};
export type DriftRow = {
  lang: string;
  gameMode: string;
  published?: string;
  precomputed?: string;
  served?: string;
  source?: string | null;
  status: 'current' | 'propagating' | 'drift' | 'unverified';
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const nonempty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;
const identity = (value: unknown): Identity => {
  const meta = record(value);
  return { version: nonempty(meta.version), sha256: nonempty(meta.sha256) };
};
const manifestEntries = (manifest: unknown): Array<Record<string, unknown>> => {
  const entries = record(manifest).entries;
  return Array.isArray(entries) ? entries.map(record) : [];
};
const verifiableSource = (source: string | null | undefined, age: number): boolean =>
  Number.isFinite(age) && age >= 0 && source === 'PRECOMPUTE';
const manifestIdentity = (
  entries: Array<Record<string, unknown>>,
  lang: string,
  gameMode: string
): Identity => {
  const matches = entries.filter((entry) => entry.lang === lang && entry.gameMode === gameMode);
  return identity(matches.length === 1 ? matches[0]!.overlay : undefined);
};
const completeProvenance = (
  identities: Identity[],
  source: string | null | undefined,
  age: number
): boolean =>
  verifiableSource(source, age) && identities.every((meta) => meta.version && meta.sha256);
const rowStatus = (
  published: Identity,
  precomputed: Identity,
  served: Identity,
  source: string | null | undefined,
  age: number
): DriftRow['status'] => {
  if (!completeProvenance([published, precomputed, served], source, age)) return 'unverified';
  if (
    [precomputed, served].every(
      (meta) => meta.sha256 === published.sha256 && meta.version === published.version
    )
  )
    return 'current';
  return age <= OVERLAY_PROPAGATION_WINDOW_MS ? 'propagating' : 'drift';
};
export function compareOverlayFleet(
  published: unknown,
  manifest: unknown,
  served: ServedOverlay[],
  now = Date.now()
): DriftRow[] {
  const publishedIdentity = identity(published);
  const generated = nonempty(record(published).generated);
  const age = now - Date.parse(generated ?? '');
  const entries = manifestEntries(manifest);
  return API_SUPPORTED_LANGUAGES.flatMap((lang) =>
    VALID_GAME_MODES.map((gameMode) => {
      const precomputed = manifestIdentity(entries, lang, gameMode);
      const response: ServedOverlay = served.find(
        (entry) => entry.lang === lang && entry.gameMode === gameMode
      ) ?? { lang, gameMode, overlay: {} };
      const current = identity(response.overlay);
      return {
        lang,
        gameMode,
        published: publishedIdentity.sha256,
        precomputed: precomputed.sha256,
        served: current.sha256,
        source: response.source,
        status: rowStatus(publishedIdentity, precomputed, current, response.source, age),
      };
    })
  );
}
export type CatalogComparison = {
  lang: string;
  gameMode: string;
  coreCount: number;
  objectiveCount: number;
  missingTaskIds: string[];
  overlayIdentityMatches: boolean;
  status: 'current' | 'mismatch' | 'unverified';
};
type CatalogTask = { id: string; objectives?: unknown[] };
const isCatalogTask = (value: unknown, withObjectives: boolean): boolean => {
  const task = record(value);
  return Boolean(nonempty(task.id)) && (!withObjectives || Array.isArray(task.objectives));
};
const catalogTasks = (payload: unknown, withObjectives: boolean): CatalogTask[] | null => {
  const tasks = record(record(payload).data).tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  return tasks.every((task) => isCatalogTask(task, withObjectives))
    ? (tasks as CatalogTask[])
    : null;
};
const identified = (meta: Identity): boolean => Boolean(meta.version && meta.sha256);
const comparisonStatus = (valid: boolean, matching: boolean): CatalogComparison['status'] => {
  if (!valid) return 'unverified';
  return matching ? 'current' : 'mismatch';
};
/** Verifies the split catalog contract without publishing either source payload in the report. */
export function compareTaskCatalogs(
  lang: string,
  gameMode: string,
  core: unknown,
  objectives: unknown
): CatalogComparison {
  const coreTasks = catalogTasks(core, false);
  const objectiveTasks = catalogTasks(objectives, true);
  const coreIdentity = identity(record(core).dataOverlay);
  const objectiveIdentity = identity(record(objectives).dataOverlay);
  const objectiveIds = new Set(objectiveTasks?.map((task) => task.id));
  const missingTaskIds =
    coreTasks?.map((task) => task.id).filter((id) => !objectiveIds.has(id)) ?? [];
  const valid =
    Boolean(coreTasks && objectiveTasks) && [coreIdentity, objectiveIdentity].every(identified);
  const sameIdentity = (['version', 'sha256'] as const).every(
    (key) => coreIdentity[key] === objectiveIdentity[key]
  );
  return {
    lang,
    gameMode,
    coreCount: coreTasks?.length ?? 0,
    objectiveCount: objectiveTasks?.length ?? 0,
    missingTaskIds,
    // A global overlay SHA can change for unrelated sections while these separately cached
    // task snapshots remain complete. Report that difference without declaring an import outage.
    overlayIdentityMatches: [coreIdentity, objectiveIdentity].every(identified) && sameIdentity,
    status: comparisonStatus(valid, missingTaskIds.length === 0),
  };
}
