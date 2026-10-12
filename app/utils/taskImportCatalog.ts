import type { Task } from '@/types/tarkov';
// Match the existing bounded seven-day precompute retention.
export const TASK_IMPORT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
type ImportObjectiveShape = { id: string; count?: number | null };
type ImportTaskShape = {
  id: string;
  objectives: ImportObjectiveShape[];
  failConditions: ImportObjectiveShape[];
};
/** The runtime guard promises progress-critical fields only, not a general Task schema. */
export interface TaskImportCatalogShape {
  data: { tasks: ImportTaskShape[] };
  dataOverlay: { version: string; sha256: string; [key: string]: unknown };
  catalog: { lang: 'en'; gameMode: string };
}
/** Expected server projection, produced by the existing adapters and validated overlay pipeline. */
export type TaskImportCatalogPayload = Omit<TaskImportCatalogShape, 'data'> & {
  data: { tasks: Task[] };
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const nonempty = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;
const uniqueIds = (rows: unknown[]): boolean =>
  new Set(rows.map((row) => record(row).id)).size === rows.length;
const validCount = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validObjectiveCount = (objective: Record<string, unknown>): boolean => {
  if (objective.count === undefined) return true;
  // Upstream taskStatus objectives are boolean conditions and legitimately carry null counts.
  if (objective.count === null) return objective.type === 'taskStatus';
  return validCount(objective.count);
};
const validObjective = (value: unknown): boolean => {
  const objective = record(value);
  return nonempty(objective.id) && validObjectiveCount(objective);
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
const validSourceTask = (value: unknown): boolean => {
  const task = record(value);
  const validRequired = nonempty(task.id) && validObjectives(task.objectives);
  return (
    validRequired && (task.failConditions === undefined || validObjectives(task.failConditions))
  );
};
/** Validate before lossy adapters can turn malformed or missing source data into empty arrays. */
export function assertTaskImportSource(value: unknown): void {
  const registry = record(value).tasks;
  const tasks = Array.isArray(registry) ? registry : Object.values(record(registry));
  const valid = tasks.length > 0 && tasks.every(validSourceTask) && uniqueIds(tasks);
  if (!valid) throw new Error('Invalid raw task import source; retaining previous snapshot');
}
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
): value is TaskImportCatalogShape {
  const catalog = record(value);
  return (
    validTasks(record(catalog.data).tasks) &&
    validOverlay(catalog.dataOverlay) &&
    validScope(catalog.catalog, gameMode)
  );
}
