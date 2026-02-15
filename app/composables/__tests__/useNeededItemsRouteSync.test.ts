import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, isRef, nextTick, reactive, ref } from 'vue';
import type { NeededItemsFilterType } from '@/features/neededitems/neededitems-constants';
import type { Ref } from 'vue';
type QueryRecord = Record<string, string | undefined>;
type RouteState = {
  query: QueryRecord;
};
const routeState = reactive({
  query: reactive<QueryRecord>({}),
}) as RouteState;
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
  neededItemsSortBy: 'priority',
  neededItemsSortDirection: 'desc',
});
const setNeededItemsSortBy = vi.fn((sortBy: string) => {
  storeState.neededItemsSortBy = sortBy;
});
const setNeededItemsSortDirection = vi.fn((direction: string) => {
  storeState.neededItemsSortDirection = direction;
});
const flushRouteSync = async () => {
  await vi.advanceTimersByTimeAsync(250);
  await nextTick();
};
const mountHarness = async (activeFilter: Ref<NeededItemsFilterType>) => {
  const { useNeededItemsRouteSync } = await import('@/composables/useNeededItemsRouteSync');
  const TestHarness = defineComponent({
    setup() {
      useNeededItemsRouteSync({ activeFilter });
      return () => h('div');
    },
  });
  return mount(TestHarness);
};
describe('useNeededItemsRouteSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    storeState.neededItemsSortBy = 'priority';
    storeState.neededItemsSortDirection = 'desc';
    applyRouteQuery({});
    vi.doMock('pinia', async () => {
      const actual = await vi.importActual<typeof import('pinia')>('pinia');
      return {
        ...actual,
        storeToRefs: (store: Record<string, unknown>) => {
          const refs: Record<string, unknown> = {};
          Object.entries(store).forEach(([key, value]) => {
            if (typeof value === 'function') return;
            refs[key] = isRef(value) ? value : computed(() => store[key]);
          });
          return refs;
        },
      };
    });
    vi.doMock('@/stores/usePreferences', () => ({
      usePreferencesStore: () => ({
        get getNeededItemsSortBy() {
          return storeState.neededItemsSortBy;
        },
        get getNeededItemsSortDirection() {
          return storeState.neededItemsSortDirection;
        },
        setNeededItemsSortBy,
        setNeededItemsSortDirection,
      }),
    }));
    vi.doMock('@/utils/logger', () => ({
      logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('hydrates active filter from route query', async () => {
    applyRouteQuery({ type: 'hideout' });
    const activeFilter = ref<NeededItemsFilterType>('all');
    const wrapper = await mountHarness(activeFilter);
    await flushRouteSync();
    expect(activeFilter.value).toBe('hideout');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('normalizes missing filter query using the current active filter', async () => {
    const activeFilter = ref<NeededItemsFilterType>('tasks');
    const wrapper = await mountHarness(activeFilter);
    await flushRouteSync();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(routeState.query.type).toBe('tasks');
    wrapper.unmount();
  });
  it('pushes query updates when active filter changes', async () => {
    applyRouteQuery({ type: 'all' });
    const activeFilter = ref<NeededItemsFilterType>('all');
    const wrapper = await mountHarness(activeFilter);
    await flushRouteSync();
    vi.clearAllMocks();
    activeFilter.value = 'tasks';
    await flushRouteSync();
    expect(push).toHaveBeenCalledTimes(1);
    expect(routeState.query.type).toBe('tasks');
    wrapper.unmount();
  });
  it('syncs sort query param to store on init', async () => {
    applyRouteQuery({ type: 'all', sort: 'name' });
    const activeFilter = ref<NeededItemsFilterType>('all');
    const wrapper = await mountHarness(activeFilter);
    await flushRouteSync();
    expect(setNeededItemsSortBy).toHaveBeenCalledWith('name');
    wrapper.unmount();
  });
});
