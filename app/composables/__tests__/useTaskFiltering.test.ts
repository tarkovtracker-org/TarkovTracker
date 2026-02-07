import { describe, expect, it, vi } from 'vitest';
import type { Task, TaskObjective } from '@/types/tarkov';
const createTasks = (): Task[] => [
  {
    id: 'task-map',
    name: 'Map Task',
    factionName: 'Any',
    trader: { id: 'trader-1', name: 'Trader One' },
    requiredKeys: [
      {
        keys: [{ id: 'key-map', name: 'Map Key' }],
        maps: [{ id: 'map-1', name: 'Map One' }],
      },
    ],
    objectives: [
      {
        id: 'obj-map',
        maps: [{ id: 'map-1' }],
        type: 'mark',
      },
    ],
  },
  {
    id: 'task-trader',
    name: 'Trader Task',
    factionName: 'Any',
    trader: { id: 'trader-2', name: 'Trader Two' },
    objectives: [],
  },
  {
    id: 'task-locked',
    name: 'Locked Task',
    factionName: 'Any',
    trader: { id: 'trader-1', name: 'Trader One' },
    requiredKeys: [
      {
        keys: [{ id: 'key-locked', name: 'Locked Key' }],
      },
    ],
  },
  {
    id: 'task-failed',
    name: 'Failed Task',
    factionName: 'Any',
  },
  {
    id: 'task-invalid',
    name: 'Invalid Task',
    factionName: 'Any',
  },
  {
    id: 'task-bear',
    name: 'Bear Task',
    factionName: 'BEAR',
  },
  {
    id: 'task-global',
    name: 'Global Task',
    factionName: 'Any',
    objectives: [{ id: 'obj-global', type: 'shoot', count: 10 }],
  },
  {
    id: 'task-non-raid',
    name: 'Non-Raid Task',
    factionName: 'Any',
    objectives: [{ id: 'obj-non-raid', type: 'traderLevel', count: 2 }],
  },
  {
    id: 'task-kappa',
    name: 'Kappa Task',
    factionName: 'Any',
    kappaRequired: true,
    successors: ['task-map'],
    trader: { id: 'trader-1', name: 'Trader One' },
  },
  {
    id: 'task-lightkeeper',
    name: 'Lightkeeper Task',
    factionName: 'Any',
    lightkeeperRequired: true,
    trader: { id: 'trader-2', name: 'Trader Two' },
    requiredKeys: [
      {
        keys: [{ id: 'key-lightkeeper', name: 'Lightkeeper Key' }],
      },
    ],
  },
];
const createProgressStore = () => ({
  visibleTeamStores: { self: {} },
  tasksCompletions: {
    'task-map': { self: false },
    'task-trader': { self: true },
    'task-locked': { self: false },
    'task-failed': { self: false },
    'task-invalid': { self: false },
    'task-bear': { self: false },
    'task-global': { self: false },
    'task-non-raid': { self: false },
    'task-kappa': { self: false },
    'task-lightkeeper': { self: false },
  },
  tasksFailed: {
    'task-failed': { self: true },
  },
  unlockedTasks: {
    'task-map': { self: true },
    'task-trader': { self: true },
    'task-invalid': { self: true },
    'task-global': { self: true },
    'task-non-raid': { self: true },
    'task-kappa': { self: true },
    'task-lightkeeper': { self: true },
  },
  objectiveCompletions: {
    'obj-map': { self: false },
    'obj-global': { self: false },
    'obj-non-raid': { self: false },
  },
  invalidTasks: {
    'task-invalid': { self: true },
  },
  playerFaction: { self: 'USEC' },
  getDisplayName: (teamId: string) => teamId,
  getTaskStatus: (teamId: string, taskId: string) => {
    const completions: Record<string, Record<string, boolean>> = {
      'task-map': { self: false },
      'task-trader': { self: true },
      'task-locked': { self: false },
      'task-failed': { self: false },
      'task-invalid': { self: false },
      'task-bear': { self: false },
    };
    const failed: Record<string, Record<string, boolean>> = {
      'task-failed': { self: true },
    };
    if (failed[taskId]?.[teamId]) return 'failed';
    if (completions[taskId]?.[teamId]) return 'completed';
    return 'incomplete';
  },
});
const createMetadataStore = (tasks: Task[]) => {
  const traders = [
    { id: 'trader-1', name: 'Trader One', normalizedName: 'trader one' },
    { id: 'trader-2', name: 'Trader Two', normalizedName: 'trader two' },
  ];
  return {
    tasks,
    traders,
    tasksObjectivesHydrated: true,
    prestigeTaskMap: new Map<string, number>(),
    getTraderByName: (name: string) => traders.find((trader) => trader.name === name),
    getExcludedTaskIdsForEdition: () => new Set<string>(),
  };
};
const createPreferencesStore = () => ({
  getHideNonKappaTasks: false,
  getShowLightkeeperTasks: true,
  getShowNonSpecialTasks: true,
  getRespectTaskFiltersForImpact: true,
  getOnlyTasksWithRequiredKeys: false,
  getTaskSharedByAllOnly: false,
  getHideGlobalTasks: false,
  getTaskUserView: 'self',
  getTaskSecondaryView: 'available',
  getPinnedTaskIds: [],
});
const createTarkovStore = () => ({
  getPrestigeLevel: () => 0,
  getGameEdition: () => 1,
});
const setup = async () => {
  const tasks = createTasks();
  const progressStore = createProgressStore();
  const metadataStore = createMetadataStore(tasks);
  const preferencesStore = createPreferencesStore();
  const tarkovStore = createTarkovStore();
  vi.resetModules();
  vi.doMock('@/stores/useProgress', () => ({
    useProgressStore: () => progressStore,
  }));
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => metadataStore,
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => tarkovStore,
  }));
  const { useTaskFiltering } = await import('@/composables/useTaskFiltering');
  return {
    tasks,
    progressStore,
    metadataStore,
    preferencesStore,
    tarkovStore,
    taskFiltering: useTaskFiltering(),
  };
};
describe('useTaskFiltering', () => {
  it('filters tasks by map view using merged maps', async () => {
    const { taskFiltering, tasks, preferencesStore } = await setup();
    preferencesStore.getHideGlobalTasks = true;
    const mergedMaps = [{ id: 'map-1', mergedIds: ['map-1', 'map-1b'] }];
    const result = taskFiltering.filterTasksByView(tasks, 'maps', 'map-1b', 'all', mergedMaps);
    expect(result.map((task) => task.id)).toEqual(['task-map']);
  });
  it('filters tasks by trader view', async () => {
    const { taskFiltering, tasks } = await setup();
    const mergedMaps = [{ id: 'map-1', mergedIds: ['map-1'] }];
    const result = taskFiltering.filterTasksByView(tasks, 'traders', 'all', 'trader-2', mergedMaps);
    expect(result.map((task) => task.id)).toEqual(['task-trader', 'task-lightkeeper']);
  });
  it('filters tasks by available status for a user', async () => {
    const { taskFiltering, tasks } = await setup();
    const result = taskFiltering.filterTasksByStatus(tasks, 'available', 'self');
    expect(result.map((task) => task.id)).toEqual([
      'task-map',
      'task-global',
      'task-non-raid',
      'task-kappa',
      'task-lightkeeper',
    ]);
  });
  it('calculates status counts excluding invalid availability', async () => {
    const { taskFiltering } = await setup();
    const counts = taskFiltering.calculateStatusCounts('self');
    expect(counts).toEqual({
      all: 9,
      available: 5,
      locked: 1,
      completed: 1,
      failed: 1,
    });
  });
  it('calculateStatusCounts respects task type settings (Kappa only)', async () => {
    const { taskFiltering, preferencesStore } = await setup();
    preferencesStore.getHideNonKappaTasks = false;
    preferencesStore.getShowLightkeeperTasks = false;
    preferencesStore.getShowNonSpecialTasks = false;
    const counts = taskFiltering.calculateStatusCounts('self');
    expect(counts.all).toBe(1);
    expect(counts.available).toBe(1);
  });
  it('calculateStatusCounts respects task type settings (Kappa + Lightkeeper)', async () => {
    const { taskFiltering, preferencesStore } = await setup();
    preferencesStore.getHideNonKappaTasks = false;
    preferencesStore.getShowLightkeeperTasks = true;
    preferencesStore.getShowNonSpecialTasks = false;
    const counts = taskFiltering.calculateStatusCounts('self');
    expect(counts.all).toBe(2);
  });
  it('calculateTraderCounts respects task type settings', async () => {
    const { taskFiltering, preferencesStore } = await setup();
    const allCounts = taskFiltering.calculateTraderCounts('self', 'all');
    expect(allCounts['trader-1']).toBe(3);
    expect(allCounts['trader-2']).toBe(2);
    preferencesStore.getHideNonKappaTasks = false;
    preferencesStore.getShowLightkeeperTasks = false;
    preferencesStore.getShowNonSpecialTasks = false;
    const kappaCounts = taskFiltering.calculateTraderCounts('self', 'all');
    expect(kappaCounts['trader-1']).toBe(1);
    expect(kappaCounts['trader-2']).toBeUndefined();
  });
  it('sorts impact using filtered successors when enforcement is enabled', async () => {
    const { taskFiltering, preferencesStore } = await setup();
    preferencesStore.getShowNonSpecialTasks = false;
    preferencesStore.getShowLightkeeperTasks = true;
    preferencesStore.getHideNonKappaTasks = false;
    preferencesStore.getRespectTaskFiltersForImpact = true;
    await taskFiltering.updateVisibleTasks(
      {
        primaryView: 'all',
        secondaryView: 'available',
        userView: 'self',
        mapView: 'all',
        traderView: 'all',
        mergedMaps: [],
        sortMode: 'impact',
        sortDirection: 'desc',
      },
      false
    );
    expect(taskFiltering.visibleTasks.value.map((task) => task.id)).toEqual([
      'task-lightkeeper',
      'task-kappa',
    ]);
  });
  it('filters visible tasks to only tasks with required keys when enabled', async () => {
    const { taskFiltering, preferencesStore } = await setup();
    preferencesStore.getOnlyTasksWithRequiredKeys = true;
    await taskFiltering.updateVisibleTasks(
      {
        primaryView: 'all',
        secondaryView: 'available',
        userView: 'self',
        mapView: 'all',
        traderView: 'all',
        mergedMaps: [],
        sortMode: 'none',
        sortDirection: 'asc',
      },
      false
    );
    expect(taskFiltering.visibleTasks.value.map((task) => task.id)).toEqual([
      'task-map',
      'task-lightkeeper',
    ]);
  });
  it('does not apply required-keys filtering before objectives hydrate', async () => {
    const { taskFiltering, tasks, preferencesStore, metadataStore } = await setup();
    preferencesStore.getOnlyTasksWithRequiredKeys = true;
    metadataStore.tasksObjectivesHydrated = false;
    tasks.forEach((task) => {
      task.requiredKeys = undefined;
    });
    await taskFiltering.updateVisibleTasks(
      {
        primaryView: 'all',
        secondaryView: 'available',
        userView: 'self',
        mapView: 'all',
        traderView: 'all',
        mergedMaps: [],
        sortMode: 'none',
        sortDirection: 'asc',
      },
      false
    );
    expect(taskFiltering.visibleTasks.value.map((task) => task.id)).toEqual([
      'task-map',
      'task-global',
      'task-non-raid',
      'task-kappa',
      'task-lightkeeper',
    ]);
    const statusCounts = taskFiltering.calculateStatusCounts('self');
    expect(statusCounts).toEqual({
      all: 9,
      available: 5,
      locked: 1,
      completed: 1,
      failed: 1,
    });
  });
  it('filters status, trader, and map counts by required keys when enabled', async () => {
    const { taskFiltering, preferencesStore, metadataStore } = await setup();
    preferencesStore.getOnlyTasksWithRequiredKeys = true;
    const statusCounts = taskFiltering.calculateStatusCounts('self');
    expect(statusCounts).toEqual({
      all: 3,
      available: 2,
      locked: 1,
      completed: 0,
      failed: 0,
    });
    const traderCounts = taskFiltering.calculateTraderCounts('self', 'all');
    expect(traderCounts['trader-1']).toBe(2);
    expect(traderCounts['trader-2']).toBe(1);
    const mapCounts = taskFiltering.calculateMapTaskTotals(
      [{ id: 'map-1', mergedIds: ['map-1'] }],
      metadataStore.tasks,
      false,
      'self',
      'available'
    );
    expect(mapCounts['map-1']).toBe(1);
  });
  it('sorts impact using all successors when enforcement is disabled', async () => {
    const { taskFiltering, preferencesStore } = await setup();
    preferencesStore.getShowNonSpecialTasks = false;
    preferencesStore.getShowLightkeeperTasks = true;
    preferencesStore.getHideNonKappaTasks = false;
    preferencesStore.getRespectTaskFiltersForImpact = false;
    await taskFiltering.updateVisibleTasks(
      {
        primaryView: 'all',
        secondaryView: 'available',
        userView: 'self',
        mapView: 'all',
        traderView: 'all',
        mergedMaps: [],
        sortMode: 'impact',
        sortDirection: 'desc',
      },
      false
    );
    expect(taskFiltering.visibleTasks.value.map((task) => task.id)).toEqual([
      'task-kappa',
      'task-lightkeeper',
    ]);
  });
  describe('isRaidRelevantObjective', () => {
    it('returns true for all raid-relevant objective types', async () => {
      const { taskFiltering } = await setup();
      const raidTypes = [
        'shoot',
        'extract',
        'mark',
        'visit',
        'findItem',
        'findQuestItem',
        'giveQuestItem',
        'plantItem',
        'plantQuestItem',
        'useItem',
        'experience',
      ];
      for (const type of raidTypes) {
        const obj: TaskObjective = { id: 'test', type };
        expect(taskFiltering.isRaidRelevantObjective(obj)).toBe(true);
      }
    });
    it('returns true for giveItem with foundInRaid', async () => {
      const { taskFiltering } = await setup();
      const obj: TaskObjective = { id: 'test', type: 'giveItem', foundInRaid: true };
      expect(taskFiltering.isRaidRelevantObjective(obj)).toBe(true);
    });
    it('returns false for giveItem without foundInRaid', async () => {
      const { taskFiltering } = await setup();
      const obj: TaskObjective = { id: 'test', type: 'giveItem', foundInRaid: false };
      expect(taskFiltering.isRaidRelevantObjective(obj)).toBe(false);
    });
    it('returns false for non-raid objective types', async () => {
      const { taskFiltering } = await setup();
      const nonRaidTypes = ['traderLevel', 'traderStanding', 'skill', 'buildWeapon'];
      for (const type of nonRaidTypes) {
        const obj: TaskObjective = { id: 'test', type };
        expect(taskFiltering.isRaidRelevantObjective(obj)).toBe(false);
      }
    });
  });
  describe('isGlobalTask', () => {
    it('returns true for mapless task with raid-relevant objectives', async () => {
      const { taskFiltering, tasks } = await setup();
      const globalTask = tasks.find((t) => t.id === 'task-global')!;
      expect(taskFiltering.isGlobalTask(globalTask)).toBe(true);
    });
    it('returns false for task with map assignment', async () => {
      const { taskFiltering, tasks } = await setup();
      const mapTask = tasks.find((t) => t.id === 'task-map')!;
      expect(taskFiltering.isGlobalTask(mapTask)).toBe(false);
    });
    it('returns false for mapless task with only non-raid objectives', async () => {
      const { taskFiltering, tasks } = await setup();
      const nonRaidTask = tasks.find((t) => t.id === 'task-non-raid')!;
      expect(taskFiltering.isGlobalTask(nonRaidTask)).toBe(false);
    });
    it('returns false for task with locations array', async () => {
      const { taskFiltering } = await setup();
      const taskWithLocations: Task = {
        id: 'task-with-locations',
        name: 'Task With Locations',
        factionName: 'Any',
        locations: ['map-1'],
        objectives: [{ id: 'obj', type: 'shoot' }],
      };
      expect(taskFiltering.isGlobalTask(taskWithLocations)).toBe(false);
    });
  });
  describe('filterTasksByMap with global tasks', () => {
    it('includes global tasks when hideGlobalTasks is false', async () => {
      const { taskFiltering, tasks, preferencesStore } = await setup();
      preferencesStore.getHideGlobalTasks = false;
      const mergedMaps = [{ id: 'map-1', mergedIds: ['map-1'] }];
      const result = taskFiltering.filterTasksByMap(tasks, 'map-1', mergedMaps);
      const resultIds = result.map((t) => t.id);
      expect(resultIds).toContain('task-map');
      expect(resultIds).toContain('task-global');
    });
    it('excludes global tasks when hideGlobalTasks is true', async () => {
      const { taskFiltering, tasks, preferencesStore } = await setup();
      preferencesStore.getHideGlobalTasks = true;
      const mergedMaps = [{ id: 'map-1', mergedIds: ['map-1'] }];
      const result = taskFiltering.filterTasksByMap(tasks, 'map-1', mergedMaps);
      const resultIds = result.map((t) => t.id);
      expect(resultIds).toContain('task-map');
      expect(resultIds).not.toContain('task-global');
    });
  });
  describe('calculateMapTaskTotals with global tasks', () => {
    it('includes global tasks in map counts when hideGlobalTasks is false', async () => {
      const { taskFiltering, metadataStore } = await setup();
      const mergedMaps = [
        { id: 'map-1', mergedIds: ['map-1'] },
        { id: 'map-2', mergedIds: ['map-2'] },
      ];
      const counts = taskFiltering.calculateMapTaskTotals(
        mergedMaps,
        metadataStore.tasks,
        false,
        'self',
        'available'
      );
      expect(counts['map-1']).toBeGreaterThanOrEqual(1);
      expect(counts['map-2']).toBeGreaterThanOrEqual(1);
    });
    it('excludes global tasks from map counts when hideGlobalTasks is true', async () => {
      const { taskFiltering, metadataStore } = await setup();
      const mergedMaps = [{ id: 'map-1', mergedIds: ['map-1'] }];
      const countsWithGlobal = taskFiltering.calculateMapTaskTotals(
        mergedMaps,
        metadataStore.tasks,
        false,
        'self',
        'available'
      );
      const countsWithoutGlobal = taskFiltering.calculateMapTaskTotals(
        mergedMaps,
        metadataStore.tasks,
        true,
        'self',
        'available'
      );
      expect(countsWithGlobal['map-1']).toBeGreaterThan(countsWithoutGlobal['map-1'] ?? 0);
    });
    it('adds same global count to all maps', async () => {
      const { taskFiltering, metadataStore } = await setup();
      const mergedMaps = [
        { id: 'map-1', mergedIds: ['map-1'] },
        { id: 'map-other', mergedIds: ['map-other'] },
      ];
      const counts = taskFiltering.calculateMapTaskTotals(
        mergedMaps,
        metadataStore.tasks,
        false,
        'self',
        'available'
      );
      expect(counts['map-other']).toBeGreaterThanOrEqual(1);
    });
  });
});
