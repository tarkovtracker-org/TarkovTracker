import { storeToRefs } from 'pinia';
import { useRouteFilters } from '@/composables/useRouteFilters';
import { usePreferencesStore } from '@/stores/usePreferences';
import { isValidPrimaryView, isValidSecondaryView } from '@/types/taskFilter';
import { isValidSortDirection, isValidSortMode } from '@/types/taskSort';
import { logger } from '@/utils/logger';
import { getQueryString } from '@/utils/routeHelpers';
import { getTaskSecondaryViewForPrimaryView } from '@/utils/taskFilterNormalization';
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
  view: string;
  status: string;
  map: string;
  trader: string;
  sort: string;
  sortDir: string;
};
type PreferencesStore = ReturnType<typeof usePreferencesStore>;
const TASK_ROUTE_CONFIGS: FilterParamConfigs<TaskRouteParams> = {
  view: { default: 'all', validate: isValidPrimaryView },
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
const resolveTraderIdFromRoute = (traders: Trader[], traderParam: string) =>
  traders.some((t) => t.id === traderParam) ? traderParam : traders[0]?.id;
const syncViewsFromRoute = (store: PreferencesStore, values: TaskRouteParams) => {
  const targetView = values.view as TaskPrimaryView;
  setIfChanged(targetView, store.getTaskPrimaryView, (v) => store.setTaskPrimaryView(v));
  if (targetView === 'graph') return;
  setIfChanged(values.status, store.getTaskSecondaryView, (v) => store.setTaskSecondaryView(v));
};
const syncMapFromRoute = (store: PreferencesStore, maps: TarkovMap[], values: TaskRouteParams) => {
  if (values.view !== 'maps') return;
  if (maps.length === 0) {
    logger.debug('[useTaskRouteSync] Delaying map sync until maps loaded.');
    return;
  }
  const mapId = resolveMapIdFromRoute(maps, values.map);
  setIfChanged(mapId, store.getTaskMapView, (v) => store.setTaskMapView(v));
};
const syncTraderFromRoute = (
  store: PreferencesStore,
  traders: Trader[],
  values: TaskRouteParams
) => {
  if (!isTraderView(values.view)) return;
  if (traders.length === 0) {
    logger.debug('[useTaskRouteSync] Delaying trader sync until traders loaded.');
    return;
  }
  const traderId = resolveTraderIdFromRoute(traders, values.trader);
  setIfChanged(traderId, store.getTaskTraderView, (v) => store.setTaskTraderView(v));
};
const syncSortFromRoute = (store: PreferencesStore, values: TaskRouteParams) => {
  setIfChanged(values.sort as TaskSortMode, store.getTaskSortMode, (v) => store.setTaskSortMode(v));
  setIfChanged(values.sortDir as TaskSortDirection, store.getTaskSortDirection, (v) =>
    store.setTaskSortDirection(v)
  );
};
const pendingRouteParam = (
  isActive: boolean,
  isLoading: boolean,
  routeValue: string | undefined,
  storeValue: string
) => (isActive && isLoading && routeValue ? routeValue : storeValue);
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
  return useRouteFilters<TaskRouteParams>({
    configs: TASK_ROUTE_CONFIGS,
    onRouteToStore: (values) => {
      syncViewsFromRoute(preferencesStore, values);
      syncMapFromRoute(preferencesStore, maps.value, values);
      syncTraderFromRoute(preferencesStore, traders.value, values);
      syncSortFromRoute(preferencesStore, values);
    },
    onStoreToRoute: () => {
      const primaryView = getTaskPrimaryView.value;
      return {
        view: primaryView,
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
      () => maps.value.length,
      () => traders.value.length,
    ],
  });
}
