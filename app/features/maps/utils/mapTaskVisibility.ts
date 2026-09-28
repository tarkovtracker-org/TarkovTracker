/**
 * User-controlled per-quest map visibility (#918).
 *
 * Distinct from filter-driven visibility (task filters, trader-standing gating): these states only
 * decide whether a task that already passed every filter draws its objectives on the map.
 */
export type MapTaskUserVisibility = 'visible' | 'hidden' | 'unfocused';
export interface MapTaskVisibilityState {
  hiddenTaskIds: ReadonlySet<string>;
  activeFocusTaskIds: ReadonlySet<string>;
}
/**
 * Focus only applies when at least one focused task is on the current map; otherwise a focus set
 * built for another map would blank this one.
 */
export const resolveActiveFocusTaskIds = (
  focusTaskIds: readonly string[],
  mapTaskIds: Iterable<string>
): Set<string> => {
  const focusSet = new Set(focusTaskIds);
  const active = new Set<string>();
  for (const taskId of mapTaskIds) {
    if (focusSet.has(taskId)) active.add(taskId);
  }
  return active;
};
export const buildMapTaskVisibilityState = (
  hiddenTaskIds: readonly string[],
  focusTaskIds: readonly string[],
  mapTaskIds: Iterable<string>
): MapTaskVisibilityState => ({
  hiddenTaskIds: new Set(hiddenTaskIds),
  activeFocusTaskIds: resolveActiveFocusTaskIds(focusTaskIds, mapTaskIds),
});
export const getMapTaskUserVisibility = (
  taskId: string,
  state: MapTaskVisibilityState
): MapTaskUserVisibility => {
  if (state.activeFocusTaskIds.size > 0) {
    return state.activeFocusTaskIds.has(taskId) ? 'visible' : 'unfocused';
  }
  return state.hiddenTaskIds.has(taskId) ? 'hidden' : 'visible';
};
export const isTaskShownOnMap = (taskId: string, state: MapTaskVisibilityState): boolean =>
  getMapTaskUserVisibility(taskId, state) === 'visible';
export const normalizeTaskIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
};
