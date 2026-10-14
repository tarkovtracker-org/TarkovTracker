import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, isRef, nextTick, reactive, ref, watch } from 'vue';
import type { TarkovMap, Trader } from '@/types/tarkov';
import type { Ref } from 'vue';
type QueryRecord = Record<string, string | undefined>;
type RouteState = {
  path: string;
  query: QueryRecord;
};
const routeState = reactive({
  path: '/tasks',
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
const setRoute = (path: string, query: QueryRecord) => {
  routeState.path = path;
  applyRouteQuery(query);
};
const push = vi.fn(async ({ query }: { query: QueryRecord }) => {
  applyRouteQuery(query);
});
const replace = vi.fn(async ({ query }: { query: QueryRecord }) => {
  applyRouteQuery(query);
});
mockNuxtImport('useRoute', () => () => routeState);
mockNuxtImport('useRouter', () => () => ({
  currentRoute: { value: routeState },
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
const mountWithTraderFallback = async (traders: Ref<Trader[]>) => {
  const { useTaskRouteSync } = await import('@/composables/useTaskRouteSync');
  const TestHarness = defineComponent({
    setup() {
      watch(
        [() => storeState.taskPrimaryView, traders, () => storeState.taskTraderView],
        ([view, list, selected]) => {
          if (view !== 'traders' || list.some((t) => t.id === selected)) return;
          if (list[0]) setTaskTraderView(list[0].id);
        },
        { immediate: true }
      );
      useTaskRouteSync({ maps: ref<TarkovMap[]>([]), traders });
      return () => h('div');
    },
  });
  return mount(TestHarness);
};
const loadedTraders = [
  { id: 'trader-1', name: 'One' } as Trader,
  { id: 'trader-2', name: 'Two' } as Trader,
];
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
    setRoute('/tasks/maps', { map: '6733700029c367a3d40b02af' });
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
          return storeState.taskPrimaryView === 'graph' ? 'all' : storeState.taskSecondaryView;
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
    setRoute('/tasks', { status: 'locked' });
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
  it('preserves the stored status filter when graph view is loaded', async () => {
    setRoute('/tasks/graph', { status: 'available' });
    const maps = ref<TarkovMap[]>([]);
    const traders = ref<Trader[]>([{ id: 'trader-1', name: 'Trader One' } as Trader]);
    const { useTaskRouteSync } = await import('@/composables/useTaskRouteSync');
    const TestHarness = defineComponent({
      setup() {
        useTaskRouteSync({ maps, traders });
        return () => h('div');
      },
    });
    const wrapper = mount(TestHarness);
    await flushRouteSync();
    expect(setTaskPrimaryView).toHaveBeenCalledWith('graph');
    expect(setTaskSecondaryView).not.toHaveBeenCalled();
    expect(storeState.taskSecondaryView).toBe('available');
    expect(routeState.query.status).toBe('all');
    wrapper.unmount();
  });
  it('falls back to the first trader and syncs sort params from the route', async () => {
    setRoute('/tasks/traders', { trader: 'unknown', sort: 'alphabetical', sortDir: 'asc' });
    const maps = ref<TarkovMap[]>([]);
    const traders = ref<Trader[]>([
      { id: 'trader-1', name: 'Trader One' } as Trader,
      { id: 'trader-2', name: 'Trader Two' } as Trader,
    ]);
    const { useTaskRouteSync } = await import('@/composables/useTaskRouteSync');
    const TestHarness = defineComponent({
      setup() {
        useTaskRouteSync({ maps, traders });
        return () => h('div');
      },
    });
    const wrapper = mount(TestHarness);
    await flushRouteSync();
    expect(setTaskTraderView).toHaveBeenCalledWith('trader-1');
    expect(setTaskSortMode).toHaveBeenCalledWith('alphabetical');
    expect(setTaskSortDirection).toHaveBeenCalledWith('asc');
    expect(setTaskMapView).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('preserves pending trader query until traders load', async () => {
    setRoute('/tasks/traders', { trader: 'trader-2' });
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
    expect(setTaskTraderView).not.toHaveBeenCalled();
    expect(routeState.query.trader).toBe('trader-2');
    expect(loggerMock.debug).toHaveBeenCalledWith(
      '[useTaskRouteSync] Delaying trader sync until traders loaded.'
    );
    traders.value = [
      { id: 'trader-1', name: 'Trader One' } as Trader,
      { id: 'trader-2', name: 'Trader Two' } as Trader,
    ];
    await nextTick();
    await flushRouteSync();
    expect(setTaskTraderView).toHaveBeenCalledWith('trader-2');
    expect(routeState.query.trader).toBe('trader-2');
    wrapper.unmount();
  });
  it('applies a pending non-first map query once maps load', async () => {
    setRoute('/tasks/maps', { map: 'map-2' });
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
    maps.value = [
      { id: 'map-1', name: 'Map One' } as TarkovMap,
      { id: 'map-2', name: 'Map Two' } as TarkovMap,
    ];
    await nextTick();
    await flushRouteSync();
    expect(setTaskMapView).toHaveBeenCalledTimes(1);
    expect(setTaskMapView).toHaveBeenCalledWith('map-2');
    expect(routeState.query.map).toBe('map-2');
    wrapper.unmount();
  });
  it('keeps a pending trader deep link when another watcher selects a fallback trader', async () => {
    setRoute('/tasks/traders', { trader: 'trader-2' });
    const traders = ref<Trader[]>([]);
    const wrapper = await mountWithTraderFallback(traders);
    await flushRouteSync();
    traders.value = loadedTraders;
    await nextTick();
    await flushRouteSync();
    expect(storeState.taskTraderView).toBe('trader-2');
    expect(routeState.query.trader).toBe('trader-2');
    wrapper.unmount();
  });
  it('syncs the fallback trader to the route when the deep-linked trader is unknown', async () => {
    setRoute('/tasks/traders', { trader: 'missing' });
    const traders = ref<Trader[]>([]);
    const wrapper = await mountWithTraderFallback(traders);
    await flushRouteSync();
    traders.value = loadedTraders;
    await nextTick();
    await flushRouteSync();
    expect(storeState.taskTraderView).toBe('trader-1');
    expect(routeState.query.trader).toBe('trader-1');
    wrapper.unmount();
  });
  const mountRouteSync = async () => {
    const { useTaskRouteSync } = await import('@/composables/useTaskRouteSync');
    const TestHarness = defineComponent({
      setup() {
        useTaskRouteSync({ maps: ref<TarkovMap[]>([]), traders: ref<Trader[]>(loadedTraders) });
        return () => h('div');
      },
    });
    return mount(TestHarness);
  };
  it.each([
    ['/tasks/maps', 'all', 'maps'],
    ['/tasks/graph', 'traders', 'graph'],
    ['/tasks/traders', 'all', 'traders'],
    ['/tasks', 'traders', 'all'],
    ['/tasks', 'maps', 'all'],
    ['/tasks/', 'graph', 'all'],
  ])('derives the view from %s when the stored view is %s', async (path, stored, expected) => {
    storeState.taskPrimaryView = stored;
    setRoute(path, {});
    const wrapper = await mountRouteSync();
    await flushRouteSync();
    expect(storeState.taskPrimaryView).toBe(expected);
    expect(routeState.query.view).toBeUndefined();
    wrapper.unmount();
  });
  it('shows every trader on the list route', async () => {
    storeState.taskPrimaryView = 'traders';
    storeState.taskTraderView = 'trader-2';
    setRoute('/tasks', {});
    const wrapper = await mountRouteSync();
    await flushRouteSync();
    expect(storeState.taskPrimaryView).toBe('all');
    expect(routeState.query.trader).toBeUndefined();
    expect(routeState.query.map).toBeUndefined();
    wrapper.unmount();
  });
});
