/**
 * Persisted API task-update list rules shared by the app, server routes, and api-gateway Worker.
 * The database sanitizer `public.sanitize_user_progress_api_update_meta` applies the same cap and
 * count rules; keep both in sync so client syncs and API writes store identical entries.
 *
 * Runtime-independent: must not import Nuxt, Vue, or Worker modules.
 */
const API_TASK_UPDATE_STATES = ['active', 'completed', 'failed', 'uncompleted'] as const;
export type ApiTaskUpdateState = (typeof API_TASK_UPDATE_STATES)[number];
export interface ApiTaskUpdateEntry {
  id: string;
  state: ApiTaskUpdateState;
}
export const API_UPDATE_TASK_LIMIT = 20;
const API_UPDATE_TASK_COUNT_MAX = 1_000_000;
export const isApiTaskUpdateEntry = (value: unknown): value is ApiTaskUpdateEntry => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { id, state } = value as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    id !== '' &&
    API_TASK_UPDATE_STATES.includes(state as ApiTaskUpdateState)
  );
};
const sanitizeTaskCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(API_UPDATE_TASK_COUNT_MAX, Math.max(0, Math.trunc(value)))
    : 0;
/**
 * Keep the first `API_UPDATE_TASK_LIMIT` valid updates in input order. `taskCount` records the
 * pre-truncation total only when more updates exist than are stored.
 */
export const capApiTaskUpdates = (
  value: unknown,
  taskCount?: unknown
): { tasks: ApiTaskUpdateEntry[]; taskCount?: number } => {
  const valid = Array.isArray(value) ? value.filter(isApiTaskUpdateEntry) : [];
  const tasks = valid.slice(0, API_UPDATE_TASK_LIMIT).map(({ id, state }) => ({ id, state }));
  const total = Math.max(valid.length, sanitizeTaskCount(taskCount));
  return total > tasks.length ? { tasks, taskCount: total } : { tasks };
};
/** Total task updates an entry represents, including any dropped by the cap. */
export const countApiTaskUpdates = (entry: { tasks?: unknown[]; taskCount?: number }): number =>
  Math.max(entry.tasks?.length ?? 0, entry.taskCount ?? 0);
