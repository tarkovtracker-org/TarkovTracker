# URL-Based Filter State Management

Issue: #101

## Problem

Filter state is persisted through the Pinia preferences store with localStorage. Two pages (tasks, needed-items) have partial URL sync via bespoke composables that duplicate ~80% of their logic. The hideout page has no URL sync at all. This limits shareability and creates inconsistent behavior.

## Decision

Replace the two ad-hoc route sync composables with a single generic `useRouteFilters` composable. Each page provides a declarative filter config. Only primary navigation filters go in the URL; toggle-style preferences stay in localStorage.

## Scope

### URL-synced filters (primary navigation)

**Tasks:** `view`, `status`, `map`, `trader`, `sort`, `sortDir`
**Needed Items:** `type`, `sort`, `sortDir`
**Hideout:** `view`

### localStorage-only (unchanged)

All toggle preferences: kappa-only, lightkeeper, hide-global, FIR filter, group-by, collapse-completed, prereq toggles, etc.

## Core Composable: `useRouteFilters`

```ts
type FilterParamConfig<T> = {
  key: string;
  default: T;
  validate: (raw: string) => boolean;
  serialize: (value: T) => string | undefined;
  deserialize: (raw: string) => T;
};

type UseRouteFiltersOptions<TMap extends Record<string, unknown>> = {
  configs: { [K in keyof TMap]: FilterParamConfig<TMap[K]> };
  onRouteToStore: (values: TMap) => void;
  onStoreToRoute: () => Partial<TMap>;
  watchSources: WatchSource[];
};

type UseRouteFiltersReturn = {
  isSyncingFromRoute: Ref<boolean>;
  isSyncingToRoute: Ref<boolean>;
};
```

### Sync behavior

1. **Page load, no URL params:** Read stored preferences via `onStoreToRoute`, `router.replace` them into the URL.
2. **Page load, URL params present:** URL wins. Deserialize, validate, call `onRouteToStore` to write into preferences store.
3. **User clicks filter (store changes):** `watchSources` triggers, serialize via `onStoreToRoute`, push/replace to URL. Use `push` when primary view changes (new history entry), `replace` for sub-filter changes within the same view.
4. **Browser back/forward:** Route query watcher fires, deserializes URL into store.
5. **Debounce:** 200ms on route-to-store sync direction.

## Per-Page Wrappers

### `useTaskRouteSync` (rewrite)

Calls `useRouteFilters` with task filter configs. Retains map ID resolution logic (merged maps, deferred loading).

Params: `view`, `status`, `map`, `trader`, `sort`, `sortDir`

### `useNeededItemsRouteSync` (rewrite)

Calls `useRouteFilters` with needed-items filter configs.

Params: `type`, `sort`, `sortDir`

### `useHideoutRouteSync` (new)

Calls `useRouteFilters` with hideout filter config.

Params: `view`

## Files

| File                                        | Action                                                       |
| ------------------------------------------- | ------------------------------------------------------------ |
| `composables/useRouteFilters.ts`            | Create                                                       |
| `composables/useTaskRouteSync.ts`           | Rewrite                                                      |
| `composables/useNeededItemsRouteSync.ts`    | Rewrite                                                      |
| `composables/useHideoutRouteSync.ts`        | Create                                                       |
| `pages/hideout.vue`                         | Add `useHideoutRouteSync()`                                  |
| `types/taskFilter.ts`                       | Add validators for secondary view, sort mode, sort direction |
| `__tests__/useRouteFilters.test.ts`         | Create                                                       |
| `__tests__/useTaskRouteSync.test.ts`        | Update                                                       |
| `__tests__/useNeededItemsRouteSync.test.ts` | Update                                                       |
| `__tests__/useHideoutRouteSync.test.ts`     | Create                                                       |

## Unchanged

- `useTaskFiltering`, `useHideoutFiltering` (consume store, not URL)
- `usePreferences` store (remains source of truth)
- All filter UI components (read/write store directly)
- `utils/routeHelpers.ts`
