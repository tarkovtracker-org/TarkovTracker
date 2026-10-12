import type { Task } from '@/types/tarkov';
// Match the existing bounded seven-day precompute retention.
export const TASK_IMPORT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export interface TaskImportCatalogPayload {
  data: { tasks: Task[] };
  dataOverlay: { version: string; sha256: string; [key: string]: unknown };
  catalog: { lang: 'en'; gameMode: string };
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const nonempty = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;
const uniqueIds = (rows: unknown[]): boolean =>
  new Set(rows.map((row) => record(row).id)).size === rows.length;
const validCount = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validObjective = (value: unknown): boolean => {
  const objective = record(value);
  return nonempty(objective.id) && (objective.count === undefined || validCount(objective.count));
};
const validObjectives = (value: unknown): boolean =>
  Array.isArray(value) && value.every(validObjective) && uniqueIds(value);
const validTask = (value: unknown): boolean => {
  const task = record(value);
  return (
    nonempty(task.id) &&
    ['objectives', 'failConditions'].every((field) => validObjectives(task[field]))
  );
};
const validTaskList = (tasks: unknown[]): boolean =>
  tasks.length > 0 && tasks.every(validTask) && uniqueIds(tasks);
const validTasks = (value: unknown): boolean => Array.isArray(value) && validTaskList(value);
const noUnconsumedSections = (value: unknown): boolean =>
  value === undefined || (Array.isArray(value) && value.length === 0);
const validOverlay = (value: unknown): boolean => {
  const overlay = record(value);
  const hasIdentity = [overlay.version, overlay.sha256].every(nonempty);
  return (
    hasIdentity && overlay.status !== 'missing' && noUnconsumedSections(overlay.unconsumedSections)
  );
};
const validScope = (value: unknown, gameMode: string): boolean => {
  const scope = record(value);
  return scope.lang === 'en' && scope.gameMode === gameMode;
};
/** Validates a whole import snapshot; no independent catalogs are joined here. */
export function isTaskImportCatalog(
  value: unknown,
  gameMode: string
): value is TaskImportCatalogPayload {
  const catalog = record(value);
  return (
    validTasks(record(catalog.data).tasks) &&
    validOverlay(catalog.dataOverlay) &&
    validScope(catalog.catalog, gameMode)
  );
}
