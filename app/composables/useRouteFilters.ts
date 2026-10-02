import { logger } from '@/utils/logger';
import { getQueryString, normalizeQuery } from '@/utils/routeHelpers';
import type { WatchSource } from 'vue';
import type { LocationQuery, LocationQueryRaw } from 'vue-router';
type FilterParamCodec<T> = {
  serialize: (value: T) => string | undefined;
  deserialize: (raw: string) => T;
};
type FilterParamBase<T> = {
  key?: string;
  default: T;
  validate: (raw: string) => boolean;
};
export type FilterParamConfig<T> = FilterParamBase<T> &
  ([T] extends [string] ? Partial<FilterParamCodec<T>> : FilterParamCodec<T>);
type ResolvedFilterParamConfig<T> = Required<FilterParamBase<T>> & FilterParamCodec<T>;
export type FilterParamConfigs<TMap extends Record<string, unknown>> = {
  [K in keyof TMap]: FilterParamConfig<TMap[K]>;
};
type ResolvedFilterParamConfigs<TMap extends Record<string, unknown>> = {
  [K in keyof TMap]: ResolvedFilterParamConfig<TMap[K]>;
};
export type UseRouteFiltersOptions<TMap extends Record<string, unknown>> = {
  configs: FilterParamConfigs<TMap>;
  onRouteToStore: (values: TMap) => void;
  onStoreToRoute: () => Partial<TMap>;
  watchSources: WatchSource[];
  reapplyRouteOn?: WatchSource[];
};
export type UseRouteFiltersReturn = {
  isSyncingFromRoute: Ref<boolean>;
  isSyncingToRoute: Ref<boolean>;
};
const identity = <T>(raw: string): T => raw as T;
const withDefaultOmitted =
  <T>(defaultValue: T, serialize: (value: T) => string | undefined) =>
  (value: T): string | undefined =>
    value === defaultValue ? undefined : serialize(value);
const resolveFilterParamConfig = <T>(
  name: string,
  config: FilterParamConfig<T>
): ResolvedFilterParamConfig<T> => {
  const codec = config as FilterParamBase<T> & Partial<FilterParamCodec<T>>;
  return {
    key: codec.key ?? name,
    default: codec.default,
    validate: codec.validate,
    serialize: withDefaultOmitted(codec.default, codec.serialize ?? String),
    deserialize: codec.deserialize ?? identity<T>,
  };
};
const resolveConfigs = <TMap extends Record<string, unknown>>(
  configs: FilterParamConfigs<TMap>
): ResolvedFilterParamConfigs<TMap> => {
  const resolved = {} as ResolvedFilterParamConfigs<TMap>;
  for (const name of Object.keys(configs) as (keyof TMap & string)[]) {
    resolved[name] = resolveFilterParamConfig(name, configs[name]);
  }
  return resolved;
};
const buildQuery = <TMap extends Record<string, unknown>>(
  currentQuery: LocationQuery,
  configs: ResolvedFilterParamConfigs<TMap>,
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
  configs: ResolvedFilterParamConfigs<TMap>
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
const createRouteSyncer =
  (
    route: ReturnType<typeof useRoute>,
    router: ReturnType<typeof useRouter>,
    isSyncingToRoute: Ref<boolean>
  ) =>
  (nextQuery: LocationQueryRaw, useReplace = false) => {
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
const createDebounced = (fn: () => void, delayMs: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
  };
  const run = () => {
    cancel();
    timeout = setTimeout(() => {
      timeout = null;
      fn();
    }, delayMs);
  };
  return { run, cancel };
};
export function useRouteFilters<TMap extends Record<string, unknown>>(
  options: UseRouteFiltersOptions<TMap>
): UseRouteFiltersReturn {
  const route = useRoute();
  const { onRouteToStore, onStoreToRoute, watchSources, reapplyRouteOn = [] } = options;
  const configs = resolveConfigs(options.configs);
  const isSyncingFromRoute = ref(false);
  const isSyncingToRoute = ref(false);
  const hasInitialized = ref(false);
  const syncRoute = createRouteSyncer(route, useRouter(), isSyncingToRoute);
  const syncStoreToRoute = (useReplace = false) => {
    syncRoute(buildQuery(route.query, configs, onStoreToRoute()), useReplace);
  };
  const syncStateFromRoute = () => {
    if (isSyncingToRoute.value) return;
    const { values, hasAnyParam } = parseQuery(route.query, configs);
    if (!hasInitialized.value) {
      hasInitialized.value = true;
      if (!hasAnyParam) return syncStoreToRoute(true);
    }
    isSyncingFromRoute.value = true;
    onRouteToStore(values);
    isSyncingFromRoute.value = false;
  };
  const debouncedSync = createDebounced(syncStateFromRoute, 200);
  onBeforeUnmount(debouncedSync.cancel);
  watch(
    Object.values(configs).map((config) => () => route.query[config.key]),
    debouncedSync.run,
    { immediate: true }
  );
  if (reapplyRouteOn.length > 0) watch(reapplyRouteOn, debouncedSync.run);
  if (watchSources.length > 0) {
    watch(
      watchSources,
      () => {
        if (!isSyncingFromRoute.value) syncStoreToRoute();
      },
      { flush: 'post' }
    );
  }
  return { isSyncingFromRoute, isSyncingToRoute };
}
