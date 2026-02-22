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
  visibleTeamStores: { self: {} } as Record<string, Record<string, unknown>>,
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
  } as Record<string, Record<string, boolean>>,
  tasksFailed: {
    'task-failed': { self: true },
  } as Record<string, Record<string, boolean>>,
  unlockedTasks: {
    'task-map': { self: true },
    'task-trader': { self: true },
    'task-invalid': { self: true },
    'task-global': { self: true },
    'task-non-raid': { self: true },
    'task-kappa': { self: true },
    'task-lightkeeper': { self: true },
  } as Record<string, Record<string, boolean>>,
  objectiveCompletions: {
    'obj-map': { self: false },
    'obj-global': { self: false },
    'obj-non-raid': { self: false },
  } as Record<string, Record<string, boolean>>,
  invalidTasks: {
    'task-invalid': { self: true },
  } as Record<string, Record<string, boolean>>,
  playerFaction: { self: 'USEC' } as Record<string, string>,
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
  getHideCompletedMapObjectives: false,
  getTaskUserView: 'self',
  getTaskSecondaryView: 'available',
  getPinnedTaskIds: [] as string[],
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
  it('excludes tasks that only define top-level map id in map filtering', async () => {
    const { taskFiltering, preferencesStore } = await setup();
    preferencesStore.getHideGlobalTasks = true;
    const mergedMaps = [{ id: 'map-1', mergedIds: ['map-1'] }];
    const mapOnlyTask: Task = {
      id: 'task-top-level-map',
      name: 'Top Level Map Task',
      factionName: 'Any',
      map: { id: 'map-1' },
      objectives: [],
    };
    const result = taskFiltering.filterTasksByMap([mapOnlyTask], 'map-1', mergedMaps);
    expect(result.map((task) => task.id)).toEqual([]);
  });
  it('includes useItem objectives in map filtering', async () => {
    const { taskFiltering } = await setup();
    const useItemTask: Task = {
      id: 'task-use-item',
      name: 'Use Item Task',
      factionName: 'Any',
      objectives: [
        {
          id: 'obj-use-item',
          maps: [{ id: 'map-woods' }],
          type: 'useItem',
        },
      ],
    };
    const mergedMaps = [{ id: 'map-woods', mergedIds: ['map-woods'] }];
    const result = taskFiltering.filterTasksByView(
      [useItemTask],
      'maps',
      'map-woods',
      'all',
      mergedMaps
    );
    expect(result.map((task) => task.id)).toEqual(['task-use-item']);
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
  it('calculateStatusCounts includes dual-tag tasks when filtering by Lightkeeper only', async () => {
    const { taskFiltering, preferencesStore, metadataStore, progressStore } = await setup();
    metadataStore.tasks.push({
      id: 'task-kappa-lightkeeper',
      name: 'Kappa Lightkeeper Task',
      factionName: 'Any',
      kappaRequired: true,
      lightkeeperRequired: true,
      trader: { id: 'trader-1', name: 'Trader One' },
    });
    progressStore.unlockedTasks['task-kappa-lightkeeper'] = { self: true };
    progressStore.tasksCompletions['task-kappa-lightkeeper'] = { self: false };
    preferencesStore.getHideNonKappaTasks = true;
    preferencesStore.getShowLightkeeperTasks = true;
    preferencesStore.getShowNonSpecialTasks = false;
    const counts = taskFiltering.calculateStatusCounts('self');
    expect(counts.all).toBe(2);
    expect(counts.available).toBe(2);
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
  it('calculateTraderCounts includes dual-tag tasks when filtering by Lightkeeper only', async () => {
    const { taskFiltering, preferencesStore, metadataStore, progressStore } = await setup();
    metadataStore.tasks.push({
      id: 'task-kappa-lightkeeper',
      name: 'Kappa Lightkeeper Task',
      factionName: 'Any',
      kappaRequired: true,
      lightkeeperRequired: true,
      trader: { id: 'trader-1', name: 'Trader One' },
    });
    progressStore.unlockedTasks['task-kappa-lightkeeper'] = { self: true };
    progressStore.tasksCompletions['task-kappa-lightkeeper'] = { self: false };
    preferencesStore.getHideNonKappaTasks = true;
    preferencesStore.getShowLightkeeperTasks = true;
    preferencesStore.getShowNonSpecialTasks = false;
    const counts = taskFiltering.calculateTraderCounts('self', 'all');
    expect(counts['trader-1']).toBe(1);
    expect(counts['trader-2']).toBe(1);
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
  it('prioritizes map-specific tasks ahead of global tasks in map view sorting', async () => {
    const { taskFiltering } = await setup();
    await taskFiltering.updateVisibleTasks(
      {
        primaryView: 'maps',
        secondaryView: 'available',
        userView: 'self',
        mapView: 'map-1',
        traderView: 'all',
        mergedMaps: [{ id: 'map-1', mergedIds: ['map-1'] }],
        sortMode: 'alphabetical',
        sortDirection: 'asc',
      },
      false
    );
    expect(taskFiltering.visibleTasks.value.map((task) => task.id)).toEqual([
      'task-map',
      'task-global',
    ]);
  });
  it('groups trader all-view tasks by availability before locked, completed, and failed', async () => {
    const { taskFiltering, tasks } = await setup();
    const completedTask = tasks.find((task) => task.id === 'task-trader');
    const failedTask = tasks.find((task) => task.id === 'task-failed');
    if (completedTask?.trader) {
      completedTask.trader.id = 'trader-1';
      completedTask.trader.name = 'Trader One';
    }
    if (failedTask) {
      failedTask.trader = {
        id: 'trader-1',
        name: 'Trader One',
      };
    }
    await taskFiltering.updateVisibleTasks(
      {
        primaryView: 'traders',
        secondaryView: 'all',
        userView: 'self',
        mapView: 'all',
        traderView: 'trader-1',
        mergedMaps: [],
        sortMode: 'alphabetical',
        sortDirection: 'asc',
      },
      false
    );
    expect(taskFiltering.visibleTasks.value.map((task) => task.id)).toEqual([
      'task-kappa',
      'task-map',
      'task-locked',
      'task-trader',
      'task-failed',
    ]);
  });
  it('keeps pinned tasks first while preserving status rank within pinned and unpinned groups', async () => {
    const { taskFiltering, tasks, preferencesStore } = await setup();
    preferencesStore.getPinnedTaskIds = ['task-failed', 'task-trader'];
    const completedTask = tasks.find((task) => task.id === 'task-trader');
    const failedTask = tasks.find((task) => task.id === 'task-failed');
    if (completedTask?.trader) {
      completedTask.trader.id = 'trader-1';
      completedTask.trader.name = 'Trader One';
    }
    if (failedTask) {
      failedTask.trader = {
        id: 'trader-1',
        name: 'Trader One',
      };
    }
    await taskFiltering.updateVisibleTasks(
      {
        primaryView: 'traders',
        secondaryView: 'all',
        userView: 'self',
        mapView: 'all',
        traderView: 'trader-1',
        mergedMaps: [],
        sortMode: 'alphabetical',
        sortDirection: 'asc',
      },
      false
    );
    expect(taskFiltering.visibleTasks.value.map((task) => task.id)).toEqual([
      'task-trader',
      'task-failed',
      'task-kappa',
      'task-map',
      'task-locked',
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
      const nonRaidTypes = [
        'traderLevel',
        'traderStanding',
        'skill',
        'buildWeapon',
        'giveQuestItem',
      ];
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
    it('returns false for task with mapped objective assignment', async () => {
      const { taskFiltering, tasks } = await setup();
      const mapTask = tasks.find((t) => t.id === 'task-map')!;
      expect(taskFiltering.isGlobalTask(mapTask)).toBe(false);
    });
    it('returns true for task with task.map assignment but no mapped objectives', async () => {
      const { taskFiltering } = await setup();
      const taskWithMapMetadataOnly: Task = {
        id: 'task-with-map-metadata-only',
        name: 'Task With Map Metadata Only',
        factionName: 'Any',
        map: { id: 'map-1' },
        objectives: [{ id: 'obj', type: 'shoot' }],
      };
      expect(taskFiltering.isGlobalTask(taskWithMapMetadataOnly)).toBe(true);
    });
    it('returns false for map task with object-form objectives', async () => {
      const { taskFiltering } = await setup();
      const objectObjectiveTask: Task = {
        id: 'task-object-objective-map',
        name: 'Object Objective Map Task',
        factionName: 'Any',
        objectives: {
          primary: {
            id: 'obj-objective-map',
            maps: [{ id: 'map-1' }],
            type: 'mark',
          },
        } as unknown as Task['objectives'],
      };
      expect(taskFiltering.isGlobalTask(objectObjectiveTask)).toBe(false);
    });
    it('returns false for mapless task with only non-raid objectives', async () => {
      const { taskFiltering, tasks } = await setup();
      const nonRaidTask = tasks.find((t) => t.id === 'task-non-raid')!;
      expect(taskFiltering.isGlobalTask(nonRaidTask)).toBe(false);
    });
    it('returns false for task with objective map assignments', async () => {
      const { taskFiltering } = await setup();
      const taskWithLocations: Task = {
        id: 'task-with-locations',
        name: 'Task With Locations',
        factionName: 'Any',
        objectives: [{ id: 'obj', type: 'shoot', maps: [{ id: 'map-1' }] }],
      };
      expect(taskFiltering.isGlobalTask(taskWithLocations)).toBe(false);
    });
  });
  describe('filterTasksByMap with global tasks', () => {
    it('includes tasks with object-form objectives when map matches', async () => {
      const { taskFiltering, preferencesStore } = await setup();
      preferencesStore.getHideGlobalTasks = true;
      const taskWithObjectObjectives: Task = {
        id: 'task-objective-map',
        name: 'Task Objective Map',
        factionName: 'Any',
        objectives: {
          primary: {
            id: 'obj-objective-map-filter',
            maps: [{ id: 'map-1' }],
            type: 'mark',
          },
        } as unknown as Task['objectives'],
      };
      const mergedMaps = [{ id: 'map-1', mergedIds: ['map-1'] }];
      const result = taskFiltering.filterTasksByMap(
        [taskWithObjectObjectives],
        'map-1',
        mergedMaps
      );
      expect(result.map((task) => task.id)).toEqual(['task-objective-map']);
    });
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
  describe('hide completed map objectives behavior', () => {
    it('hides completed object-form map objectives when enabled', async () => {
      const { taskFiltering, preferencesStore, progressStore } = await setup();
      preferencesStore.getHideGlobalTasks = true;
      progressStore.objectiveCompletions['obj-objective-map-complete'] = { self: true };
      const taskWithObjectObjectives: Task = {
        id: 'task-objective-map-complete',
        name: 'Task Objective Map Complete',
        factionName: 'Any',
        objectives: {
          primary: {
            id: 'obj-objective-map-complete',
            maps: [{ id: 'map-1' }],
            type: 'mark',
          },
        } as unknown as Task['objectives'],
      };
      const result = taskFiltering.filterTasksByMap(
        [taskWithObjectObjectives],
        'map-1',
        [{ id: 'map-1', mergedIds: ['map-1'] }],
        {
          hideMapObjectiveCompleteTasks: true,
          userView: 'self',
          secondaryView: 'available',
        }
      );
      expect(result).toEqual([]);
    });
    it('hides tasks with no remaining objectives on selected map when enabled', async () => {
      const { taskFiltering, preferencesStore, progressStore } = await setup();
      preferencesStore.getHideGlobalTasks = true;
      preferencesStore.getHideCompletedMapObjectives = true;
      progressStore.objectiveCompletions['obj-map'] = { self: true };
      await taskFiltering.updateVisibleTasks(
        {
          primaryView: 'maps',
          secondaryView: 'available',
          userView: 'self',
          mapView: 'map-1',
          traderView: 'all',
          mergedMaps: [{ id: 'map-1', mergedIds: ['map-1'] }],
          sortMode: 'none',
          sortDirection: 'asc',
        },
        false
      );
      expect(taskFiltering.visibleTasks.value.map((task) => task.id)).toEqual([]);
    });
    it('does not change status counts when map-objective hiding is enabled', async () => {
      const { taskFiltering, preferencesStore, progressStore } = await setup();
      const before = taskFiltering.calculateStatusCounts('self');
      preferencesStore.getHideCompletedMapObjectives = true;
      progressStore.objectiveCompletions['obj-map'] = { self: true };
      const after = taskFiltering.calculateStatusCounts('self');
      expect(after).toEqual(before);
    });
    it('treats all-users map objective completion by relevant faction members only', async () => {
      const { taskFiltering, tasks, preferencesStore, progressStore } = await setup();
      preferencesStore.getHideGlobalTasks = true;
      preferencesStore.getHideCompletedMapObjectives = true;
      progressStore.visibleTeamStores = { self: {}, bear: {} };
      progressStore.playerFaction = { self: 'USEC', bear: 'BEAR' };
      progressStore.objectiveCompletions['obj-map'] = { self: true, bear: false };
      const mapTask = tasks.find((task) => task.id === 'task-map')!;
      mapTask.factionName = 'USEC';
      await taskFiltering.updateVisibleTasks(
        {
          primaryView: 'maps',
          secondaryView: 'all',
          userView: 'all',
          mapView: 'map-1',
          traderView: 'all',
          mergedMaps: [{ id: 'map-1', mergedIds: ['map-1'] }],
          sortMode: 'none',
          sortDirection: 'asc',
        },
        false
      );
      expect(taskFiltering.visibleTasks.value.map((task) => task.id)).toEqual([]);
    });
    it('hides all-users available tasks when only non-available teammates have incomplete map objectives', async () => {
      const { taskFiltering, preferencesStore, progressStore } = await setup();
      preferencesStore.getHideGlobalTasks = true;
      preferencesStore.getHideCompletedMapObjectives = true;
      progressStore.visibleTeamStores = { self: {}, teammate: {} };
      progressStore.playerFaction = { self: 'USEC', teammate: 'USEC' };
      progressStore.unlockedTasks['task-map'] = { self: true, teammate: true };
      progressStore.tasksCompletions['task-map'] = { self: false, teammate: true };
      progressStore.tasksFailed['task-map'] = { self: false, teammate: false };
      progressStore.objectiveCompletions['obj-map'] = { self: true, teammate: false };
      await taskFiltering.updateVisibleTasks(
        {
          primaryView: 'maps',
          secondaryView: 'available',
          userView: 'all',
          mapView: 'map-1',
          traderView: 'all',
          mergedMaps: [{ id: 'map-1', mergedIds: ['map-1'] }],
          sortMode: 'none',
          sortDirection: 'asc',
        },
        false
      );
      expect(taskFiltering.visibleTasks.value.map((task) => task.id)).toEqual([]);
    });
    it('can compare map-visible tasks with and without map-objective hiding for available view', async () => {
      const { taskFiltering, metadataStore, preferencesStore, progressStore } = await setup();
      preferencesStore.getHideGlobalTasks = true;
      progressStore.objectiveCompletions['obj-map'] = { self: true };
      const options = {
        primaryView: 'maps' as const,
        secondaryView: 'available' as const,
        userView: 'self',
        mapView: 'map-1',
        traderView: 'all',
        mergedMaps: [{ id: 'map-1', mergedIds: ['map-1'] }],
        sortMode: 'none' as const,
        sortDirection: 'asc' as const,
      };
      const withoutHiding = taskFiltering.calculateFilteredTasksForOptions(
        metadataStore.tasks,
        options,
        false
      );
      const withHiding = taskFiltering.calculateFilteredTasksForOptions(
        metadataStore.tasks,
        options,
        true
      );
      expect(withoutHiding.map((task) => task.id)).toContain('task-map');
      expect(withHiding.map((task) => task.id)).not.toContain('task-map');
      expect(withoutHiding.length - withHiding.length).toBe(1);
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
    it('does not double-count global tasks with non-map objective map tags', async () => {
      const { taskFiltering } = await setup();
      const taskWithNonMapObjectiveMaps: Task = {
        id: 'task-non-map-objective-maps',
        name: 'Task Non-Map Objective Maps',
        factionName: 'Any',
        objectives: [{ id: 'obj-exp', type: 'experience', maps: [{ id: 'map-1' }] }],
      };
      const counts = taskFiltering.calculateMapTaskTotals(
        [{ id: 'map-1', mergedIds: ['map-1'] }],
        [taskWithNonMapObjectiveMaps],
        false,
        'self',
        'all'
      );
      expect(counts['map-1']).toBe(1);
    });
    it('removes map-complete tasks from map totals when hiding is enabled', async () => {
      const { taskFiltering, metadataStore, progressStore } = await setup();
      progressStore.objectiveCompletions['obj-map'] = { self: true };
      const mergedMaps = [{ id: 'map-1', mergedIds: ['map-1'] }];
      const countsWithoutHiding = taskFiltering.calculateMapTaskTotals(
        mergedMaps,
        metadataStore.tasks,
        false,
        'self',
        'available',
        false
      );
      const countsWithHiding = taskFiltering.calculateMapTaskTotals(
        mergedMaps,
        metadataStore.tasks,
        false,
        'self',
        'available',
        true
      );
      expect(countsWithoutHiding['map-1']).toBeGreaterThan(countsWithHiding['map-1'] ?? 0);
      expect(countsWithoutHiding['map-1']! - countsWithHiding['map-1']!).toBe(1);
    });
  });
});
