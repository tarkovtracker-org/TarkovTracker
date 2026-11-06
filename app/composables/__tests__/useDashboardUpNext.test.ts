import { describe, expect, it, vi } from 'vitest';
import { buildTaskEvaluations } from '@/stores/taskAvailability';
import type { Task, Trader } from '@/types/tarkov';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
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
  } = {}
) => ({
  getLevel: overrides.getLevel ?? (() => 10),
  invalidTasks: overrides.invalidTasks ?? {},
  tasksCompletions: overrides.tasksCompletions ?? {},
  tasksFailed: overrides.tasksFailed ?? {},
});
const createTarkovStore = (
  overrides: {
    completedObjectives?: Set<string>;
    completedTasks?: Set<string>;
    failedTasks?: Set<string>;
    fenceReputation?: number;
    getCurrentGameMode?: () => 'pvp' | 'pve';
    getPMCFaction?: () => string;
    getPrestigeLevel?: () => number;
    isTaskObjectiveComplete?: (objectiveId: string) => boolean;
  } = {}
) => {
  const completedTasks = overrides.completedTasks ?? new Set<string>();
  const failedTasks = overrides.failedTasks ?? new Set<string>();
  const completedObjectives = overrides.completedObjectives ?? new Set<string>();
  return {
    getCurrentGameMode: overrides.getCurrentGameMode ?? (() => 'pvp'),
    getGameEdition: () => 1,
    getPMCFaction: overrides.getPMCFaction ?? (() => 'USEC'),
    getPrestigeLevel: overrides.getPrestigeLevel ?? (() => 0),
    getTraderReputation: () => overrides.fenceReputation ?? 0,
    isTaskComplete: (taskId: string) => completedTasks.has(taskId),
    isTaskFailed: (taskId: string) => failedTasks.has(taskId),
    isTaskObjectiveComplete:
      overrides.isTaskObjectiveComplete ??
      ((objectiveId: string) => completedObjectives.has(objectiveId)),
  };
};
interface SetupOptions {
  excludedTaskIds?: string[];
  objectivesHydrated?: boolean;
  prestigeTaskMap?: Map<string, number>;
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
    getExcludedTaskIdsForEdition: () => new Set(options.excludedTaskIds ?? []),
    prestigeTaskMap: options.prestigeTaskMap ?? new Map<string, number>(),
    sortedTraders: traders,
    tasks,
    tasksObjectivesHydrated: options.objectivesHydrated ?? true,
    traders,
  };
  const taskEvaluations = buildTaskEvaluations(
    tasks,
    new Map([
      [
        'self',
        {
          level: progressStore.getLevel('self'),
          faction: tarkovStore.getPMCFaction(),
          mode: tarkovStore.getCurrentGameMode(),
          completions: Object.fromEntries(
            tasks.map((task) => [
              task.id,
              {
                complete: tarkovStore.isTaskComplete(task.id),
                failed: tarkovStore.isTaskFailed(task.id),
              },
            ])
          ),
          traders: Object.fromEntries(
            traders.map((trader) => [
              trader.id,
              { level: 1, reputation: tarkovStore.getTraderReputation() },
            ])
          ),
        },
      ],
    ]),
    { requireTraderLevels: true }
  );
  const unlockedTasks = Object.fromEntries(
    Object.entries(taskEvaluations).map(([id, byTeam]) => [
      id,
      { self: byTeam.self?.available === true },
    ])
  );
  vi.resetModules();
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => metadataStore,
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/stores/useProgress', () => ({
    useProgressStore: () => ({ ...progressStore, taskEvaluations, unlockedTasks }),
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => tarkovStore,
  }));
  const { useDashboardUpNext } = await import('@/composables/useDashboardUpNext');
  return useDashboardUpNext();
};
const flags = (ids: string[], value = false) =>
  Object.fromEntries(ids.map((id) => [id, { self: value }]));
describe('useDashboardUpNext', () => {
  it('ranks by follow-ups that completing the task actually opens', async () => {
    const tasks: Task[] = [
      {
        id: 'task-impact',
        name: 'Impact Task',
        factionName: 'Any',
        objectives: [
          { id: 'impact-1', taskId: 'task-impact' },
          { id: 'impact-2', taskId: 'task-impact' },
        ],
        children: ['follow-up-1', 'follow-up-2', 'follow-up-gated'],
      },
      {
        id: 'task-close',
        name: 'Close Task',
        factionName: 'Any',
        objectives: [
          { id: 'close-1', taskId: 'task-close' },
          { id: 'close-2', taskId: 'task-close' },
        ],
      },
      ...['follow-up-1', 'follow-up-2'].map((id) => ({
        id,
        name: id,
        factionName: 'Any',
        objectives: [{ id: `${id}-obj`, taskId: id }],
        taskRequirements: [{ task: { id: 'task-impact' } }],
      })),
      {
        id: 'follow-up-gated',
        name: 'Gated Follow Up',
        factionName: 'Any',
        minPlayerLevel: 50,
        objectives: [{ id: 'gated-obj', taskId: 'follow-up-gated' }],
        taskRequirements: [{ task: { id: 'task-impact' } }],
      },
    ];
    const ids = tasks.map((task) => task.id);
    const progressStore = createProgressStore({
      tasksCompletions: flags(ids),
      tasksFailed: flags(ids),
    });
    const tarkovStore = createTarkovStore({ completedObjectives: new Set(['close-1']) });
    const upNext = await setup({ progressStore, tasks, tarkovStore });
    expect(upNext.state.value).toBe('actionable');
    expect(upNext.items.value.map((item) => item.taskId)).toEqual(['task-impact', 'task-close']);
    expect(upNext.items.value[0]).toMatchObject({ reason: 'opens', opens: 2 });
    expect(upNext.items.value[1]?.reason).toBe('almost-done');
  });
  it.each([
    { gate: 'edition', excludedTaskIds: ['child'], prestigeTaskMap: new Map<string, number>() },
    { gate: 'prestige', excludedTaskIds: [], prestigeTaskMap: new Map([['child', 1]]) },
    { gate: 'faction', excludedTaskIds: [], prestigeTaskMap: new Map<string, number>() },
  ])('excludes $gate-ineligible follow-ups from counts and ranking', async (options) => {
    const tasks: Task[] = [
      { id: 'parent', name: 'Parent', children: ['child'], kappaRequired: true },
      {
        id: 'child',
        name: 'Child',
        factionName: options.gate === 'faction' ? 'BEAR' : 'Any',
        taskRequirements: [{ task: { id: 'parent' } }],
      },
    ];
    const excluded = await setup({ ...options, tasks });
    expect(excluded.items.value).toHaveLength(1);
    expect(excluded.items.value[0]).toMatchObject({
      taskId: 'parent',
      opens: 0,
      reason: 'kappa',
      score: 94,
    });
    const eligible = await setup({ tasks: tasks.map((task) => ({ ...task, factionName: 'Any' })) });
    expect(eligible.items.value[0]).toMatchObject({
      taskId: 'parent',
      opens: 1,
      reason: 'opens',
      score: 214,
    });
  });
  it('counts eligible follow-ups even when dashboard preferences hide them', async () => {
    const tasks: Task[] = [
      { id: 'parent', name: 'Parent', children: ['child'], lightkeeperRequired: true },
      { id: 'child', name: 'Child', taskRequirements: [{ task: { id: 'parent' } }] },
    ];
    const preferencesStore = createPreferencesStore({
      getHideNonKappaTasks: true,
      getShowNonSpecialTasks: false,
    });
    const upNext = await setup({ tasks, preferencesStore });
    expect(upNext.items.value[0]).toMatchObject({ taskId: 'parent', opens: 1, reason: 'opens' });
  });
  it('flags reward-based trader unlock tasks while the trader is still locked', async () => {
    const tasks: Task[] = [
      {
        id: 'task-reward',
        name: 'Reward Unlock',
        factionName: 'Any',
        objectives: [{ id: 'reward-1', taskId: 'task-reward' }],
        finishRewards: { traderUnlock: [{ id: 'jaeger' }] },
      } as unknown as Task,
      {
        id: 'task-plain',
        name: 'A Plain Task',
        factionName: 'Any',
        lightkeeperRequired: true,
        objectives: [{ id: 'plain-1', taskId: 'task-plain' }],
      },
    ];
    const traders = [{ id: 'jaeger', name: 'Jaeger', normalizedName: 'jaeger-test' } as Trader];
    const progressStore = createProgressStore({
      tasksCompletions: flags(['task-reward', 'task-plain']),
      tasksFailed: flags(['task-reward', 'task-plain']),
    });
    const upNext = await setup({ progressStore, tasks, traders });
    expect(upNext.items.value[0]).toMatchObject({
      taskId: 'task-reward',
      reason: 'unlock-trader',
      traderName: 'Jaeger',
    });
  });
  it('reports the filtered state when filters hide every available task', async () => {
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
      tasksCompletions: flags(['task-kappa']),
      tasksFailed: flags(['task-kappa']),
    });
    const preferencesStore = createPreferencesStore({
      getHideNonKappaTasks: true,
      getShowNonSpecialTasks: false,
    });
    const upNext = await setup({ preferencesStore, progressStore, tasks });
    expect(upNext.state.value).toBe('filtered');
    expect(upNext.hiddenAvailableCount.value).toBe(1);
    expect(upNext.items.value).toEqual([]);
  });
  it('does not count edition-excluded tasks as hidden by filters', async () => {
    const tasks: Task[] = ['task-kappa', 'task-edition'].map((id) => ({
      id,
      name: id,
      factionName: 'Any',
      kappaRequired: true,
      objectives: [{ id: `${id}-1`, taskId: id }],
    }));
    const ids = tasks.map((task) => task.id);
    const progressStore = createProgressStore({
      tasksCompletions: flags(ids),
      tasksFailed: flags(ids),
    });
    const preferencesStore = createPreferencesStore({
      getHideNonKappaTasks: true,
      getShowNonSpecialTasks: false,
    });
    const upNext = await setup({
      excludedTaskIds: ['task-edition'],
      preferencesStore,
      progressStore,
      tasks,
    });
    expect(upNext.hiddenAvailableCount.value).toBe(1);
  });
  it('applies the required-keys filter once objectives are hydrated', async () => {
    const tasks: Task[] = [
      {
        id: 'task-keys',
        name: 'Key Task',
        factionName: 'Any',
        objectives: [{ id: 'keys-1', taskId: 'task-keys' }],
        requiredKeys: [{ keys: [{ id: 'key-1' }] }],
      } as Task,
      {
        id: 'task-plain',
        name: 'A Plain Task',
        factionName: 'Any',
        objectives: [{ id: 'plain-1', taskId: 'task-plain' }],
      },
    ];
    const ids = tasks.map((task) => task.id);
    const preferencesStore = createPreferencesStore({ getOnlyTasksWithRequiredKeys: true });
    const progress = () =>
      createProgressStore({ tasksCompletions: flags(ids), tasksFailed: flags(ids) });
    const hydrated = await setup({ preferencesStore, progressStore: progress(), tasks });
    expect(hydrated.items.value.map((item) => item.taskId)).toEqual(['task-keys']);
    const loading = await setup({
      objectivesHydrated: false,
      preferencesStore,
      progressStore: progress(),
      tasks,
    });
    expect(loading.items.value).toHaveLength(2);
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
      tasksCompletions: flags(['task-hand-in']),
      tasksFailed: flags(['task-hand-in']),
    });
    const tarkovStore = createTarkovStore({ completedObjectives: new Set(['hand-in-1']) });
    const upNext = await setup({ progressStore, tasks, tarkovStore });
    expect(upNext.state.value).toBe('actionable');
    expect(upNext.items.value[0]).toMatchObject({
      reason: 'almost-done',
      progress: { completed: 1, remaining: 0, total: 1 },
    });
  });
  it('lists single-gate locked tasks when nothing is available', async () => {
    const tasks: Task[] = [
      {
        id: 'task-level',
        name: 'Level Gate',
        factionName: 'Any',
        minPlayerLevel: 15,
        objectives: [{ id: 'level-1', taskId: 'task-level' }],
      },
      {
        id: 'task-double',
        name: 'Double Gate',
        factionName: 'Any',
        minPlayerLevel: 15,
        objectives: [{ id: 'double-1', taskId: 'task-double' }],
        taskRequirements: [{ task: { id: 'task-level' } }],
      },
    ];
    const progressStore = createProgressStore({
      getLevel: () => 13,
      tasksCompletions: flags(['task-level', 'task-double']),
      tasksFailed: flags(['task-level', 'task-double']),
    });
    const upNext = await setup({ progressStore, tasks });
    expect(upNext.state.value).toBe('blocked');
    expect(upNext.items.value).toHaveLength(1);
    expect(upNext.items.value[0]).toMatchObject({
      taskId: 'task-level',
      reason: 'blocked',
      blocker: { type: 'player_level', required: 15 },
    });
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
      tasksCompletions: flags(['task-done'], true),
      tasksFailed: flags(['task-done']),
    });
    const tarkovStore = createTarkovStore({
      completedObjectives: new Set(['done-1']),
      completedTasks: new Set(['task-done']),
    });
    const upNext = await setup({ progressStore, tasks, tarkovStore });
    expect(upNext.state.value).toBe('complete');
    expect(upNext.items.value).toEqual([]);
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
      tasksCompletions: flags(['task-failed']),
      tasksFailed: flags(['task-failed'], true),
    });
    const tarkovStore = createTarkovStore({ failedTasks: new Set(['task-failed']) });
    const upNext = await setup({ progressStore, tasks, tarkovStore });
    expect(upNext.state.value).toBe('empty');
    expect(upNext.items.value).toEqual([]);
  });
});
