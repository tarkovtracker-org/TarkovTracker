import { isTaskImportCatalog } from '@/utils/taskImportCatalog';
// 12h schedule plus a 2h operational allowance for verifying a neutral release.
export const OVERLAY_PROPAGATION_WINDOW_MS = 14 * 60 * 60 * 1000;
type Identity = { version?: string; sha256?: string };
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
export type ImportCatalogComparison = {
  gameMode: string;
  taskCount: number;
  sha256?: string;
  status: 'current' | 'mismatch' | 'unverified';
};
const identified = (meta: Identity): boolean => Boolean(meta.version && meta.sha256);
/** Release verification is stricter than runtime retention of a whole last-good import snapshot. */
export function compareImportCatalog(
  gameMode: string,
  published: unknown,
  payload: unknown
): ImportCatalogComparison {
  const expected = identity(published);
  if (!identified(expected) || !isTaskImportCatalog(payload, gameMode))
    return { gameMode, taskCount: 0, status: 'unverified' };
  const matching = (['version', 'sha256'] as const).every(
    (key) => payload.dataOverlay[key] === expected[key]
  );
  return {
    gameMode,
    taskCount: payload.data.tasks.length,
    sha256: payload.dataOverlay.sha256,
    status: matching ? 'current' : 'mismatch',
  };
}
