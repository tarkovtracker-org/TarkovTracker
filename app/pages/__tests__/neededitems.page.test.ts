import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import type { NeededItemTaskObjective } from '@/types/tarkov';
import { createDefaultNeededItem } from '#tests/test-helpers/mockStores';
let useInfiniteScrollMock = vi.fn();
const createMockUseNeededItems = (options: {
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
  const grouped = computed(() =>
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
  return () => ({
    activeFilter: ref('all'),
    firFilter: ref('all'),
    groupByItem: ref(groupByItem),
    hideNonFirSpecialEquipment: ref(false),
    hideTeamItems: ref(false),
    kappaOnly: ref(false),
    hideOwned: ref(false),
    sortBy: ref('priority'),
    sortDirection: ref('desc'),
    viewMode: ref(viewMode),
    cardStyle: ref('compact'),
    allItems: computed(() => items),
    filteredItems: computed(() => items),
    groupedItems: grouped,
    displayItems: computed(() => (groupByItem ? grouped.value : items)),
    objectivesByItemId: computed(() => new Map()),
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
    itemsReady: computed(() => !itemsLoading),
    itemsError: computed(() => null),
    itemsFullLoaded: computed(() => true),
    ensureNeededItemsData: vi.fn(),
    queueFullItemsLoad: vi.fn(),
  });
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
  vi.doMock('@/composables/useNeededItems', () => ({
    useNeededItems: createMockUseNeededItems(options),
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
      xs: ref(false),
    }),
  }));
  const { default: NeededItemsPage } = await import('@/pages/needed-items.vue');
  return NeededItemsPage;
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
    const NeededItemsPage = await setup({ viewMode: 'list' });
    const wrapper = await mountSuspended(NeededItemsPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
    const items = wrapper.findAll('[data-testid="needed-item"]');
    expect(items.length).toBeGreaterThan(0);
    expect(wrapper.find('[data-testid="grouped-item"]').exists()).toBe(false);
  });
  it('renders needed items grid view', async () => {
    const NeededItemsPage = await setup({ viewMode: 'grid' });
    const wrapper = await mountSuspended(NeededItemsPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
    const items = wrapper.findAll('[data-testid="needed-item"]');
    expect(items.length).toBeGreaterThan(0);
    expect(wrapper.find('[data-testid="grouped-item"]').exists()).toBe(false);
  });
  it('renders grouped view when groupByItem is enabled', async () => {
    const NeededItemsPage = await setup({ groupByItem: true });
    const wrapper = await mountSuspended(NeededItemsPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
    const groupedItems = wrapper.findAll('[data-testid="grouped-item"]');
    expect(groupedItems.length).toBeGreaterThan(0);
  });
  describe('empty and loading states', () => {
    it('renders empty state when no items', async () => {
      const NeededItemsPage = await setup({ emptyState: true });
      const wrapper = await mountSuspended(NeededItemsPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
      const neededItems = wrapper.findAll('[data-testid="needed-item"]');
      expect(neededItems.length).toBe(0);
    });
    it('renders loading state', async () => {
      const NeededItemsPage = await setup({ itemsLoading: true });
      const wrapper = await mountSuspended(NeededItemsPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.find('[data-testid="filter-bar"]').exists()).toBe(true);
    });
  });
  describe('view mode rendering', () => {
    it('renders list style items in list view mode', async () => {
      const NeededItemsPage = await setup({ viewMode: 'list' });
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
      const NeededItemsPage = await setup({ viewMode: 'grid' });
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
  it('keeps grid infinite-scroll incremental to avoid heavy eager loading', async () => {
    const NeededItemsPage = await setup({ viewMode: 'grid' });
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
