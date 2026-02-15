import { storeToRefs } from 'pinia';
import { useRouteFilters } from '@/composables/useRouteFilters';
import { usePreferencesStore } from '@/stores/usePreferences';
import { isValidPrimaryView, isValidSecondaryView } from '@/types/taskFilter';
import { isValidSortDirection, isValidSortMode } from '@/types/taskSort';
import { logger } from '@/utils/logger';
import { getQueryString } from '@/utils/routeHelpers';
import type { Ref } from '#imports';
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
    configs: {
      view: {
        key: 'view',
        default: 'all',
        validate: isValidPrimaryView,
        serialize: (v) => (v === 'all' ? undefined : v),
        deserialize: (v) => v,
      },
      status: {
        key: 'status',
        default: 'available',
        validate: isValidSecondaryView,
        serialize: (v) => (v === 'available' ? undefined : v),
        deserialize: (v) => v,
      },
      map: {
        key: 'map',
        default: 'all',
        validate: () => true,
        serialize: (v) => (v === 'all' ? undefined : v),
        deserialize: (v) => v,
      },
      trader: {
        key: 'trader',
        default: 'all',
        validate: () => true,
        serialize: (v) => (v === 'all' ? undefined : v),
        deserialize: (v) => v,
      },
      sort: {
        key: 'sort',
        default: 'impact',
        validate: isValidSortMode,
        serialize: (v) => (v === 'impact' ? undefined : v),
        deserialize: (v) => v,
      },
      sortDir: {
        key: 'sortDir',
        default: 'desc',
        validate: isValidSortDirection,
        serialize: (v) => (v === 'desc' ? undefined : v),
        deserialize: (v) => v,
      },
    },
    onRouteToStore: (values) => {
      const targetView = values.view as TaskPrimaryView;
      if (targetView !== preferencesStore.getTaskPrimaryView) {
        preferencesStore.setTaskPrimaryView(targetView);
      }
      if (values.status !== preferencesStore.getTaskSecondaryView) {
        preferencesStore.setTaskSecondaryView(values.status);
      }
      if (targetView === 'maps') {
        if (maps.value.length === 0) {
          logger.debug('[useTaskRouteSync] Delaying map sync until maps loaded.');
        } else {
          const mapId = resolveMapIdFromRoute(maps.value, values.map);
          if (mapId && mapId !== preferencesStore.getTaskMapView) {
            preferencesStore.setTaskMapView(mapId);
          }
        }
      }
      if (targetView === 'traders' || targetView === 'graph') {
        if (traders.value.length === 0) {
          logger.debug('[useTaskRouteSync] Delaying trader sync until traders loaded.');
        } else {
          const firstTraderId = traders.value[0]?.id;
          const traderId = traders.value.some((t) => t.id === values.trader)
            ? values.trader
            : firstTraderId;
          if (traderId && traderId !== preferencesStore.getTaskTraderView) {
            preferencesStore.setTaskTraderView(traderId);
          }
        }
      }
      if (values.sort !== preferencesStore.getTaskSortMode) {
        preferencesStore.setTaskSortMode(values.sort as TaskSortMode);
      }
      if (values.sortDir !== preferencesStore.getTaskSortDirection) {
        preferencesStore.setTaskSortDirection(values.sortDir as TaskSortDirection);
      }
    },
    onStoreToRoute: () => {
      const primaryView = getTaskPrimaryView.value;
      const routeMap = getQueryString(route.query.map);
      const routeTrader = getQueryString(route.query.trader);
      const shouldDelayMap = primaryView === 'maps' && maps.value.length === 0 && !!routeMap;
      const shouldDelayTrader =
        (primaryView === 'traders' || primaryView === 'graph') &&
        traders.value.length === 0 &&
        !!routeTrader;
      return {
        view: primaryView,
        status: getTaskSecondaryView.value,
        map: shouldDelayMap ? routeMap : getTaskMapView.value,
        trader: shouldDelayTrader ? routeTrader : getTaskTraderView.value,
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
