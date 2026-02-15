import { logger } from '@/utils/logger';
import { getQueryString, normalizeQuery } from '@/utils/routeHelpers';
import type { WatchSource } from 'vue';
import type { LocationQuery, LocationQueryRaw } from 'vue-router';
export type FilterParamConfig<T> = {
  key: string;
  default: T;
  validate: (raw: string) => boolean;
  serialize: (value: T) => string | undefined;
  deserialize: (raw: string) => T;
};
export type UseRouteFiltersOptions<TMap extends Record<string, unknown>> = {
  configs: { [K in keyof TMap]: FilterParamConfig<TMap[K]> };
  onRouteToStore: (values: TMap) => void;
  onStoreToRoute: () => Partial<TMap>;
  watchSources: WatchSource[];
};
export type UseRouteFiltersReturn = {
  isSyncingFromRoute: Ref<boolean>;
  isSyncingToRoute: Ref<boolean>;
};
const buildQuery = <TMap extends Record<string, unknown>>(
  currentQuery: LocationQuery,
  configs: UseRouteFiltersOptions<TMap>['configs'],
  values: Partial<TMap>
): LocationQueryRaw => {
  const nextQuery: LocationQueryRaw = { ...currentQuery };
  for (const configKey of Object.keys(configs) as (keyof TMap & string)[]) {
    const config = configs[configKey];
    const value = values[configKey];
    if (value === undefined) {
      nextQuery[config.key] = undefined;
      continue;
    }
    nextQuery[config.key] = config.serialize(value as TMap[typeof configKey]);
  }
  return nextQuery;
};
const parseQuery = <TMap extends Record<string, unknown>>(
  query: LocationQuery,
  configs: UseRouteFiltersOptions<TMap>['configs']
): { values: TMap; hasAnyParam: boolean } => {
  let hasAnyParam = false;
  const values = {} as TMap;
  for (const configKey of Object.keys(configs) as (keyof TMap & string)[]) {
    const config = configs[configKey];
    const raw = getQueryString(query[config.key]);
    if (raw !== undefined) {
      hasAnyParam = true;
      if (config.validate(raw)) {
        values[configKey] = config.deserialize(raw) as TMap[typeof configKey];
        continue;
      }
    }
    values[configKey] = config.default as TMap[typeof configKey];
  }
  return { values, hasAnyParam };
};
export function useRouteFilters<TMap extends Record<string, unknown>>(
  options: UseRouteFiltersOptions<TMap>
): UseRouteFiltersReturn {
  const route = useRoute();
  const router = useRouter();
  const { configs, onRouteToStore, onStoreToRoute, watchSources } = options;
  const isSyncingFromRoute = ref(false);
  const isSyncingToRoute = ref(false);
  const hasInitialized = ref(false);
  const syncRoute = (nextQuery: LocationQueryRaw, useReplace = false) => {
    if (isSyncingToRoute.value) return;
    if (normalizeQuery(route.query) === normalizeQuery(nextQuery)) return;
    isSyncingToRoute.value = true;
    const method = useReplace ? 'replace' : 'push';
    router[method]({ query: nextQuery })
      .catch((error) => {
        logger.error('[useRouteFilters] Navigation failed:', error);
      })
      .finally(() => {
        isSyncingToRoute.value = false;
      });
  };
  const syncStateFromRoute = () => {
    if (isSyncingToRoute.value) return;
    const { values, hasAnyParam } = parseQuery(route.query, configs);
    if (!hasInitialized.value) {
      hasInitialized.value = true;
      if (!hasAnyParam) {
        const storeValues = onStoreToRoute();
        syncRoute(buildQuery(route.query, configs, storeValues), true);
        return;
      }
    }
    isSyncingFromRoute.value = true;
    onRouteToStore(values);
    isSyncingFromRoute.value = false;
  };
  let syncTimeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedSyncStateFromRoute = () => {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      syncTimeout = null;
      syncStateFromRoute();
    }, 200);
  };
  onBeforeUnmount(() => {
    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }
  });
  const queryWatchSources = Object.keys(configs).map((configKey) => {
    const config = configs[configKey as keyof TMap];
    return () => route.query[config.key];
  });
  watch(
    queryWatchSources,
    () => {
      debouncedSyncStateFromRoute();
    },
    { immediate: true }
  );
  if (watchSources.length > 0) {
    watch(
      watchSources,
      () => {
        if (isSyncingFromRoute.value) return;
        const storeValues = onStoreToRoute();
        syncRoute(buildQuery(route.query, configs, storeValues));
      },
      { flush: 'post' }
    );
  }
  return { isSyncingFromRoute, isSyncingToRoute };
}
