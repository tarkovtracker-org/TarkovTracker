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
