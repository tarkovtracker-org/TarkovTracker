import type { Task } from '@/types/tarkov';
/** A quest matches when at least one individual trader reward meets the minimum. */
export const meetsMapReputationMinimum = (task: Task, minimum: number | null): boolean => {
  if (minimum === null) return true;
  return (task.finishRewards?.traderStanding ?? []).some(
    ({ standing }) => Number.isFinite(standing) && standing > 0 && standing >= minimum
  );
};
/**
 * Quests the user hid from the Tasks map (#918).
 *
 * Distinct from filter-driven visibility (task filters, trader-standing gating): this only decides
 * whether a task that already passed every filter draws its objectives on the map.
 */
export const normalizeTaskIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
};
/** Map tasks the user hid, in `mapTaskIds` order. */
export const getHiddenMapTaskIds = (
  mapTaskIds: readonly string[],
  hiddenTaskIds: ReadonlySet<string>
): string[] => mapTaskIds.filter((taskId) => hiddenTaskIds.has(taskId));
/** Hide controls offered in a map marker's popup; only the Tasks page provides them. */
export interface MapTaskVisibilityActions {
  hideTask: (taskId: string) => void;
  showOnlyTask: (taskId: string) => void;
}
