import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive, ref } from 'vue';
import type { UseRouteFiltersOptions } from '@/composables/useRouteFilters';
import type { Ref } from 'vue';
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
const viewConfig = {
  default: 'all',
  validate: (v: string) => ['all', 'maps'].includes(v),
};
const mountFilters = async <TMap extends Record<string, unknown>>(
  options: Partial<UseRouteFiltersOptions<TMap>> & Pick<UseRouteFiltersOptions<TMap>, 'configs'>
) => {
  const { useRouteFilters } = await import('@/composables/useRouteFilters');
  const TestHarness = defineComponent({
    setup() {
      useRouteFilters<TMap>({
        onRouteToStore: vi.fn(),
        onStoreToRoute: () => ({}),
        watchSources: [],
        ...options,
      });
      return () => h('div');
    },
  });
  const wrapper = mount(TestHarness);
  await flushRouteSync();
  return wrapper;
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
    const wrapper = await mountFilters({
      configs: { view: viewConfig },
      onRouteToStore,
      onStoreToRoute: () => ({ view: 'maps' }),
    });
    expect(replace).toHaveBeenCalled();
    expect(routeState.query.view).toBe('maps');
    expect(onRouteToStore).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('deserializes URL params into store on init when params present', async () => {
    applyRouteQuery({ view: 'maps' });
    const onRouteToStore = vi.fn();
    const wrapper = await mountFilters({
      configs: { view: viewConfig },
      onRouteToStore,
      onStoreToRoute: () => ({ view: 'all' }),
    });
    expect(onRouteToStore).toHaveBeenCalledWith({ view: 'maps' });
    wrapper.unmount();
  });
  it('ignores invalid URL params and falls back to defaults', async () => {
    applyRouteQuery({ view: 'INVALID' });
    const onRouteToStore = vi.fn();
    const wrapper = await mountFilters({
      configs: { view: viewConfig },
      onRouteToStore,
      onStoreToRoute: () => ({ view: 'all' }),
    });
    expect(onRouteToStore).toHaveBeenCalledWith({ view: 'all' });
    wrapper.unmount();
  });
  it('omits default values from the URL and preserves unrelated query params', async () => {
    applyRouteQuery({ other: 'keep' });
    const view: Ref<string> = ref('maps');
    const wrapper = await mountFilters({
      configs: { view: viewConfig },
      onStoreToRoute: () => ({ view: view.value }),
      watchSources: [view],
    });
    expect(routeState.query).toMatchObject({ view: 'maps', other: 'keep' });
    view.value = 'all';
    await flushRouteSync();
    expect(push).toHaveBeenLastCalledWith({ query: { other: 'keep', view: undefined } });
    expect(routeState.query.view).toBeUndefined();
    wrapper.unmount();
  });
  it('uses an explicit key override for reading and writing the URL', async () => {
    applyRouteQuery({ sortDir: 'maps' });
    const onRouteToStore = vi.fn();
    const wrapper = await mountFilters({
      configs: { direction: { ...viewConfig, key: 'sortDir' } },
      onRouteToStore,
      onStoreToRoute: () => ({ direction: 'all' }),
    });
    expect(onRouteToStore).toHaveBeenCalledWith({ direction: 'maps' });
    expect(routeState.query.direction).toBeUndefined();
    wrapper.unmount();
  });
  it('applies custom serialize and deserialize while still omitting the default', async () => {
    applyRouteQuery({ page: 'p3' });
    const onRouteToStore = vi.fn();
    const page: Ref<number> = ref(3);
    const wrapper = await mountFilters<{ page: number }>({
      configs: {
        page: {
          default: 1,
          validate: (v) => /^p\d+$/.test(v),
          serialize: (v) => `p${v}`,
          deserialize: (v) => Number(v.slice(1)),
        },
      },
      onRouteToStore,
      onStoreToRoute: () => ({ page: page.value }),
      watchSources: [page],
    });
    expect(onRouteToStore).toHaveBeenCalledWith({ page: 3 });
    page.value = 5;
    await flushRouteSync();
    expect(routeState.query.page).toBe('p5');
    page.value = 1;
    await flushRouteSync();
    expect(routeState.query.page).toBeUndefined();
    wrapper.unmount();
  });
  it('re-applies the current route to the store when reapplyRouteOn sources change', async () => {
    applyRouteQuery({ view: 'maps' });
    const store = { view: 'all' };
    const onRouteToStore = vi.fn((values: { view: string }) => {
      store.view = values.view;
    });
    const loaded = ref(false);
    const wrapper = await mountFilters({
      configs: { view: viewConfig },
      onRouteToStore,
      onStoreToRoute: () => ({ view: store.view }),
      reapplyRouteOn: [loaded],
    });
    expect(onRouteToStore).toHaveBeenCalledTimes(1);
    loaded.value = true;
    await flushRouteSync();
    expect(onRouteToStore).toHaveBeenCalledTimes(2);
    expect(onRouteToStore).toHaveBeenLastCalledWith({ view: 'maps' });
    expect(push).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
