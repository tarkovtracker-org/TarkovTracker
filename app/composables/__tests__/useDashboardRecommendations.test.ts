import { describe, expect, it, vi } from 'vitest';
import type { Task, Trader } from '@/types/tarkov';
const createPreferencesStore = (
  overrides: {
    getHideNonKappaTasks?: boolean;
    getOnlyTasksWithRequiredKeys?: boolean;
    getShowLightkeeperTasks?: boolean;
    getShowNonSpecialTasks?: boolean;
  } = {}
) => ({
  getHideNonKappaTasks: overrides.getHideNonKappaTasks ?? false,
  getOnlyTasksWithRequiredKeys: overrides.getOnlyTasksWithRequiredKeys ?? false,
  getShowLightkeeperTasks: overrides.getShowLightkeeperTasks ?? true,
  getShowNonSpecialTasks: overrides.getShowNonSpecialTasks ?? true,
});
const createProgressStore = (
  overrides: {
    getLevel?: (teamId: string) => number;
    invalidTasks?: Record<string, Record<string, boolean>>;
    tasksCompletions?: Record<string, Record<string, boolean>>;
    tasksFailed?: Record<string, Record<string, boolean>>;
    unlockedTasks?: Record<string, Record<string, boolean>>;
  } = {}
) => ({
  getLevel: overrides.getLevel ?? (() => 10),
  invalidTasks: overrides.invalidTasks ?? {},
  tasksCompletions: overrides.tasksCompletions ?? {},
  tasksFailed: overrides.tasksFailed ?? {},
  unlockedTasks: overrides.unlockedTasks ?? {},
});
const createTarkovStore = (
  overrides: {
    completedObjectives?: Set<string>;
    completedTasks?: Set<string>;
    activeTasks?: Set<string>;
    failedTasks?: Set<string>;
    fenceReputation?: number;
    getCurrentGameMode?: () => 'pvp' | 'pve';
    getPMCFaction?: () => string;
    getPrestigeLevel?: () => number;
    isTaskObjectiveComplete?: (objectiveId: string) => boolean;
  } = {}
) => {
  const completedTasks = overrides.completedTasks ?? new Set<string>();
  const activeTasks = overrides.activeTasks ?? new Set<string>();
  const failedTasks = overrides.failedTasks ?? new Set<string>();
  const completedObjectives = overrides.completedObjectives ?? new Set<string>();
  return {
    getCurrentGameMode: overrides.getCurrentGameMode ?? (() => 'pvp'),
    getGameEdition: () => 1,
    getPMCFaction: overrides.getPMCFaction ?? (() => 'USEC'),
    getPrestigeLevel: overrides.getPrestigeLevel ?? (() => 0),
    getTraderReputation: () => overrides.fenceReputation ?? 0,
    isTaskComplete: (taskId: string) => completedTasks.has(taskId),
    isTaskActive: (taskId: string) => activeTasks.has(taskId),
    isTaskFailed: (taskId: string) => failedTasks.has(taskId),
    isTaskObjectiveComplete:
      overrides.isTaskObjectiveComplete ??
      ((objectiveId: string) => completedObjectives.has(objectiveId)),
  };
};
interface SetupOptions {
  preferencesStore?: ReturnType<typeof createPreferencesStore>;
  progressStore?: ReturnType<typeof createProgressStore>;
  tasks?: Task[];
  tarkovStore?: ReturnType<typeof createTarkovStore>;
  traders?: Trader[];
}
const setup = async (options: SetupOptions = {}) => {
  const tasks = options.tasks ?? [];
  const traders = options.traders ?? [];
  const progressStore = options.progressStore ?? createProgressStore();
  const preferencesStore = options.preferencesStore ?? createPreferencesStore();
  const tarkovStore = options.tarkovStore ?? createTarkovStore();
  const metadataStore = {
    getExcludedTaskIdsForEdition: () => new Set<string>(),
    prestigeTaskMap: new Map<string, number>(),
    sortedTraders: traders,
    tasks,
    traders,
  };
  vi.resetModules();
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => metadataStore,
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/stores/useProgress', () => ({
    useProgressStore: () => progressStore,
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => tarkovStore,
  }));
  const { useDashboardRecommendations } = await import('@/composables/useDashboardRecommendations');
  return useDashboardRecommendations();
};
describe('useDashboardRecommendations', () => {
  it('requires explicit active state for active task prerequisites', async () => {
    const tasks: Task[] = [
      {
        id: 'dependent',
        name: 'Dependent Task',
        factionName: 'Any',
        objectives: [{ id: 'dependent-1', taskId: 'dependent' }],
        taskRequirements: [
          { task: { id: 'prerequisite', name: 'Prerequisite' }, status: ['active'] },
        ],
      },
    ];
    const progressStore = createProgressStore({
      tasksCompletions: { dependent: { self: false } },
      tasksFailed: { dependent: { self: false } },
    });
    const legacyRecommendations = await setup({ progressStore, tasks });
    expect(legacyRecommendations.primaryRecommendation.value?.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'prerequisite' })])
    );
    const activeRecommendations = await setup({
      progressStore,
      tasks,
      tarkovStore: createTarkovStore({ activeTasks: new Set(['prerequisite']) }),
    });
    expect(activeRecommendations.primaryRecommendation.value?.blockers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'prerequisite' })])
    );
  });
  it('picks the available task with the biggest downstream impact', async () => {
    const tasks: Task[] = [
      {
        id: 'task-impact',
        name: 'Impact Task',
        factionName: 'Any',
        kappaRequired: true,
        lightkeeperRequired: true,
        objectives: [
          { id: 'impact-1', taskId: 'task-impact' },
          { id: 'impact-2', taskId: 'task-impact' },
        ],
        successors: ['follow-up-1', 'follow-up-2'],
        trader: { id: 'therapist', name: 'Therapist' },
      },
      {
        id: 'task-close',
        name: 'Close Task',
        factionName: 'Any',
        objectives: [
          { id: 'close-1', taskId: 'task-close' },
          { id: 'close-2', taskId: 'task-close' },
        ],
        trader: { id: 'prapor', name: 'Prapor' },
      },
      {
        id: 'follow-up-1',
        name: 'Follow Up 1',
        factionName: 'Any',
        objectives: [{ id: 'follow-1', taskId: 'follow-up-1' }],
      },
      {
        id: 'follow-up-2',
        name: 'Follow Up 2',
        factionName: 'Any',
        objectives: [{ id: 'follow-2', taskId: 'follow-up-2' }],
      },
    ];
    const progressStore = createProgressStore({
      tasksCompletions: {
        'task-impact': { self: false },
        'task-close': { self: false },
        'follow-up-1': { self: false },
        'follow-up-2': { self: false },
      },
      tasksFailed: {
        'task-impact': { self: false },
        'task-close': { self: false },
        'follow-up-1': { self: false },
        'follow-up-2': { self: false },
      },
      unlockedTasks: {
        'task-impact': { self: true },
        'task-close': { self: true },
      },
    });
    const tarkovStore = createTarkovStore({
      completedObjectives: new Set(['close-1']),
    });
    const recommendations = await setup({
      progressStore,
      tasks,
      tarkovStore,
    });
    expect(recommendations.mode.value).toBe('actionable');
    expect(recommendations.primaryRecommendation.value?.taskId).toBe('task-impact');
    expect(recommendations.primaryRecommendation.value?.reason).toBe('impact');
    expect(recommendations.primaryRecommendation.value?.tone).toBe('primary');
    expect(recommendations.secondaryRecommendations.value[0]?.taskId).toBe('task-close');
  });
  it('surfaces filter blockers when filters hide all currently available tasks', async () => {
    const tasks: Task[] = [
      {
        id: 'task-kappa',
        name: 'Kappa Task',
        factionName: 'Any',
        kappaRequired: true,
        objectives: [{ id: 'kappa-1', taskId: 'task-kappa' }],
      },
    ];
    const progressStore = createProgressStore({
      tasksCompletions: { 'task-kappa': { self: false } },
      tasksFailed: { 'task-kappa': { self: false } },
      unlockedTasks: { 'task-kappa': { self: true } },
    });
    const preferencesStore = createPreferencesStore({
      getHideNonKappaTasks: true,
      getShowNonSpecialTasks: false,
    });
    const recommendations = await setup({
      preferencesStore,
      progressStore,
      tasks,
    });
    expect(recommendations.mode.value).toBe('blocked');
    expect(recommendations.primaryRecommendation.value?.reason).toBe('filter-hidden');
    expect(recommendations.hiddenAvailableCount.value).toBe(1);
  });
  it('reports zero remaining when all counted objectives are complete but hand-in is still pending', async () => {
    const tasks: Task[] = [
      {
        id: 'task-hand-in',
        name: 'Hand In Task',
        factionName: 'Any',
        objectives: [{ id: 'hand-in-1', taskId: 'task-hand-in' }],
      },
    ];
    const progressStore = createProgressStore({
      tasksCompletions: { 'task-hand-in': { self: false } },
      tasksFailed: { 'task-hand-in': { self: false } },
      unlockedTasks: { 'task-hand-in': { self: true } },
    });
    const tarkovStore = createTarkovStore({
      completedObjectives: new Set(['hand-in-1']),
    });
    const recommendations = await setup({
      progressStore,
      tasks,
      tarkovStore,
    });
    expect(recommendations.mode.value).toBe('actionable');
    expect(recommendations.primaryRecommendation.value?.progress).toMatchObject({
      completed: 1,
      remaining: 0,
      total: 1,
    });
  });
  it('chooses the closest blocked task when nothing is actionable', async () => {
    const tasks: Task[] = [
      {
        id: 'task-level',
        name: 'Level Gate',
        factionName: 'Any',
        minPlayerLevel: 15,
        objectives: [{ id: 'level-1', taskId: 'task-level' }],
        successors: ['follow-up-a', 'follow-up-b'],
      },
      {
        id: 'task-prereq',
        name: 'Prereq Gate',
        factionName: 'Any',
        objectives: [{ id: 'prereq-1', taskId: 'task-prereq' }],
        taskRequirements: [
          { task: { id: 'missing-a', name: 'Missing A' } },
          { task: { id: 'missing-b', name: 'Missing B' } },
        ],
      },
      {
        id: 'follow-up-a',
        name: 'Follow Up A',
        factionName: 'Any',
        objectives: [{ id: 'follow-a', taskId: 'follow-up-a' }],
      },
      {
        id: 'follow-up-b',
        name: 'Follow Up B',
        factionName: 'Any',
        objectives: [{ id: 'follow-b', taskId: 'follow-up-b' }],
      },
    ];
    const progressStore = createProgressStore({
      getLevel: () => 13,
      tasksCompletions: {
        'task-level': { self: false },
        'task-prereq': { self: false },
        'follow-up-a': { self: false },
        'follow-up-b': { self: false },
      },
      tasksFailed: {
        'task-level': { self: false },
        'task-prereq': { self: false },
        'follow-up-a': { self: false },
        'follow-up-b': { self: false },
      },
      unlockedTasks: {},
    });
    const recommendations = await setup({
      progressStore,
      tasks,
    });
    expect(recommendations.mode.value).toBe('blocked');
    expect(recommendations.primaryRecommendation.value?.taskId).toBe('task-level');
    expect(recommendations.primaryRecommendation.value?.reason).toBe('blocked-level');
  });
  it('returns a complete state when every visible task is done', async () => {
    const tasks: Task[] = [
      {
        id: 'task-done',
        name: 'Done Task',
        factionName: 'Any',
        objectives: [{ id: 'done-1', taskId: 'task-done' }],
      },
    ];
    const progressStore = createProgressStore({
      tasksCompletions: { 'task-done': { self: true } },
      tasksFailed: { 'task-done': { self: false } },
      unlockedTasks: {},
    });
    const tarkovStore = createTarkovStore({
      completedObjectives: new Set(['done-1']),
      completedTasks: new Set(['task-done']),
    });
    const recommendations = await setup({
      progressStore,
      tasks,
      tarkovStore,
    });
    expect(recommendations.mode.value).toBe('complete');
    expect(recommendations.primaryRecommendation.value?.reason).toBe('complete');
  });
  it('does not report complete when the visible branch only contains failed tasks', async () => {
    const tasks: Task[] = [
      {
        id: 'task-failed',
        name: 'Failed Task',
        factionName: 'Any',
        objectives: [{ id: 'failed-1', taskId: 'task-failed' }],
      },
    ];
    const progressStore = createProgressStore({
      tasksCompletions: { 'task-failed': { self: false } },
      tasksFailed: { 'task-failed': { self: true } },
      unlockedTasks: {},
    });
    const tarkovStore = createTarkovStore({
      failedTasks: new Set(['task-failed']),
    });
    const recommendations = await setup({
      progressStore,
      tasks,
      tarkovStore,
    });
    expect(recommendations.mode.value).toBe('empty');
    expect(recommendations.primaryRecommendation.value).toBeNull();
  });
});
