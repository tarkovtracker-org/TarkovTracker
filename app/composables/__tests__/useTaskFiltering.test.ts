import { describe, expect, it, vi } from 'vitest';
import type { Task } from '@/types/tarkov';
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
  },
  tasksFailed: {
    'task-failed': { self: true },
  },
  unlockedTasks: {
    'task-map': { self: true },
    'task-trader': { self: true },
    'task-invalid': { self: true },
  },
  objectiveCompletions: {
    'obj-map': { self: false },
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
    const { taskFiltering, tasks } = await setup();
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
    expect(result.map((task) => task.id)).toEqual(['task-map']);
  });
  it('calculates status counts excluding invalid availability', async () => {
    const { taskFiltering } = await setup();
    const counts = taskFiltering.calculateStatusCounts('self');
    expect(counts).toEqual({
      all: 5,
      available: 1,
      locked: 1,
      completed: 1,
      failed: 1,
    });
  });
});
