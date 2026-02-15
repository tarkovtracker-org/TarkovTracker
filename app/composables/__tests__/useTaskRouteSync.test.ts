import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, isRef, nextTick, reactive, ref } from 'vue';
import type { TarkovMap, Trader } from '@/types/tarkov';
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
  taskMapView: 'all',
  taskPrimaryView: 'all',
  taskTraderView: 'all',
  taskSecondaryView: 'available',
  taskSortMode: 'impact',
  taskSortDirection: 'desc',
});
const setTaskPrimaryView = vi.fn((view: string) => {
  storeState.taskPrimaryView = view;
});
const setTaskMapView = vi.fn((view: string) => {
  storeState.taskMapView = view;
});
const setTaskTraderView = vi.fn((view: string) => {
  storeState.taskTraderView = view;
});
const setTaskSecondaryView = vi.fn((view: string) => {
  storeState.taskSecondaryView = view;
});
const setTaskSortMode = vi.fn((mode: string) => {
  storeState.taskSortMode = mode;
});
const setTaskSortDirection = vi.fn((dir: string) => {
  storeState.taskSortDirection = dir;
});
const loggerMock = {
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};
const flushRouteSync = async () => {
  await vi.advanceTimersByTimeAsync(200);
  await nextTick();
};
describe('useTaskRouteSync', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    storeState.taskPrimaryView = 'all';
    storeState.taskMapView = 'all';
    storeState.taskTraderView = 'all';
    storeState.taskSecondaryView = 'available';
    storeState.taskSortMode = 'impact';
    storeState.taskSortDirection = 'desc';
    applyRouteQuery({
      map: '6733700029c367a3d40b02af',
      view: 'maps',
    });
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
        get getTaskMapView() {
          return storeState.taskMapView;
        },
        get getTaskPrimaryView() {
          return storeState.taskPrimaryView;
        },
        get getTaskTraderView() {
          return storeState.taskTraderView;
        },
        get getTaskSecondaryView() {
          return storeState.taskSecondaryView;
        },
        get getTaskSortMode() {
          return storeState.taskSortMode;
        },
        get getTaskSortDirection() {
          return storeState.taskSortDirection;
        },
        setTaskMapView,
        setTaskPrimaryView,
        setTaskTraderView,
        setTaskSecondaryView,
        setTaskSortMode,
        setTaskSortDirection,
      }),
    }));
    vi.doMock('@/utils/logger', () => ({
      logger: loggerMock,
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('preserves pending map query and resolves merged ids once maps load', async () => {
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
    expect(routeState.query.map).toBe('6733700029c367a3d40b02af');
    expect(push).not.toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
    maps.value = [
      {
        id: '5704e5fc2459771a4e3b4ad8',
        mergedIds: ['6733700029c367a3d40b02af', '5704e5fc2459771a4e3b4ad8'],
        name: 'Ground Zero',
      } as unknown as TarkovMap,
    ];
    await nextTick();
    await flushRouteSync();
    expect(setTaskMapView).toHaveBeenCalledWith('5704e5fc2459771a4e3b4ad8');
    expect(routeState.query.map).toBe('5704e5fc2459771a4e3b4ad8');
    expect(push.mock.calls.length + replace.mock.calls.length).toBeGreaterThan(0);
    wrapper.unmount();
  });
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
});
