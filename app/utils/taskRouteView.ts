import type { LocationQuery, LocationQueryRaw } from 'vue-router';
export type TaskRouteView = 'list' | 'traders' | 'maps' | 'graph';
export const TASK_ROUTE_PATHS: Record<TaskRouteView, string> = {
  list: '/tasks',
  traders: '/tasks/traders',
  maps: '/tasks/maps',
  graph: '/tasks/graph',
};
const ROUTE_VIEW_BY_PATH = new Map(
  (Object.entries(TASK_ROUTE_PATHS) as [TaskRouteView, string][]).map(([view, path]) => [
    path,
    view,
  ])
);
const normalizeTaskPath = (path: string): string => path.replace(/\/+$/, '') || '/';
export const resolveTaskRouteView = (path: string): TaskRouteView =>
  ROUTE_VIEW_BY_PATH.get(normalizeTaskPath(path)) ?? 'list';
export const isTaskListPath = (path: string): boolean =>
  normalizeTaskPath(path) === TASK_ROUTE_PATHS.list;
// A Map, so params like `constructor` cannot resolve to inherited object keys.
const LEGACY_VIEW_PATHS = new Map<string | null | undefined, string>([
  ['all', TASK_ROUTE_PATHS.list],
  ['traders', TASK_ROUTE_PATHS.traders],
  ['maps', TASK_ROUTE_PATHS.maps],
  ['graph', TASK_ROUTE_PATHS.graph],
]);
/** Maps a pre-route `/tasks?view=<view>` link to its route, keeping the other query params. */
export const resolveLegacyTaskViewRedirect = (
  path: string,
  query: LocationQuery
): { path: string; query: LocationQueryRaw } | null => {
  if (!isTaskListPath(path) || query.view === undefined) return null;
  const { view, ...rest } = query;
  const legacyView = Array.isArray(view) ? view[0] : view;
  return { path: LEGACY_VIEW_PATHS.get(legacyView) ?? TASK_ROUTE_PATHS.list, query: rest };
};
