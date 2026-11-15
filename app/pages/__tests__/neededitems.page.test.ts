import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import type { NeededItemTaskObjective } from '@/types/tarkov';
import { createDefaultNeededItem } from '#tests/test-helpers/mockStores';
let useInfiniteScrollMock = vi.fn();
let trackNeededItemsViewMock = vi.fn();
const createMockNeededItemsState = (options: {
  neededItem?: NeededItemTaskObjective | null;
  viewMode?: 'list' | 'grid';
  groupByItem?: boolean;
  itemsLoading?: boolean;
  emptyState?: boolean;
  itemCount?: number;
}) => {
  const {
    neededItem = createDefaultNeededItem(),
    viewMode = 'list',
    groupByItem = false,
    itemsLoading = false,
    emptyState = false,
    itemCount = 1,
  } = options;
  const items =
    emptyState || !neededItem
      ? []
      : Array.from({ length: itemCount }, (_, index) => ({
          ...neededItem,
          id: index ? `${neededItem.id}-${index}` : neededItem.id,
        }));
  const groupedItems = computed(() =>
    emptyState
      ? []
      : [
          {
            item: { id: 'item-1', name: 'Test Item' },
            taskFir: 0,
            taskFirCurrent: 0,
            taskNonFir: 1,
            taskNonFirCurrent: 0,
            hideoutFir: 0,
            hideoutFirCurrent: 0,
            hideoutNonFir: 0,
            hideoutNonFirCurrent: 0,
            total: 1,
            currentCount: 0,
          },
        ]
  );
  const groupByItemRef = ref(groupByItem);
  const viewModeRef = ref(viewMode);
  return {
    activeFilter: ref('all'),
    allItems: computed(() => items),
    displayItems: computed(() => (groupByItemRef.value ? groupedItems.value : items)),
    ensureNeededItemsData: vi.fn(),
    filteredItems: computed(() => items),
    filterTabsWithCounts: computed(() => [
      { label: 'All', value: 'all', icon: 'i-mdi-clipboard-list', count: items.length },
      {
        label: 'Tasks',
        value: 'tasks',
        icon: 'i-mdi-checkbox-marked-circle-outline',
        count: items.length,
      },
      { label: 'Hideout', value: 'hideout', icon: 'i-mdi-home', count: 0 },
      { label: 'Completed', value: 'completed', icon: 'i-mdi-check-all', count: 0 },
    ]),
    firFilter: ref('all'),
    groupByItem: groupByItemRef,
    groupedItems,
    groupedNeedCount: computed(() => items.length),
    hideNonFirSpecialEquipment: ref(false),
    hideOwned: ref(false),
    hideTeamItems: ref(false),
    itemsError: computed(() => null),
    itemsFullLoaded: computed(() => true),
    itemsReady: computed(() => !itemsLoading),
    kappaOnly: ref(false),
    objectivesByItemId: computed(() => new Map()),
    queueFullItemsLoad: vi.fn(),
    sortBy: ref('priority'),
    sortDirection: ref('desc'),
    viewMode: viewModeRef,
  };
};
type SetupOptions = Parameters<typeof createMockNeededItemsState>[0] & { belowMd?: boolean };
const createMockUseNeededItems = (options: SetupOptions) => {
  const state = createMockNeededItemsState(options);
  return {
    state,
    useNeededItems: () => state,
  };
};
const setup = async (options: SetupOptions = {}) => {
  vi.resetModules();
  useInfiniteScrollMock = vi.fn(() => ({ checkAndLoadMore: vi.fn() }));
  trackNeededItemsViewMock = vi.fn();
  const { state, useNeededItems } = createMockUseNeededItems(options);
  vi.doMock('@/composables/useNeededItems', () => ({
    useNeededItems,
  }));
  vi.doMock('@/composables/useInfiniteScroll', () => ({
    useInfiniteScroll: useInfiniteScrollMock,
  }));
  vi.doMock('@/composables/useNeededItemsRouteSync', () => ({
    useNeededItemsRouteSync: vi.fn(),
  }));
  vi.doMock('@/composables/useSharedBreakpoints', () => ({
    useSharedBreakpoints: () => ({
      belowMd: ref(options.belowMd ?? false),
      lgAndUp: ref(!options.belowMd),
      xs: ref(false),
    }),
  }));
  vi.doMock('@/composables/useProductAnalytics', () => ({
    useProductAnalytics: () => ({
      trackNeededItemsView: trackNeededItemsViewMock,
    }),
  }));
  const { default: NeededItemsPage } = await import('@/pages/needed-items.vue');
  return { NeededItemsPage, state };
};
const defaultGlobalStubs = {
  NeededItemsFilterBar: { template: '<div data-testid="filter-bar" />' },
  NeededItem: {
    props: ['need', 'layout'],
    template: '<div data-testid="needed-item" :data-layout="layout" />',
  },
  NeededItemGroupEntry: {
    props: ['group', 'layout'],
    template: '<div data-testid="grouped-item" :data-layout="layout" />',
  },
  UIcon: true,
};
describe('needed items page', () => {
  it('renders needed items list view', async () => {
    const { NeededItemsPage } = await setup({ viewMode: 'list' });
    const wrapper = await mountSuspended(NeededItemsPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
    const items = wrapper.findAll('[data-testid="needed-item"]');
    expect(items.length).toBeGreaterThan(0);
    expect(wrapper.find('[data-testid="grouped-item"]').exists()).toBe(false);
  });
  it('renders needed items grid view', async () => {
    const { NeededItemsPage } = await setup({ viewMode: 'grid' });
    const wrapper = await mountSuspended(NeededItemsPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
    const items = wrapper.findAll('[data-testid="needed-item"]');
    expect(items.length).toBeGreaterThan(0);
    expect(wrapper.find('[data-testid="grouped-item"]').exists()).toBe(false);
  });
  it('renders grouped view when groupByItem is enabled', async () => {
    const { NeededItemsPage } = await setup({ groupByItem: true });
    const wrapper = await mountSuspended(NeededItemsPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
    const groupedItems = wrapper.findAll('[data-testid="grouped-item"]');
    expect(groupedItems.length).toBeGreaterThan(0);
  });
  it('passes the grouped need count, not the ungrouped list length, as the grouped total', async () => {
    const { NeededItemsPage, state } = await setup({ groupByItem: true });
    // Teammate-only needs stay in filteredItems but are not folded into any group.
    Object.assign(state, { groupedNeedCount: computed(() => 7) });
    const wrapper = await mountSuspended(NeededItemsPage, {
      global: {
        stubs: {
          ...defaultGlobalStubs,
          NeededItemsFilterBar: {
            props: ['ungroupedCount'],
            template: '<div data-testid="filter-bar" :data-ungrouped="ungroupedCount" />',
          },
        },
      },
    });
    expect(wrapper.find('[data-testid="filter-bar"]').attributes('data-ungrouped')).toBe('7');
  });
  describe('empty and loading states', () => {
    it('renders empty state when no items', async () => {
      const { NeededItemsPage } = await setup({ emptyState: true });
      const wrapper = await mountSuspended(NeededItemsPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
      const neededItems = wrapper.findAll('[data-testid="needed-item"]');
      expect(neededItems.length).toBe(0);
    });
    it('renders loading state', async () => {
      const { NeededItemsPage } = await setup({ itemsLoading: true });
      const wrapper = await mountSuspended(NeededItemsPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
    });
  });
  describe('view mode rendering', () => {
    it.each([
      { groupByItem: false, viewMode: 'list', testId: 'needed-item', layout: 'row' },
      { groupByItem: false, viewMode: 'grid', testId: 'needed-item', layout: 'tile' },
      { groupByItem: true, viewMode: 'list', testId: 'grouped-item', layout: 'row' },
      { groupByItem: true, viewMode: 'grid', testId: 'grouped-item', layout: 'tile' },
    ] as const)(
      'renders $testId entries as $layout tiles or rows in the $viewMode layout',
      async ({ groupByItem, viewMode, testId, layout }) => {
        const { NeededItemsPage } = await setup({ groupByItem, viewMode });
        const wrapper = await mountSuspended(NeededItemsPage, {
          global: { stubs: defaultGlobalStubs },
        });
        const entries = wrapper.findAll(`[data-testid="${testId}"]`);
        expect(entries.length).toBeGreaterThan(0);
        entries.forEach((entry) => expect(entry.attributes('data-layout')).toBe(layout));
      }
    );
  });
  it('tracks the initial needed items view on page load', async () => {
    const { NeededItemsPage } = await setup({ viewMode: 'grid' });
    await mountSuspended(NeededItemsPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(trackNeededItemsViewMock).toHaveBeenCalledWith({
      layout: 'grid',
      previousView: undefined,
      source: 'page_load',
      view: 'grid',
    });
  });
  it('tracks settled needed items view changes once per selection', async () => {
    const { NeededItemsPage, state } = await setup({ groupByItem: true, viewMode: 'list' });
    await mountSuspended(NeededItemsPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(trackNeededItemsViewMock).toHaveBeenNthCalledWith(1, {
      layout: 'list',
      previousView: undefined,
      source: 'page_load',
      view: 'combined',
    });
    state.viewMode.value = 'grid';
    state.groupByItem.value = false;
    await nextTick();
    expect(trackNeededItemsViewMock).toHaveBeenCalledTimes(2);
    expect(trackNeededItemsViewMock).toHaveBeenNthCalledWith(2, {
      layout: 'grid',
      previousView: 'combined',
      source: 'change',
      view: 'grid',
    });
    // Items in a grid is a distinct view now, so the layout switch alone is tracked.
    state.groupByItem.value = true;
    await nextTick();
    state.viewMode.value = 'list';
    await nextTick();
    expect(trackNeededItemsViewMock).toHaveBeenCalledTimes(4);
    expect(trackNeededItemsViewMock).toHaveBeenLastCalledWith({
      layout: 'list',
      previousView: 'combined',
      source: 'change',
      view: 'combined',
    });
  });
  it.each([
    { viewMode: 'list', belowMd: false, expected: 30 },
    { viewMode: 'grid', belowMd: false, expected: 24 },
    { viewMode: 'list', belowMd: true, expected: 15 },
    { viewMode: 'grid', belowMd: true, expected: 12 },
  ] as const)(
    'renders $expected $viewMode entries first (narrow screen: $belowMd)',
    async ({ viewMode, belowMd, expected }) => {
      const { NeededItemsPage } = await setup({ viewMode, belowMd, itemCount: 60 });
      const wrapper = await mountSuspended(NeededItemsPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.findAll('[data-testid="needed-item"]')).toHaveLength(expected);
    }
  );
  it('keeps grid infinite-scroll incremental to avoid heavy eager loading', async () => {
    const { NeededItemsPage } = await setup({ viewMode: 'grid' });
    await mountSuspended(NeededItemsPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(useInfiniteScrollMock).toHaveBeenCalled();
    const options = useInfiniteScrollMock.mock.calls[0]?.[2];
    expect(options).toMatchObject({
      autoFill: false,
      autoLoadOnReady: true,
      maxAutoLoadsPerScrollTrigger: 1,
    });
  });
});
