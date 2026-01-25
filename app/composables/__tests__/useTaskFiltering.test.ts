import { describe, expect, it, vi } from 'vitest';
import type { Task, TaskObjective } from '@/types/tarkov';
const createTasks = (): Task[] => [
  {
    id: 'task-map',
    name: 'Map Task',
    factionName: 'Any',
    trader: { id: 'trader-1', name: 'Trader One' },
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
});
const createMetadataStore = (tasks: Task[]) => {
  const traders = [
    { id: 'trader-1', name: 'Trader One', normalizedName: 'trader one' },
    { id: 'trader-2', name: 'Trader Two', normalizedName: 'trader two' },
  ];
  return {
    tasks,
    traders,
    prestigeTaskMap: new Map<string, number>(),
    prestigeTaskIds: [],
    getTraderByName: (name: string) => traders.find((trader) => trader.name === name),
    getExcludedTaskIdsForEdition: () => new Set<string>(),
  };
};
const createPreferencesStore = () => ({
  getHideNonKappaTasks: false,
  getShowLightkeeperTasks: true,
  getShowNonSpecialTasks: true,
  getTaskSharedByAllOnly: false,
  getHideGlobalTasks: false,
  getTaskUserView: 'self',
  getTaskSecondaryView: 'available',
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
    expect(result.map((task) => task.id)).toEqual(['task-trader']);
  });
  it('filters tasks by available status for a user', async () => {
    const { taskFiltering, tasks } = await setup();
    const result = taskFiltering.filterTasksByStatus(tasks, 'available', 'self');
    expect(result.map((task) => task.id)).toEqual(['task-map', 'task-global', 'task-non-raid']);
  });
  it('calculates status counts excluding invalid availability', async () => {
    const { taskFiltering } = await setup();
    const counts = taskFiltering.calculateStatusCounts('self');
    expect(counts).toEqual({
      all: 7,
      available: 3,
      locked: 1,
      completed: 1,
      failed: 1,
    });
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
      expect(countsWithGlobal['map-1']).toBeGreaterThan(countsWithoutGlobal['map-1']);
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
