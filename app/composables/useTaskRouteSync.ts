import { storeToRefs } from 'pinia';
import { useRouteFilters } from '@/composables/useRouteFilters';
import { type PreferencesStore, usePreferencesStore } from '@/stores/usePreferences';
import { isValidSecondaryView } from '@/types/taskFilter';
import { isValidSortDirection, isValidSortMode } from '@/types/taskSort';
import { logger } from '@/utils/logger';
import { getQueryString } from '@/utils/routeHelpers';
import { getTaskSecondaryViewForPrimaryView } from '@/utils/taskFilterNormalization';
import { resolveTaskRouteView, type TaskRouteView } from '@/utils/taskRouteView';
import type { Ref } from '#imports';
import type { FilterParamConfigs } from '@/composables/useRouteFilters';
import type { TarkovMap, Trader } from '@/types/tarkov';
import type { TaskPrimaryView } from '@/types/taskFilter';
import type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
export type UseTaskRouteSyncOptions = {
  maps: Ref<TarkovMap[]>;
  traders: Ref<Trader[]>;
};
export interface UseTaskRouteSyncReturn {
  isSyncingFromRoute: Ref<boolean>;
  isSyncingToRoute: Ref<boolean>;
}
type MapWithMergedIds = TarkovMap & { mergedIds?: string[] };
const getMergedMapIds = (map: TarkovMap): string[] => {
  const mergedIds = (map as MapWithMergedIds).mergedIds;
  if (!Array.isArray(mergedIds) || mergedIds.length === 0) return [map.id];
  return mergedIds.includes(map.id) ? mergedIds : [map.id, ...mergedIds];
};
const resolveMapIdFromRoute = (
  maps: TarkovMap[],
  mapParam: string | undefined
): string | undefined => {
  const firstMapId = maps[0]?.id;
  if (!mapParam) return firstMapId;
  if (maps.some((map) => map.id === mapParam)) return mapParam;
  const mergedMapMatch = maps.find((map) => getMergedMapIds(map).includes(mapParam));
  return mergedMapMatch?.id ?? firstMapId;
};
type TaskRouteParams = {
  status: string;
  map: string;
  trader: string;
  sort: string;
  sortDir: string;
};
const TASK_ROUTE_CONFIGS: FilterParamConfigs<TaskRouteParams> = {
  status: { default: 'available', validate: isValidSecondaryView },
  map: { default: 'all', validate: () => true },
  trader: { default: 'all', validate: () => true },
  sort: { default: 'impact', validate: isValidSortMode },
  sortDir: { default: 'desc', validate: isValidSortDirection },
};
const isTraderView = (view: string) => view === 'traders' || view === 'graph';
const setIfChanged = <T extends string>(
  next: T | undefined,
  current: T,
  set: (value: T) => void
) => {
  if (next && next !== current) set(next);
};
/** The route picks the view; the list route is the stored `all` view. */
const resolvePrimaryViewFromRoute = (routeView: TaskRouteView): TaskPrimaryView =>
  routeView === 'list' ? 'all' : routeView;
/** Keeps a stored view that belongs to another route from leaking into this one. */
const alignPrimaryViewWithRoute = (store: PreferencesStore, routeView: TaskRouteView) => {
  const primaryView = resolvePrimaryViewFromRoute(routeView);
  setIfChanged(primaryView, store.getTaskPrimaryView, (v) => store.setTaskPrimaryView(v));
};
const resolveTraderIdFromRoute = (traders: Trader[], traderParam: string) =>
  traders.some((t) => t.id === traderParam) ? traderParam : traders[0]?.id;
const syncViewsFromRoute = (
  store: PreferencesStore,
  primaryView: TaskPrimaryView,
  status: string
) => {
  setIfChanged(primaryView, store.getTaskPrimaryView, (v) => store.setTaskPrimaryView(v));
  if (primaryView === 'graph') return;
  setIfChanged(status, store.getTaskSecondaryView, (v) => store.setTaskSecondaryView(v));
};
const syncMapFromRoute = (
  store: PreferencesStore,
  maps: TarkovMap[],
  primaryView: TaskPrimaryView,
  mapParam: string
) => {
  if (primaryView !== 'maps') return;
  if (maps.length === 0) {
    logger.debug('[useTaskRouteSync] Delaying map sync until maps loaded.');
    return;
  }
  const mapId = resolveMapIdFromRoute(maps, mapParam === 'all' ? undefined : mapParam);
  setIfChanged(mapId, store.getTaskMapView, (v) => store.setTaskMapView(v));
};
const syncTraderFromRoute = (
  store: PreferencesStore,
  traders: Trader[],
  primaryView: TaskPrimaryView,
  traderParam: string
) => {
  if (!isTraderView(primaryView)) return;
  if (traders.length === 0) {
    logger.debug('[useTaskRouteSync] Delaying trader sync until traders loaded.');
    return;
  }
  const traderId = resolveTraderIdFromRoute(traders, traderParam);
  setIfChanged(traderId, store.getTaskTraderView, (v) => store.setTaskTraderView(v));
};
const syncSortFromRoute = (store: PreferencesStore, values: TaskRouteParams) => {
  setIfChanged(values.sort as TaskSortMode, store.getTaskSortMode, (v) => store.setTaskSortMode(v));
  setIfChanged(values.sortDir as TaskSortDirection, store.getTaskSortDirection, (v) =>
    store.setTaskSortDirection(v)
  );
};
/** Writes a param only for the view that uses it, keeping a not-yet-loaded route value. */
const pendingRouteParam = (
  isActive: boolean,
  isLoading: boolean,
  routeValue: string | undefined,
  storeValue: string
) => {
  if (!isActive) return undefined;
  return isLoading && routeValue ? routeValue : storeValue;
};
export function useTaskRouteSync({
  maps,
  traders,
}: UseTaskRouteSyncOptions): UseTaskRouteSyncReturn {
  const route = useRoute();
  const preferencesStore = usePreferencesStore();
  const {
    getTaskPrimaryView,
    getTaskSecondaryView,
    getTaskMapView,
    getTaskTraderView,
    getTaskSortMode,
    getTaskSortDirection,
  } = storeToRefs(preferencesStore);
  const routeView = computed(() => resolveTaskRouteView(route.path));
  watch(routeView, (view) => alignPrimaryViewWithRoute(preferencesStore, view), {
    immediate: true,
  });
  return useRouteFilters<TaskRouteParams>({
    configs: TASK_ROUTE_CONFIGS,
    onRouteToStore: (values) => {
      const primaryView = resolvePrimaryViewFromRoute(routeView.value);
      syncViewsFromRoute(preferencesStore, primaryView, values.status);
      syncMapFromRoute(preferencesStore, maps.value, primaryView, values.map);
      syncTraderFromRoute(preferencesStore, traders.value, primaryView, values.trader);
      syncSortFromRoute(preferencesStore, values);
    },
    onStoreToRoute: () => {
      const primaryView = getTaskPrimaryView.value;
      return {
        status: getTaskSecondaryViewForPrimaryView(primaryView, getTaskSecondaryView.value),
        map: pendingRouteParam(
          primaryView === 'maps',
          maps.value.length === 0,
          getQueryString(route.query.map),
          getTaskMapView.value
        ),
        trader: pendingRouteParam(
          isTraderView(primaryView),
          traders.value.length === 0,
          getQueryString(route.query.trader),
          getTaskTraderView.value
        ),
        sort: getTaskSortMode.value,
        sortDir: getTaskSortDirection.value,
      };
    },
    watchSources: [
      getTaskPrimaryView,
      getTaskSecondaryView,
      getTaskMapView,
      getTaskTraderView,
      getTaskSortMode,
      getTaskSortDirection,
    ],
    reapplyRouteOn: [() => maps.value.length, () => traders.value.length],
  });
}
