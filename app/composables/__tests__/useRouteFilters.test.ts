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
