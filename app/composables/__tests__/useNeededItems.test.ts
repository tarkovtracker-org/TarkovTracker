import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, reactive, ref } from 'vue';
import { TASK_STATE, type TaskState } from '@/utils/constants';
import type { UseNeededItemsReturn } from '@/composables/useNeededItems';
import type { NeededItemHideoutModule, NeededItemTaskObjective, TarkovItem } from '@/types/tarkov';
const createItem = (id: string, name: string): TarkovItem => ({
  id,
  name,
  shortName: name.substring(0, 4),
  iconLink: `https://example.com/${id}.png`,
  image512pxLink: `https://example.com/${id}-512.png`,
  wikiLink: `https://wiki.example.com/${id}`,
  link: `https://tarkov.dev/item/${id}`,
});
const createTaskObjective = (
  id: string,
  taskId: string,
  item: TarkovItem,
  count: number,
  foundInRaid: boolean = false
): NeededItemTaskObjective => ({
  id,
  needType: 'taskObjective',
  taskId,
  item,
  count,
  foundInRaid,
});
const createHideoutModule = (
  id: string,
  stationId: string,
  level: number,
  item: TarkovItem,
  count: number,
  foundInRaid: boolean = false
): NeededItemHideoutModule => ({
  id,
  needType: 'hideoutModule',
  hideoutModule: {
    id: `${stationId}-${level}`,
    stationId,
    level,
    predecessors: [],
    successors: [],
    parents: [],
    children: [],
    constructionTime: 0,
    itemRequirements: [],
    stationLevelRequirements: [],
    skillRequirements: [],
    traderRequirements: [],
    crafts: [],
  },
  item,
  count,
  foundInRaid,
});
const createNeededItems = (options: { includeTeamItems?: boolean } = {}) => {
  const items = {
    bolts: createItem('item-bolts', 'Bolts'),
    screws: createItem('item-screws', 'Screws'),
    wires: createItem('item-wires', 'Wires'),
    cpu: createItem('item-cpu', 'CPU'),
  };
  const taskObjectives: NeededItemTaskObjective[] = [
    createTaskObjective('obj-1', 'task-1', items.bolts, 5, true),
    createTaskObjective('obj-2', 'task-1', items.screws, 3, false),
    createTaskObjective('obj-3', 'task-2', items.bolts, 2, false),
    createTaskObjective('obj-4', 'task-kappa', items.wires, 4, true),
  ];
  if (options.includeTeamItems) {
    taskObjectives.push({
      ...createTaskObjective('obj-team', 'task-team', createItem('item-team', 'Team Item'), 1),
      teamId: 'team-1',
    });
  }
  const hideoutModules: NeededItemHideoutModule[] = [
    createHideoutModule('hideout-1', 'station-1', 1, items.bolts, 10, false),
    createHideoutModule('hideout-2', 'station-2', 2, items.cpu, 1, true),
  ];
  return { items, taskObjectives, hideoutModules };
};
const createMetadataStore = (
  taskObjectives: NeededItemTaskObjective[],
  hideoutModules: NeededItemHideoutModule[]
) => {
  const tasks = [
    { id: 'task-1', name: 'Task One', factionName: 'Any' },
    { id: 'task-2', name: 'Task Two', factionName: 'Any' },
    { id: 'task-kappa', name: 'Kappa Task', factionName: 'Any', kappaRequired: true },
  ];
  return reactive({
    tasks,
    neededItemTaskObjectives: taskObjectives,
    neededItemHideoutModules: hideoutModules,
    itemsFullLoaded: true,
    items: [
      createItem('item-bolts', 'Bolts'),
      createItem('item-screws', 'Screws'),
      createItem('item-wires', 'Wires'),
      createItem('item-cpu', 'CPU'),
    ],
    itemsLoading: false,
    itemsError: null as Error | null,
    tasksObjectivesHydrated: true,
    tasksObjectivesPending: false,
    hideoutStations: [{ id: 'station-1', name: 'Workbench' }],
    hideoutLoading: false,
    editions: new Map(),
    prestigeTaskMap: new Map<string, number>(),
    getTaskById: (taskId: string) => {
      return tasks.find((task) => task.id === taskId);
    },
    getExcludedTaskIdsForEdition: () => new Set<string>(),
    getItemById: (itemId: string) => {
      const items: Record<string, TarkovItem> = {
        'item-bolts': createItem('item-bolts', 'Bolts'),
        'item-screws': createItem('item-screws', 'Screws'),
        'item-wires': createItem('item-wires', 'Wires'),
        'item-cpu': createItem('item-cpu', 'CPU'),
      };
      return items[itemId];
    },
    getStationById: (stationId: string) => {
      const stations: Record<string, { id: string; name: string }> = {
        'station-1': { id: 'station-1', name: 'Workbench' },
        'station-2': { id: 'station-2', name: 'Intelligence Center' },
      };
      return stations[stationId];
    },
    fetchItemsLiteData: vi.fn(),
    fetchTaskObjectivesData: vi.fn(),
    fetchHideoutData: vi.fn(),
    ensureItemsFullLoaded: vi.fn(),
  });
};
const createProgressStore = () => ({
  playerFaction: { self: 'USEC' },
  tasksCompletions: {
    'task-1': { self: false },
    'task-2': { self: true },
    'task-kappa': { self: false },
  },
  moduleCompletions: {
    'station-1-1': { self: false },
    'station-2-2': { self: false },
  },
  tasksState: {
    'task-1': TASK_STATE.ACTIVE,
    'task-2': TASK_STATE.ACTIVE,
    'task-kappa': TASK_STATE.AVAILABLE,
  } as Record<string, TaskState>,
  getTeamIndex: (teamId: string) => (teamId === 'self' ? 'self' : teamId),
});
const createPreferencesStore = () => ({
  getHideNonKappaTasks: false,
  getShowLightkeeperTasks: true,
  getShowNonSpecialTasks: true,
  getNeededItemsViewMode: 'grid',
  setNeededItemsViewMode: vi.fn(),
  getNeededTypeView: 'all',
  setNeededTypeView: vi.fn(),
  getNeededItemsFirFilter: 'all',
  setNeededItemsFirFilter: vi.fn(),
  getNeededItemsGroupByItem: false,
  setNeededItemsGroupByItem: vi.fn(),
  getNeededItemsHideNonFirSpecialEquipment: false,
  setNeededItemsHideNonFirSpecialEquipment: vi.fn(),
  getNeededItemsKappaOnly: false,
  setNeededItemsKappaOnly: vi.fn(),
  getNeededItemsSortBy: 'priority',
  setNeededItemsSortBy: vi.fn(),
  getNeededItemsSortDirection: 'desc',
  setNeededItemsSortDirection: vi.fn(),
  getNeededItemsHideOwned: false,
  setNeededItemsHideOwned: vi.fn(),
  getNeededItemsCardStyle: 'compact',
  setNeededItemsCardStyle: vi.fn(),
  itemsTeamAllHidden: false,
  setItemsTeamHideAll: vi.fn(),
});
const createTarkovStore = () => ({
  getGameEdition: () => 1,
  getPrestigeLevel: () => 0,
  getObjectiveCount: (id: string) => {
    const counts: Record<string, number> = {
      'obj-1': 2,
      'obj-2': 1,
      'obj-3': 0,
      'obj-4': 4,
    };
    return counts[id] ?? 0;
  },
  getHideoutPartCount: (id: string) => {
    const counts: Record<string, number> = {
      'hideout-1': 5,
      'hideout-2': 0,
    };
    return counts[id] ?? 0;
  },
});
const mountedWrappers: Array<ReturnType<typeof mount>> = [];
afterEach(() => {
  for (const wrapper of mountedWrappers) {
    wrapper.unmount();
  }
  mountedWrappers.length = 0;
});
const setup = async (
  overrides: {
    includeTeamItems?: boolean;
    metadataStore?: Partial<ReturnType<typeof createMetadataStore>>;
    preferencesStore?: Partial<ReturnType<typeof createPreferencesStore>>;
    progressStore?: Partial<ReturnType<typeof createProgressStore>>;
    tarkovStore?: Partial<ReturnType<typeof createTarkovStore>>;
  } = {}
) => {
  const { taskObjectives, hideoutModules } = createNeededItems({
    includeTeamItems: overrides.includeTeamItems,
  });
  const metadataStore = Object.assign(
    createMetadataStore(taskObjectives, hideoutModules),
    overrides.metadataStore
  );
  const progressStore = { ...createProgressStore(), ...overrides.progressStore };
  const preferencesStore = { ...createPreferencesStore(), ...overrides.preferencesStore };
  const tarkovStore = { ...createTarkovStore(), ...overrides.tarkovStore };
  vi.resetModules();
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => metadataStore,
  }));
  vi.doMock('@/stores/useProgress', () => ({
    useProgressStore: () => progressStore,
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => tarkovStore,
  }));
  vi.doMock('@/utils/editionHelpers', () => ({
    isTaskAvailableForEdition: () => true,
  }));
  const { useNeededItems } = await import('@/composables/useNeededItems');
  const search = ref('');
  let neededItems: UseNeededItemsReturn | null = null;
  const wrapper = mount(
    defineComponent({
      setup() {
        neededItems = useNeededItems({ search });
        return () => null;
      },
    })
  );
  mountedWrappers.push(wrapper);
  await nextTick();
  if (!neededItems) {
    throw new Error('useNeededItems did not initialize - result is null after mounting');
  }
  return {
    metadataStore,
    progressStore,
    preferencesStore,
    tarkovStore,
    search,
    neededItems: neededItems as UseNeededItemsReturn,
  };
};
describe('useNeededItems', () => {
  describe('allItems', () => {
    it('combines task objectives and hideout modules', async () => {
      const { neededItems } = await setup();
      expect(neededItems.allItems.value.length).toBe(6);
    });
    it('includes all items regardless of completion status', async () => {
      const { neededItems } = await setup();
      const taskIds = neededItems.allItems.value
        .filter((item) => item.needType === 'taskObjective')
        .map((item) => (item as NeededItemTaskObjective).taskId);
      expect(taskIds).toContain('task-2');
    });
  });
  describe('filterTabsWithCounts', () => {
    it('calculates counts for each tab', async () => {
      const { neededItems } = await setup();
      const tabs = neededItems.filterTabsWithCounts.value;
      expect(tabs).toHaveLength(4);
      expect(tabs.find((t) => t.value === 'all')?.count).toBeGreaterThan(0);
      expect(tabs.find((t) => t.value === 'tasks')?.count).toBeGreaterThan(0);
      expect(tabs.find((t) => t.value === 'hideout')?.count).toBeGreaterThan(0);
    });
  });
  describe('filteredItems', () => {
    it('filters by completion status (completed tab)', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededTypeView: 'completed' },
      });
      const filtered = neededItems.filteredItems.value;
      expect(
        filtered.every((item) => {
          if (item.needType === 'taskObjective') {
            return (item as NeededItemTaskObjective).taskId === 'task-2';
          }
          return false;
        })
      ).toBe(true);
    });
    it('filters by tasks only', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededTypeView: 'tasks' },
      });
      const filtered = neededItems.filteredItems.value;
      expect(filtered.every((item) => item.needType === 'taskObjective')).toBe(true);
    });
    it('filters by hideout only', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededTypeView: 'hideout' },
      });
      const filtered = neededItems.filteredItems.value;
      expect(filtered.every((item) => item.needType === 'hideoutModule')).toBe(true);
    });
    it('filters by FIR status', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsFirFilter: 'fir' },
      });
      const filtered = neededItems.filteredItems.value;
      expect(filtered.every((item) => item.foundInRaid === true)).toBe(true);
    });
    it('filters by non-FIR status', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsFirFilter: 'non-fir' },
      });
      const filtered = neededItems.filteredItems.value;
      expect(filtered.every((item) => !item.foundInRaid)).toBe(true);
    });
    it('filters by kappa-required tasks', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsKappaOnly: true },
      });
      const filtered = neededItems.filteredItems.value;
      const taskObjectives = filtered.filter((item) => item.needType === 'taskObjective');
      expect(
        taskObjectives.every((item) => {
          return (item as NeededItemTaskObjective).taskId === 'task-kappa';
        })
      ).toBe(true);
    });
    it('filters out task objectives hidden by prestige mapping', async () => {
      const { neededItems } = await setup({
        metadataStore: { prestigeTaskMap: new Map([['task-1', 1]]) },
        tarkovStore: { getPrestigeLevel: () => 0 },
      });
      const filtered = neededItems.filteredItems.value;
      const taskObjectives = filtered.filter((item) => item.needType === 'taskObjective');
      expect(
        taskObjectives.some((item) => (item as NeededItemTaskObjective).taskId === 'task-1')
      ).toBe(false);
      expect(
        taskObjectives.some((item) => (item as NeededItemTaskObjective).taskId === 'task-kappa')
      ).toBe(true);
    });
    it('filters out non-special task objectives when task settings disable them', async () => {
      const { neededItems } = await setup({
        preferencesStore: {
          getHideNonKappaTasks: false,
          getShowLightkeeperTasks: false,
          getShowNonSpecialTasks: false,
        },
      });
      const filtered = neededItems.filteredItems.value;
      const taskObjectives = filtered.filter((item) => item.needType === 'taskObjective');
      expect(
        taskObjectives.every((item) => (item as NeededItemTaskObjective).taskId === 'task-kappa')
      ).toBe(true);
    });
    it('filters by search term', async () => {
      const { neededItems, search } = await setup();
      search.value = 'bolts';
      const filtered = neededItems.filteredItems.value;
      expect(filtered.every((item) => item.item.name?.toLowerCase().includes('bolt'))).toBe(true);
    });
    it('hides owned items when enabled', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsHideOwned: true },
      });
      const filtered = neededItems.filteredItems.value;
      const fullyOwnedIds = ['obj-4'];
      expect(filtered.every((item) => !fullyOwnedIds.includes(item.id))).toBe(true);
    });
    it('filters out team-owned items when hideTeamItems is enabled', async () => {
      const { neededItems } = await setup({
        preferencesStore: { itemsTeamAllHidden: true },
        includeTeamItems: true,
      });
      const filtered = neededItems.filteredItems.value;
      const hasTeamItem = filtered.some(
        (item) => item.needType === 'taskObjective' && item.teamId === 'team-1'
      );
      expect(hasTeamItem).toBe(false);
    });
  });
  describe('groupedItems', () => {
    it('groups items by itemId', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsGroupByItem: true },
      });
      const grouped = neededItems.groupedItems.value;
      const boltsGroup = grouped.find((g) => g.item.name === 'Bolts');
      expect(boltsGroup).toBeDefined();
      expect(boltsGroup?.total).toBeGreaterThan(0);
    });
    it('aggregates counts correctly', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsGroupByItem: true },
      });
      const grouped = neededItems.groupedItems.value;
      const boltsGroup = grouped.find((g) => g.item.name === 'Bolts');
      expect(boltsGroup?.taskFir).toBe(5);
      expect(boltsGroup?.taskNonFir).toBe(0);
      expect(boltsGroup?.hideoutNonFir).toBe(10);
    });
    it('tracks current progress', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsGroupByItem: true },
      });
      const grouped = neededItems.groupedItems.value;
      const boltsGroup = grouped.find((g) => g.item.name === 'Bolts');
      expect(boltsGroup?.taskFirCurrent).toBe(2);
      expect(boltsGroup?.hideoutNonFirCurrent).toBe(5);
    });
  });
  describe('displayItems', () => {
    it('returns filteredItems when groupByItem is false', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsGroupByItem: false },
      });
      expect(neededItems.displayItems.value).toEqual(neededItems.filteredItems.value);
    });
    it('returns groupedItems when groupByItem is true', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsGroupByItem: true },
      });
      expect(neededItems.displayItems.value).toEqual(neededItems.groupedItems.value);
    });
  });
  describe('objectivesByItemId', () => {
    it('maps items to their objectives', async () => {
      const { neededItems } = await setup();
      const map = neededItems.objectivesByItemId.value;
      const boltsEntry = map.get('item-bolts');
      expect(boltsEntry).toBeDefined();
      expect(boltsEntry?.taskObjectives.length).toBeGreaterThan(0);
      expect(boltsEntry?.hideoutModules.length).toBeGreaterThan(0);
    });
  });
  describe('sorting', () => {
    it('sorts by priority in descending order', async () => {
      const { neededItems, progressStore } = await setup({
        preferencesStore: { getNeededItemsSortBy: 'priority', getNeededItemsSortDirection: 'desc' },
      });
      const filtered = neededItems.filteredItems.value;
      const priorities = filtered.map((item) => {
        if (item.needType === 'taskObjective') {
          const state = progressStore.tasksState?.[item.taskId];
          return state === TASK_STATE.ACTIVE ? 3 : state === TASK_STATE.AVAILABLE ? 1 : 0;
        }
        return 2;
      });
      const sortedPriorities = [...priorities].sort((a, b) => b - a);
      expect(priorities).toEqual(sortedPriorities);
    });
    it('sorts by name in ascending order', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsSortBy: 'name', getNeededItemsSortDirection: 'asc' },
      });
      const filtered = neededItems.filteredItems.value;
      const names = filtered.map((item) => item.item.name ?? '');
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sortedNames);
    });
    it('sorts by count in descending order', async () => {
      const { neededItems } = await setup({
        preferencesStore: { getNeededItemsSortBy: 'count', getNeededItemsSortDirection: 'desc' },
      });
      const filtered = neededItems.filteredItems.value;
      const counts = filtered.map((item) => item.count);
      const sortedCounts = [...counts].sort((a, b) => b - a);
      expect(counts).toEqual(sortedCounts);
    });
  });
  describe('loading state', () => {
    it('reports items ready when loaded', async () => {
      const { neededItems } = await setup();
      expect(neededItems.itemsReady.value).toBe(true);
    });
    it('keeps items ready during background loading when items are already present', async () => {
      const { metadataStore, neededItems } = await setup();
      metadataStore.itemsLoading = true;
      expect(neededItems.itemsReady.value).toBe(true);
      expect(neededItems.itemsError.value).toBeNull();
    });
    it('reports no error when items load successfully', async () => {
      const { neededItems } = await setup();
      expect(neededItems.itemsError.value).toBeNull();
    });
    it('reports items not ready while loading initial data', async () => {
      const { metadataStore, neededItems } = await setup();
      metadataStore.items = [];
      metadataStore.itemsLoading = true;
      expect(neededItems.itemsReady.value).toBe(false);
      expect(neededItems.itemsError.value).toBeNull();
    });
    it('exposes loading errors', async () => {
      const { metadataStore, neededItems } = await setup();
      const error = new Error('Items failed to load');
      metadataStore.itemsError = error;
      expect(neededItems.itemsError.value).toBe(error);
      expect(neededItems.itemsReady.value).toBe(false);
    });
    it('transitions through loading, success, and error states', async () => {
      const { metadataStore, neededItems } = await setup();
      metadataStore.items = [];
      metadataStore.itemsLoading = true;
      expect(neededItems.itemsReady.value).toBe(false);
      expect(neededItems.itemsError.value).toBeNull();
      metadataStore.items = [createItem('item-bolts', 'Bolts')];
      metadataStore.itemsLoading = false;
      expect(neededItems.itemsReady.value).toBe(true);
      expect(neededItems.itemsError.value).toBeNull();
      metadataStore.itemsError = new Error('Subsequent fetch failed');
      expect(neededItems.itemsError.value).not.toBeNull();
      expect(neededItems.itemsReady.value).toBe(false);
    });
  });
});
