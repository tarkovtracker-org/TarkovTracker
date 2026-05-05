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
}) => {
  const {
    neededItem = createDefaultNeededItem(),
    viewMode = 'list',
    groupByItem = false,
    itemsLoading = false,
    emptyState = false,
  } = options;
  const items = emptyState || !neededItem ? [] : [neededItem];
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
  const cardStyleRef = ref<'compact' | 'expanded'>('compact');
  return {
    activeFilter: ref('all'),
    allItems: computed(() => items),
    cardStyle: cardStyleRef,
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
const createMockUseNeededItems = (options: {
  neededItem?: NeededItemTaskObjective | null;
  viewMode?: 'list' | 'grid';
  groupByItem?: boolean;
  itemsLoading?: boolean;
  emptyState?: boolean;
}) => {
  const state = createMockNeededItemsState(options);
  return {
    state,
    useNeededItems: () => state,
  };
};
const setup = async (
  options: {
    neededItem?: NeededItemTaskObjective | null;
    viewMode?: 'list' | 'grid';
    groupByItem?: boolean;
    itemsLoading?: boolean;
    emptyState?: boolean;
  } = {}
) => {
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
      belowMd: ref(false),
      lgAndUp: ref(true),
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
    props: ['need', 'itemStyle'],
    template: '<div data-testid="needed-item" :data-style="itemStyle" />',
  },
  NeededItemGroupedCard: {
    props: ['groupedItem'],
    template: '<div data-testid="grouped-item" />',
  },
  UCard: { template: '<div><slot /></div>' },
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
    it('renders list style items in list view mode', async () => {
      const { NeededItemsPage } = await setup({ viewMode: 'list' });
      const wrapper = await mountSuspended(NeededItemsPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
      const items = wrapper.findAll('[data-testid="needed-item"]');
      expect(items.length).toBeGreaterThan(0);
      items.forEach((item) => {
        expect(item.attributes('data-style')).toBe('row');
      });
    });
    it('renders card style items in grid view mode', async () => {
      const { NeededItemsPage } = await setup({ viewMode: 'grid' });
      const wrapper = await mountSuspended(NeededItemsPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
      const items = wrapper.findAll('[data-testid="needed-item"]');
      expect(items.length).toBeGreaterThan(0);
      items.forEach((item) => {
        expect(item.attributes('data-style')).toBe('card');
      });
    });
  });
  it('tracks the initial needed items view on page load', async () => {
    const { NeededItemsPage } = await setup({ viewMode: 'grid' });
    await mountSuspended(NeededItemsPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(trackNeededItemsViewMock).toHaveBeenCalledWith({
      cardStyle: 'compact',
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
      cardStyle: undefined,
      previousView: undefined,
      source: 'page_load',
      view: 'combined',
    });
    state.viewMode.value = 'grid';
    state.groupByItem.value = false;
    await nextTick();
    expect(trackNeededItemsViewMock).toHaveBeenCalledTimes(2);
    expect(trackNeededItemsViewMock).toHaveBeenNthCalledWith(2, {
      cardStyle: 'compact',
      previousView: 'combined',
      source: 'change',
      view: 'grid',
    });
  });
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
