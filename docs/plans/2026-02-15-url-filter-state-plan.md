# URL-Based Filter State Management — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace duplicated route sync composables with a single generic `useRouteFilters` composable, extend URL-synced filters on tasks/needed-items, and add URL sync to hideout.

**Architecture:** A generic `useRouteFilters` composable handles all bidirectional URL ↔ store sync (debounce, guards, initialization). Per-page wrappers (`useTaskRouteSync`, `useNeededItemsRouteSync`, `useHideoutRouteSync`) supply declarative config objects describing which query params to sync. The preferences store remains the source of truth; the URL is a mirror of primary navigation filters only.

**Tech Stack:** Vue 3 composables, vue-router query params, Pinia preferences store, Vitest + Vue Test Utils

---

## Task 1: Add sort validators to `types/taskSort.ts`

**Files:**

- Modify: `app/types/taskSort.ts`
- Test: `app/types/__tests__/taskSort.test.ts`

**Step 1: Write the failing test**

Create `app/types/__tests__/taskSort.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isValidSortDirection, isValidSortMode } from '@/types/taskSort';

describe('isValidSortMode', () => {
  it('returns true for valid sort modes', () => {
    expect(isValidSortMode('impact')).toBe(true);
    expect(isValidSortMode('alphabetical')).toBe(true);
    expect(isValidSortMode('none')).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isValidSortMode('invalid')).toBe(false);
    expect(isValidSortMode(undefined)).toBe(false);
    expect(isValidSortMode('')).toBe(false);
  });
});

describe('isValidSortDirection', () => {
  it('returns true for valid directions', () => {
    expect(isValidSortDirection('asc')).toBe(true);
    expect(isValidSortDirection('desc')).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isValidSortDirection('up')).toBe(false);
    expect(isValidSortDirection(undefined)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run app/types/__tests__/taskSort.test.ts`
Expected: FAIL — `isValidSortMode` and `isValidSortDirection` are not exported from `@/types/taskSort`.

**Step 3: Write minimal implementation**

Add to the bottom of `app/types/taskSort.ts`:

```ts
export const isValidSortMode = (value: string | undefined): value is TaskSortMode =>
  typeof value === 'string' && TASK_SORT_MODES.includes(value as TaskSortMode);

export const isValidSortDirection = (value: string | undefined): value is TaskSortDirection =>
  typeof value === 'string' && TASK_SORT_DIRECTIONS.includes(value as TaskSortDirection);
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run app/types/__tests__/taskSort.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/types/taskSort.ts app/types/__tests__/taskSort.test.ts
git commit -m "feat(types): add sort mode and direction validators"
```

---

## Task 2: Add needed-items sort validators to `neededitems-constants.ts`

**Files:**

- Modify: `app/features/neededitems/neededitems-constants.ts`
- Test: `app/features/neededitems/__tests__/neededitems-constants.test.ts`

**Step 1: Write the failing test**

Create `app/features/neededitems/__tests__/neededitems-constants.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isValidNeededItemsFilterType,
  isValidNeededItemsSortBy,
  isValidNeededItemsSortDirection,
} from '@/features/neededitems/neededitems-constants';

describe('isValidNeededItemsFilterType', () => {
  it('returns true for valid filter types', () => {
    expect(isValidNeededItemsFilterType('all')).toBe(true);
    expect(isValidNeededItemsFilterType('tasks')).toBe(true);
    expect(isValidNeededItemsFilterType('hideout')).toBe(true);
    expect(isValidNeededItemsFilterType('completed')).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isValidNeededItemsFilterType('invalid')).toBe(false);
    expect(isValidNeededItemsFilterType(undefined)).toBe(false);
  });
});

describe('isValidNeededItemsSortBy', () => {
  it('returns true for valid sort modes', () => {
    expect(isValidNeededItemsSortBy('priority')).toBe(true);
    expect(isValidNeededItemsSortBy('name')).toBe(true);
    expect(isValidNeededItemsSortBy('category')).toBe(true);
    expect(isValidNeededItemsSortBy('count')).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isValidNeededItemsSortBy('invalid')).toBe(false);
    expect(isValidNeededItemsSortBy(undefined)).toBe(false);
  });
});

describe('isValidNeededItemsSortDirection', () => {
  it('returns true for valid directions', () => {
    expect(isValidNeededItemsSortDirection('asc')).toBe(true);
    expect(isValidNeededItemsSortDirection('desc')).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isValidNeededItemsSortDirection('up')).toBe(false);
    expect(isValidNeededItemsSortDirection(undefined)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run app/features/neededitems/__tests__/neededitems-constants.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Add to the bottom of `app/features/neededitems/neededitems-constants.ts`:

```ts
export const NEEDED_ITEMS_FILTER_TYPES = ['all', 'tasks', 'hideout', 'completed'] as const;
export const NEEDED_ITEMS_SORT_BY = ['priority', 'name', 'category', 'count'] as const;
export const NEEDED_ITEMS_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type NeededItemsSortBy = (typeof NEEDED_ITEMS_SORT_BY)[number];
export type NeededItemsSortDirection = (typeof NEEDED_ITEMS_SORT_DIRECTIONS)[number];

export const isValidNeededItemsFilterType = (
  value: string | undefined
): value is NeededItemsFilterType =>
  typeof value === 'string' && NEEDED_ITEMS_FILTER_TYPES.includes(value as NeededItemsFilterType);

export const isValidNeededItemsSortBy = (value: string | undefined): value is NeededItemsSortBy =>
  typeof value === 'string' &&
  NEEDED_ITEMS_SORT_BY.includes(value as (typeof NEEDED_ITEMS_SORT_BY)[number]);

export const isValidNeededItemsSortDirection = (
  value: string | undefined
): value is NeededItemsSortDirection =>
  typeof value === 'string' &&
  NEEDED_ITEMS_SORT_DIRECTIONS.includes(value as (typeof NEEDED_ITEMS_SORT_DIRECTIONS)[number]);
```

Note: `NeededItemsSortBy` and `NeededItemsSortDirection` are currently defined in `app/composables/useNeededItemsSorting.ts`. After adding them here, update `useNeededItemsSorting.ts` to re-export from this file instead of defining its own duplicate types. Check for any imports of those types from the old location and update them.

**Step 4: Run test to verify it passes**

Run: `npx vitest run app/features/neededitems/__tests__/neededitems-constants.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/features/neededitems/neededitems-constants.ts app/features/neededitems/__tests__/neededitems-constants.test.ts
git commit -m "feat(neededitems): add filter type and sort validators"
```

---

## Task 3: Create `useRouteFilters` composable

This is the core generic composable. It handles all bidirectional URL ↔ store sync logic.

**Files:**

- Create: `app/composables/useRouteFilters.ts`
- Create: `app/composables/__tests__/useRouteFilters.test.ts`

**Step 1: Write the failing test**

Create `app/composables/__tests__/useRouteFilters.test.ts`:

```ts
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive } from 'vue';

type QueryRecord = Record<string, string | undefined>;

const routeState = reactive({
  query: reactive<QueryRecord>({}),
});

const applyRouteQuery = (query: QueryRecord) => {
  Object.keys(routeState.query).forEach((key) => {
    routeState.query[key] = undefined;
  });
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      routeState.query[key] = value;
    }
  });
};

const push = vi.fn(async ({ query }: { query: QueryRecord }) => {
  applyRouteQuery(query);
});
const replace = vi.fn(async ({ query }: { query: QueryRecord }) => {
  applyRouteQuery(query);
});

mockNuxtImport('useRoute', () => () => routeState);
mockNuxtImport('useRouter', () => () => ({
  push,
  replace,
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
  afterEach: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const flushRouteSync = async () => {
  await vi.advanceTimersByTimeAsync(250);
  await nextTick();
};

describe('useRouteFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    applyRouteQuery({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('populates URL from store values when no query params present on init', async () => {
    const onRouteToStore = vi.fn();
    const onStoreToRoute = vi.fn(() => ({ view: 'maps' }));

    const { useRouteFilters } = await import('@/composables/useRouteFilters');
    const TestHarness = defineComponent({
      setup() {
        useRouteFilters({
          configs: {
            view: {
              key: 'view',
              default: 'all',
              validate: (v: string) => ['all', 'maps'].includes(v),
              serialize: (v: string) => (v === 'all' ? undefined : v),
              deserialize: (v: string) => v,
            },
          },
          onRouteToStore,
          onStoreToRoute,
          watchSources: [],
        });
        return () => h('div');
      },
    });
    const wrapper = mount(TestHarness);
    await flushRouteSync();
    expect(replace).toHaveBeenCalled();
    expect(routeState.query.view).toBe('maps');
    expect(onRouteToStore).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('deserializes URL params into store on init when params present', async () => {
    applyRouteQuery({ view: 'maps' });
    const onRouteToStore = vi.fn();
    const onStoreToRoute = vi.fn(() => ({ view: 'all' }));

    const { useRouteFilters } = await import('@/composables/useRouteFilters');
    const TestHarness = defineComponent({
      setup() {
        useRouteFilters({
          configs: {
            view: {
              key: 'view',
              default: 'all',
              validate: (v: string) => ['all', 'maps'].includes(v),
              serialize: (v: string) => (v === 'all' ? undefined : v),
              deserialize: (v: string) => v,
            },
          },
          onRouteToStore,
          onStoreToRoute,
          watchSources: [],
        });
        return () => h('div');
      },
    });
    const wrapper = mount(TestHarness);
    await flushRouteSync();
    expect(onRouteToStore).toHaveBeenCalledWith({ view: 'maps' });
    wrapper.unmount();
  });

  it('ignores invalid URL params and falls back to defaults', async () => {
    applyRouteQuery({ view: 'INVALID' });
    const onRouteToStore = vi.fn();
    const onStoreToRoute = vi.fn(() => ({ view: 'all' }));

    const { useRouteFilters } = await import('@/composables/useRouteFilters');
    const TestHarness = defineComponent({
      setup() {
        useRouteFilters({
          configs: {
            view: {
              key: 'view',
              default: 'all',
              validate: (v: string) => ['all', 'maps'].includes(v),
              serialize: (v: string) => (v === 'all' ? undefined : v),
              deserialize: (v: string) => v,
            },
          },
          onRouteToStore,
          onStoreToRoute,
          watchSources: [],
        });
        return () => h('div');
      },
    });
    const wrapper = mount(TestHarness);
    await flushRouteSync();
    expect(onRouteToStore).toHaveBeenCalledWith({ view: 'all' });
    wrapper.unmount();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run app/composables/__tests__/useRouteFilters.test.ts`
Expected: FAIL — module `@/composables/useRouteFilters` does not exist.

**Step 3: Write minimal implementation**

Create `app/composables/useRouteFilters.ts`:

```ts
import { logger } from '@/utils/logger';
import { getQueryString, normalizeQuery } from '@/utils/routeHelpers';
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
    if (raw !== undefined && config.validate(raw)) {
      values[configKey] = config.deserialize(raw) as TMap[typeof configKey];
      hasAnyParam = true;
    } else {
      values[configKey] = config.default as TMap[typeof configKey];
    }
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

  // Watch route query changes for the config keys
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

  // Watch store changes and sync to route
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run app/composables/__tests__/useRouteFilters.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/composables/useRouteFilters.ts app/composables/__tests__/useRouteFilters.test.ts
git commit -m "feat: add generic useRouteFilters composable"
```

---

## Task 4: Rewrite `useTaskRouteSync` to use `useRouteFilters`

**Files:**

- Modify: `app/composables/useTaskRouteSync.ts`
- Modify: `app/composables/__tests__/useTaskRouteSync.test.ts`

**Step 1: Update the existing test and add new cases**

The existing test in `app/composables/__tests__/useTaskRouteSync.test.ts` should continue to pass after the rewrite. Additionally add a test for the new `status` query param:

Add to the existing describe block:

```ts
it('syncs status query param to store on init', async () => {
  applyRouteQuery({ view: 'all', status: 'locked' });
  const maps = ref<TarkovMap[]>([]);
  const traders = ref<Trader[]>([]);
  const { useTaskRouteSync } = await import('@/composables/useTaskRouteSync');
  const TestHarness = defineComponent({
    setup() {
      useTaskRouteSync({ maps, traders });
      return () => h('div');
    },
  });
  const wrapper = mount(TestHarness);
  await flushRouteSync();
  expect(setTaskSecondaryView).toHaveBeenCalledWith('locked');
  wrapper.unmount();
});
```

Ensure the mock store also includes `getTaskSecondaryView`, `getTaskSortMode`, `getTaskSortDirection` and their setters (`setTaskSecondaryView`, `setTaskSortMode`, `setTaskSortDirection`).

**Step 2: Run test to verify it fails**

Run: `npx vitest run app/composables/__tests__/useTaskRouteSync.test.ts`
Expected: FAIL — the new test references `setTaskSecondaryView` which the mock doesn't yet define, and the composable doesn't sync `status`.

**Step 3: Rewrite `useTaskRouteSync`**

Rewrite `app/composables/useTaskRouteSync.ts` to use `useRouteFilters`. Keep the merged-map resolution logic as a post-processing step in `onRouteToStore`. Key structure:

```ts
import { storeToRefs } from 'pinia';
import { useRouteFilters } from '@/composables/useRouteFilters';
import { usePreferencesStore } from '@/stores/usePreferences';
import { isValidPrimaryView, isValidSecondaryView } from '@/types/taskFilter';
import { isValidSortDirection, isValidSortMode } from '@/types/taskSort';
import { logger } from '@/utils/logger';
import type { Ref } from '#imports';
import type { TarkovMap, Trader } from '@/types/tarkov';
import type { TaskPrimaryView } from '@/types/taskFilter';

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
        serialize: (v) => v,
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
          return;
        }
        const mapId = resolveMapIdFromRoute(maps.value, values.map);
        if (mapId && mapId !== preferencesStore.getTaskMapView) {
          preferencesStore.setTaskMapView(mapId);
        }
      }
      if (targetView === 'traders' || targetView === 'graph') {
        if (traders.value.length === 0) {
          logger.debug('[useTaskRouteSync] Delaying trader sync until traders loaded.');
          return;
        }
        const firstTraderId = traders.value[0]?.id;
        const traderId = traders.value.some((t) => t.id === values.trader)
          ? values.trader
          : firstTraderId;
        if (traderId && traderId !== preferencesStore.getTaskTraderView) {
          preferencesStore.setTaskTraderView(traderId);
        }
      }
      if (values.sort !== preferencesStore.getTaskSortMode) {
        preferencesStore.setTaskSortMode(values.sort as import('@/types/taskSort').TaskSortMode);
      }
      if (values.sortDir !== preferencesStore.getTaskSortDirection) {
        preferencesStore.setTaskSortDirection(
          values.sortDir as import('@/types/taskSort').TaskSortDirection
        );
      }
    },
    onStoreToRoute: () => ({
      view: getTaskPrimaryView.value,
      status: getTaskSecondaryView.value,
      map: getTaskMapView.value,
      trader: getTaskTraderView.value,
      sort: getTaskSortMode.value,
      sortDir: getTaskSortDirection.value,
    }),
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run app/composables/__tests__/useTaskRouteSync.test.ts`
Expected: PASS (both the existing merged-map test and the new status test)

**Step 5: Commit**

```bash
git add app/composables/useTaskRouteSync.ts app/composables/__tests__/useTaskRouteSync.test.ts
git commit -m "refactor(tasks): rewrite useTaskRouteSync to use useRouteFilters

Adds status, sort, and sortDir URL params. Retains merged-map resolution."
```

---

## Task 5: Rewrite `useNeededItemsRouteSync` to use `useRouteFilters`

**Files:**

- Modify: `app/composables/useNeededItemsRouteSync.ts`
- Modify: `app/composables/__tests__/useNeededItemsRouteSync.test.ts`

**Step 1: Update tests**

Update the mock store in the test to include `getNeededItemsSortBy`, `getNeededItemsSortDirection`, `setNeededItemsSortBy`, `setNeededItemsSortDirection`. Add a new test for sort param sync:

```ts
it('syncs sort query param to active state on init', async () => {
  applyRouteQuery({ type: 'all', sort: 'name' });
  const activeFilter = ref<NeededItemsFilterType>('all');
  const wrapper = await mountHarness(activeFilter);
  await flushRouteSync();
  // sort should have been synced to store (verify via mock)
  wrapper.unmount();
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run app/composables/__tests__/useNeededItemsRouteSync.test.ts`
Expected: FAIL

**Step 3: Rewrite `useNeededItemsRouteSync`**

```ts
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
        serialize: (v) => v,
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run app/composables/__tests__/useNeededItemsRouteSync.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/composables/useNeededItemsRouteSync.ts app/composables/__tests__/useNeededItemsRouteSync.test.ts
git commit -m "refactor(neededitems): rewrite useNeededItemsRouteSync to use useRouteFilters

Adds sort and sortDir URL params."
```

---

## Task 6: Create `useHideoutRouteSync`

**Files:**

- Create: `app/composables/useHideoutRouteSync.ts`
- Create: `app/composables/__tests__/useHideoutRouteSync.test.ts`

**Step 1: Write the failing test**

Create `app/composables/__tests__/useHideoutRouteSync.test.ts`:

```ts
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive } from 'vue';

type QueryRecord = Record<string, string | undefined>;

const routeState = reactive({
  query: reactive<QueryRecord>({}),
});

const applyRouteQuery = (query: QueryRecord) => {
  Object.keys(routeState.query).forEach((key) => {
    routeState.query[key] = undefined;
  });
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      routeState.query[key] = value;
    }
  });
};

const push = vi.fn(async ({ query }: { query: QueryRecord }) => {
  applyRouteQuery(query);
});
const replace = vi.fn(async ({ query }: { query: QueryRecord }) => {
  applyRouteQuery(query);
});

mockNuxtImport('useRoute', () => () => routeState);
mockNuxtImport('useRouter', () => () => ({
  push,
  replace,
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
  afterEach: vi.fn(),
}));

const storeState = reactive({
  hideoutPrimaryView: 'available',
});

const setHideoutPrimaryView = vi.fn((view: string) => {
  storeState.hideoutPrimaryView = view;
});

const flushRouteSync = async () => {
  await vi.advanceTimersByTimeAsync(250);
  await nextTick();
};

describe('useHideoutRouteSync', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    storeState.hideoutPrimaryView = 'available';
    applyRouteQuery({});

    vi.doMock('pinia', async () => {
      const actual = await vi.importActual<typeof import('pinia')>('pinia');
      return {
        ...actual,
        storeToRefs: () => ({
          getHideoutPrimaryView: computed(() => storeState.hideoutPrimaryView),
        }),
      };
    });

    vi.doMock('@/stores/usePreferences', () => ({
      usePreferencesStore: () => ({
        get getHideoutPrimaryView() {
          return storeState.hideoutPrimaryView;
        },
        setHideoutPrimaryView,
      }),
    }));

    vi.doMock('@/utils/logger', () => ({
      logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('populates URL with stored view when no query param present', async () => {
    storeState.hideoutPrimaryView = 'locked';
    const { useHideoutRouteSync } = await import('@/composables/useHideoutRouteSync');
    const TestHarness = defineComponent({
      setup() {
        useHideoutRouteSync();
        return () => h('div');
      },
    });
    const wrapper = mount(TestHarness);
    await flushRouteSync();
    expect(replace).toHaveBeenCalled();
    expect(routeState.query.view).toBe('locked');
    wrapper.unmount();
  });

  it('syncs URL view param to store on init', async () => {
    applyRouteQuery({ view: 'maxed' });
    const { useHideoutRouteSync } = await import('@/composables/useHideoutRouteSync');
    const TestHarness = defineComponent({
      setup() {
        useHideoutRouteSync();
        return () => h('div');
      },
    });
    const wrapper = mount(TestHarness);
    await flushRouteSync();
    expect(setHideoutPrimaryView).toHaveBeenCalledWith('maxed');
    wrapper.unmount();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run app/composables/__tests__/useHideoutRouteSync.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Write minimal implementation**

Create `app/composables/useHideoutRouteSync.ts`:

```ts
import { storeToRefs } from 'pinia';
import { useRouteFilters } from '@/composables/useRouteFilters';
import { usePreferencesStore } from '@/stores/usePreferences';
import type { HideoutPrimaryView } from '@/composables/useHideoutFiltering';

const HIDEOUT_PRIMARY_VIEWS = ['available', 'maxed', 'locked', 'all'] as const;

const isValidHideoutView = (value: string): value is HideoutPrimaryView =>
  HIDEOUT_PRIMARY_VIEWS.includes(value as HideoutPrimaryView);

type HideoutRouteParams = {
  view: string;
};

export function useHideoutRouteSync() {
  const preferencesStore = usePreferencesStore();
  const { getHideoutPrimaryView } = storeToRefs(preferencesStore);

  return useRouteFilters<HideoutRouteParams>({
    configs: {
      view: {
        key: 'view',
        default: 'available',
        validate: isValidHideoutView,
        serialize: (v) => (v === 'available' ? undefined : v),
        deserialize: (v) => v,
      },
    },
    onRouteToStore: (values) => {
      if (values.view !== preferencesStore.getHideoutPrimaryView) {
        preferencesStore.setHideoutPrimaryView(values.view);
      }
    },
    onStoreToRoute: () => ({
      view: getHideoutPrimaryView.value,
    }),
    watchSources: [getHideoutPrimaryView],
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run app/composables/__tests__/useHideoutRouteSync.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/composables/useHideoutRouteSync.ts app/composables/__tests__/useHideoutRouteSync.test.ts
git commit -m "feat(hideout): add useHideoutRouteSync for URL filter state"
```

---

## Task 7: Integrate `useHideoutRouteSync` into hideout page

**Files:**

- Modify: `app/pages/hideout.vue`

**Step 1: No new test needed**

The hideout page test (if one exists) should still pass. The `useHideoutRouteSync` is already tested in isolation. Integration is a one-line addition.

**Step 2: Add the composable call**

In `app/pages/hideout.vue`, in the `<script setup>` block, after the `useHideoutFiltering()` call (around line 256), add:

```ts
useHideoutRouteSync();
```

Since this is a Nuxt auto-imported composable (lives in `app/composables/`), no import statement is needed.

**Important:** The hideout page currently uses `route.query.station` and `route.query.module` for deep linking to specific stations. The `useHideoutRouteSync` only manages the `view` query param and won't interfere — `useRouteFilters` preserves unrecognized query keys in `buildQuery` via the spread of `currentQuery`. However, verify the station deep-link logic at line 374-391 still works since it calls `router.replace({ path: '/hideout', query: {} })` which clears all query params. This is existing behavior and acceptable — it clears the station param after scrolling to it.

**Step 3: Run the app and verify**

Run: `npm run build` to confirm no build errors.
Navigate to `/hideout?view=locked` and verify the locked view is shown.
Navigate to `/hideout` with no params and verify the URL updates to reflect the stored view.

**Step 4: Commit**

```bash
git add app/pages/hideout.vue
git commit -m "feat(hideout): integrate URL filter sync into hideout page"
```

---

## Task 8: Run full test suite and format

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Format**

Run: `npm run format`

**Step 3: Build check**

Run: `npm run build`
Expected: No errors

**Step 4: Final commit if formatting changed anything**

```bash
git add -A
git commit -m "chore: format after url filter state refactor"
```
