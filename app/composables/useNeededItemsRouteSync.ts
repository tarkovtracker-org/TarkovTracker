import { storeToRefs } from 'pinia';
import { useRouteFilters } from '@/composables/useRouteFilters';
import {
  isValidNeededItemsFilterType,
  isValidNeededItemsSortBy,
  isValidNeededItemsSortDirection,
} from '@/features/neededitems/neededitems-constants';
import { usePreferencesStore } from '@/stores/usePreferences';
import type { Ref } from '#imports';
import type { NeededItemsFilterType } from '@/features/neededitems/neededitems-constants';
export type UseNeededItemsRouteSyncOptions = {
  activeFilter: Ref<NeededItemsFilterType>;
};
export interface UseNeededItemsRouteSyncReturn {
  isSyncingFromRoute: Ref<boolean>;
  isSyncingToRoute: Ref<boolean>;
}
type NeededItemsRouteParams = {
  type: string;
  sort: string;
  sortDir: string;
};
export function useNeededItemsRouteSync({
  activeFilter,
}: UseNeededItemsRouteSyncOptions): UseNeededItemsRouteSyncReturn {
  const preferencesStore = usePreferencesStore();
  const { getNeededItemsSortBy, getNeededItemsSortDirection } = storeToRefs(preferencesStore);
  return useRouteFilters<NeededItemsRouteParams>({
    configs: {
      type: {
        key: 'type',
        default: 'all',
        validate: isValidNeededItemsFilterType,
        serialize: (v) => (v === 'all' ? undefined : v),
        deserialize: (v) => v,
      },
      sort: {
        key: 'sort',
        default: 'priority',
        validate: isValidNeededItemsSortBy,
        serialize: (v) => (v === 'priority' ? undefined : v),
        deserialize: (v) => v,
      },
      sortDir: {
        key: 'sortDir',
        default: 'desc',
        validate: isValidNeededItemsSortDirection,
        serialize: (v) => (v === 'desc' ? undefined : v),
        deserialize: (v) => v,
      },
    },
    onRouteToStore: (values) => {
      const targetFilter = values.type as NeededItemsFilterType;
      if (targetFilter !== activeFilter.value) {
        activeFilter.value = targetFilter;
      }
      if (values.sort !== preferencesStore.getNeededItemsSortBy) {
        preferencesStore.setNeededItemsSortBy(
          values.sort as 'priority' | 'name' | 'category' | 'count'
        );
      }
      if (values.sortDir !== preferencesStore.getNeededItemsSortDirection) {
        preferencesStore.setNeededItemsSortDirection(values.sortDir as 'asc' | 'desc');
      }
    },
    onStoreToRoute: () => ({
      type: activeFilter.value,
      sort: getNeededItemsSortBy.value,
      sortDir: getNeededItemsSortDirection.value,
    }),
    watchSources: [activeFilter, getNeededItemsSortBy, getNeededItemsSortDirection],
  });
}
