import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { Task } from '@/types/tarkov';
const { trackEventMock, trackTaskActionMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  trackTaskActionMock: vi.fn(),
}));
const createTarkovStore = (options: {
  playerLevel?: number;
  objectiveCounts?: Record<string, number>;
  isTaskComplete?: boolean | ((taskId: string) => boolean);
  isTaskFailed?: boolean;
  taskCompletions?: Record<string, unknown>;
  traderLevels?: Record<string, number>;
  traderReputations?: Record<string, number>;
  traders?: Array<{ id: string; name: string; normalizedName: string }>;
}) => {
  const objectiveCounts = new Map<string, number>(Object.entries(options.objectiveCounts ?? {}));
  return {
    setTaskComplete: vi.fn(),
    setTaskFailed: vi.fn(),
    setTaskUncompleted: vi.fn(),
    setTaskObjectiveComplete: vi.fn(),
    setTaskObjectiveUncomplete: vi.fn(),
    setObjectiveCount: vi.fn((objectiveId: string, count: number) => {
      objectiveCounts.set(objectiveId, count);
    }),
    getObjectiveCount: vi.fn((objectiveId: string) => objectiveCounts.get(objectiveId) ?? 0),
    getCurrentGameMode: vi.fn(() => 'pvp'),
    playerLevel: vi.fn(() => options.playerLevel ?? 1),
    setLevel: vi.fn(),
    getTraderLevel: vi.fn((traderId: string) => options.traderLevels?.[traderId] ?? 1),
    setTraderLevel: vi.fn(),
    getTraderReputation: vi.fn((traderId: string) => options.traderReputations?.[traderId] ?? 0),
    setTraderReputation: vi.fn(),
    isTaskComplete: vi.fn((taskId: string) => {
      if (typeof options.isTaskComplete === 'function') {
        return options.isTaskComplete(taskId);
      }
      if (typeof options.isTaskComplete === 'boolean') {
        return options.isTaskComplete;
      }
      const completion = options.taskCompletions?.[taskId];
      if (!completion || typeof completion !== 'object') {
        return false;
      }
      return (
        (completion as { complete?: boolean }).complete === true &&
        (completion as { failed?: boolean }).failed !== true
      );
    }),
    isTaskFailed: vi.fn(() => options.isTaskFailed ?? false),
    getCurrentProgressData: vi.fn(() => ({
      taskCompletions: options.taskCompletions ?? {},
    })),
  };
};
const createMetadataStore = (
  tasks: Task[],
  traders: Array<{ id: string; name: string; normalizedName: string }> = []
) => ({
  tasks,
  traders,
});
const setup = async (
  task: Task,
  tasks: Task[],
  options: Parameters<typeof createTarkovStore>[0],
  preferencesOverrides: Partial<{
    getPinnedTaskIds: string[];
    getTasksRequireTraderLevels: boolean;
  }> = {}
) => {
  const onAction = vi.fn();
  const tarkovStore = createTarkovStore(options);
  const metadataStore = createMetadataStore(tasks, options.traders);
  const togglePinnedTask = vi.fn();
  const preferencesStore = {
    getPinnedTaskIds: [],
    getTasksRequireTraderLevels: true,
    togglePinnedTask,
    ...preferencesOverrides,
  };
  vi.resetModules();
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => tarkovStore,
  }));
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => metadataStore,
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/composables/useProductAnalytics', () => ({
    useProductAnalytics: () => ({
      trackTaskAction: trackTaskActionMock,
    }),
  }));
  vi.doMock('vue-i18n', async () => ({
    ...(await vi.importActual<typeof import('vue-i18n')>('vue-i18n')),
    useI18n: () => ({
      t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
  }));
  vi.doMock('@/composables/useAnalyticsEvents', () => ({
    useAnalyticsEvents: () => ({
      trackEvent: trackEventMock,
    }),
  }));
  const { useTaskActions } = await import('@/composables/useTaskActions');
  const taskRef = ref(task);
  const actions = useTaskActions(() => taskRef.value, onAction);
  return {
    actions,
    onAction,
    taskRef,
    tarkovStore,
    togglePinnedTask,
  };
};
describe('useTaskActions', () => {
  it('tracks each task action once with rich analytics metadata', async () => {
    const task: Task = {
      id: 'task-analytics',
      name: 'Task Analytics',
      objectives: [{ id: 'obj-analytics', count: 2 }],
      requiredKeys: [
        {
          keys: [
            { id: 'key-1' } as unknown as NonNullable<Task['requiredKeys']>[number]['keys'][number],
          ],
        },
      ],
      trader: {
        name: 'Prapor',
        normalizedName: 'prapor',
      } as Task['trader'],
    };
    const { actions } = await setup(task, [task], {});
    actions.markTaskComplete();
    expect(trackTaskActionMock).toHaveBeenCalledTimes(1);
    expect(trackTaskActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'complete',
        analyticsParams: expect.objectContaining({
          game_mode: 'pvp',
          objective_count: 1,
          task_has_required_keys: 'yes',
          task_id: 'task-analytics',
          task_name: 'Task Analytics',
          task_trader: 'prapor',
        }),
      })
    );
    expect(trackEventMock).not.toHaveBeenCalled();
  });
  it('marks a task complete and handles alternatives', async () => {
    const task: Task = {
      id: 'task-main',
      name: 'Main Task',
      minPlayerLevel: 5,
      objectives: [{ id: 'obj-main', count: 2 }],
      alternatives: ['task-alt'],
    };
    const alternative: Task = {
      id: 'task-alt',
      name: 'Alt Task',
      objectives: [{ id: 'obj-alt', count: 1 }],
    };
    const { actions, onAction, tarkovStore } = await setup(task, [task, alternative], {
      playerLevel: 2,
      objectiveCounts: { 'obj-alt': 1 },
    });
    actions.markTaskComplete();
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('task-main');
    expect(tarkovStore.setTaskObjectiveComplete).toHaveBeenCalledWith('obj-main');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-main', 2);
    expect(tarkovStore.setTaskFailed).toHaveBeenCalledWith('task-alt');
    expect(tarkovStore.setTaskObjectiveUncomplete).toHaveBeenCalledWith('obj-alt');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-alt', 0);
    expect(tarkovStore.setLevel).toHaveBeenCalledWith(5);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'complete', taskId: 'task-main' })
    );
  });
  it('marks a task available and processes requirements', async () => {
    const requirementTask: Task = {
      id: 'task-req',
      name: 'Requirement',
      objectives: [{ id: 'obj-req', count: 1 }],
    };
    const predecessorTask: Task = {
      id: 'task-pre',
      name: 'Predecessor',
      objectives: [{ id: 'obj-pre', count: 1 }],
    };
    const task: Task = {
      id: 'task-main',
      name: 'Main Task',
      minPlayerLevel: 3,
      taskRequirements: [
        {
          task: { id: 'task-req' },
          // This requirement models a task that becomes available when another task fails
          status: ['Failed'],
        },
      ],
      predecessors: ['task-pre'],
    };
    const { actions, onAction, tarkovStore } = await setup(
      task,
      [task, requirementTask, predecessorTask],
      {
        playerLevel: 1,
        objectiveCounts: { 'obj-req': 1 },
      }
    );
    actions.markTaskAvailable();
    expect(tarkovStore.setTaskFailed).toHaveBeenCalledWith('task-req');
    expect(tarkovStore.setTaskObjectiveUncomplete).toHaveBeenCalledWith('obj-req');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-req', 0);
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('task-pre');
    expect(tarkovStore.setTaskObjectiveComplete).toHaveBeenCalledWith('obj-pre');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-pre', 1);
    expect(tarkovStore.setLevel).toHaveBeenCalledWith(3);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'available', taskId: 'task-main' })
    );
  });
  it('marks the Fence-gated Is This a Reference task available', async () => {
    const fenceId = '579dc571d53a0658a154fbec';
    const task: Task = {
      id: '66d9cbb67b491f9d5304f6e6',
      name: 'Is This a Reference?',
      minPlayerLevel: 25,
      taskRequirements: [],
      traderRequirements: [
        {
          id: '66dace4d03b34844877a50fc',
          trader: { id: fenceId, name: 'Fence' },
          value: 1,
        },
      ],
    };
    const { actions, tarkovStore } = await setup(task, [task], {
      playerLevel: 28,
      traderReputations: { [fenceId]: 0 },
      traders: [{ id: fenceId, name: 'Fence', normalizedName: 'fence' }],
    });
    actions.markTaskAvailable();
    expect(tarkovStore.setTraderReputation).toHaveBeenCalledWith(fenceId, 1);
  });
  it('backfills trader loyalty and positive reputation without lowering met values', async () => {
    const praporId = '54cb50c76803fa8b248b4571';
    const skierId = '58330581ace78e27b8b10cee';
    const task: Task = {
      id: 'trader-gated-task',
      traderLevelRequirements: [
        { id: 'level-prapor', trader: { id: praporId, name: 'Prapor' }, level: 2 },
        { id: 'level-skier', trader: { id: skierId, name: 'Skier' }, level: 2 },
      ],
      traderRequirements: [
        { id: 'rep-prapor', trader: { id: praporId, name: 'Prapor' }, value: 0.5 },
        { id: 'rep-skier', trader: { id: skierId, name: 'Skier' }, value: 0.2 },
      ],
    };
    const { actions, tarkovStore } = await setup(task, [task], {
      traderLevels: { [praporId]: 1, [skierId]: 3 },
      traderReputations: { [praporId]: 0.2, [skierId]: 0.4 },
    });
    actions.markTaskAvailable();
    expect(tarkovStore.setTraderLevel).toHaveBeenCalledWith(praporId, 2);
    expect(tarkovStore.setTraderLevel).not.toHaveBeenCalledWith(skierId, expect.any(Number));
    expect(tarkovStore.setTraderReputation).toHaveBeenCalledWith(praporId, 0.5);
    expect(tarkovStore.setTraderReputation).not.toHaveBeenCalledWith(skierId, expect.any(Number));
  });
  it('backfills Fence negative reputation requirements only', async () => {
    const fenceId = '579dc571d53a0658a154fbec';
    const praporId = '54cb50c76803fa8b248b4571';
    const task: Task = {
      id: 'low-karma-task',
      traderRequirements: [
        { id: 'rep-fence', trader: { id: fenceId, name: 'Fence' }, value: -2 },
        { id: 'rep-prapor', trader: { id: praporId, name: 'Prapor' }, value: -1 },
      ],
    };
    const { actions, tarkovStore } = await setup(task, [task], {
      traderReputations: { [fenceId]: 0, [praporId]: 0 },
      traders: [{ id: fenceId, name: 'Fence', normalizedName: 'fence' }],
    });
    actions.markTaskAvailable();
    expect(tarkovStore.setTraderReputation).toHaveBeenCalledWith(fenceId, -2);
    expect(tarkovStore.setTraderReputation).not.toHaveBeenCalledWith(praporId, expect.any(Number));
  });
  it('does not backfill trader requirements when gating is disabled', async () => {
    const fenceId = '579dc571d53a0658a154fbec';
    const task: Task = {
      id: 'optional-trader-gating-task',
      traderLevelRequirements: [
        { id: 'level-fence', trader: { id: fenceId, name: 'Fence' }, level: 2 },
      ],
      traderRequirements: [{ id: 'rep-fence', trader: { id: fenceId, name: 'Fence' }, value: 1 }],
    };
    const { actions, tarkovStore } = await setup(
      task,
      [task],
      {
        traderLevels: { [fenceId]: 1 },
        traderReputations: { [fenceId]: 0 },
        traders: [{ id: fenceId, name: 'Fence', normalizedName: 'fence' }],
      },
      { getTasksRequireTraderLevels: false }
    );
    actions.markTaskAvailable();
    expect(tarkovStore.setTraderLevel).not.toHaveBeenCalled();
    expect(tarkovStore.setTraderReputation).not.toHaveBeenCalled();
  });
  it('marks a task failed and invokes onAction', async () => {
    const task: Task = {
      id: 'task-to-fail',
      name: 'Task to Fail',
      objectives: [{ id: 'obj-fail', count: 2 }],
    };
    const { actions, onAction, tarkovStore } = await setup(task, [task], {
      objectiveCounts: { 'obj-fail': 2 },
    });
    actions.markTaskFailed();
    expect(tarkovStore.setTaskFailed).toHaveBeenCalledWith('task-to-fail', { manual: true });
    expect(tarkovStore.setTaskObjectiveUncomplete).toHaveBeenCalledWith('obj-fail');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-fail', 0);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'fail', taskId: 'task-to-fail' })
    );
  });
  it('tracks manual-fail metadata when resetting a failed task', async () => {
    const task: Task = {
      id: 'task-reset-failed',
      name: 'Task Reset Failed',
      objectives: [{ id: 'obj-reset', count: 2 }],
    };
    const { actions, onAction } = await setup(task, [task], {
      isTaskFailed: true,
      taskCompletions: {
        'task-reset-failed': { complete: true, failed: true, manual: true },
      },
    });
    actions.markTaskUncomplete();
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reset_failed',
        taskId: 'task-reset-failed',
        wasManualFail: true,
      })
    );
  });
  it('unpins a pinned task when completing', async () => {
    const task: Task = {
      id: 'task-pin-complete',
      name: 'Pinned Task',
      objectives: [{ id: 'obj-pin', count: 1 }],
    };
    const { actions, togglePinnedTask } = await setup(
      task,
      [task],
      {},
      {
        getPinnedTaskIds: ['task-pin-complete'],
      }
    );
    actions.markTaskComplete();
    expect(togglePinnedTask).toHaveBeenCalledTimes(1);
    expect(togglePinnedTask).toHaveBeenCalledWith('task-pin-complete');
  });
  it('unpins a pinned task when failing', async () => {
    const task: Task = {
      id: 'task-pin-fail',
      name: 'Pinned Task',
      objectives: [{ id: 'obj-pin-fail', count: 1 }],
    };
    const { actions, togglePinnedTask } = await setup(
      task,
      [task],
      {},
      {
        getPinnedTaskIds: ['task-pin-fail'],
      }
    );
    actions.markTaskFailed();
    expect(togglePinnedTask).toHaveBeenCalledTimes(1);
    expect(togglePinnedTask).toHaveBeenCalledWith('task-pin-fail');
  });
  it('marks a task uncompleted and resets objectives', async () => {
    const task: Task = {
      id: 'task-uncomplete',
      name: 'Task to Uncomplete',
      objectives: [{ id: 'obj-unc', count: 3 }],
    };
    const { actions, onAction, tarkovStore } = await setup(task, [task], {
      objectiveCounts: { 'obj-unc': 3 },
    });
    actions.markTaskUncomplete();
    expect(tarkovStore.setTaskUncompleted).toHaveBeenCalledWith('task-uncomplete');
    expect(tarkovStore.setTaskObjectiveUncomplete).toHaveBeenCalledWith('obj-unc');
    // markTaskUncomplete uses handleTaskObjectives which only calls setTaskObjectiveUncomplete, not setObjectiveCount
    expect(tarkovStore.setObjectiveCount).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'uncomplete', taskId: 'task-uncomplete' })
    );
  });
  it('handles tasks with no objectives gracefully', async () => {
    const task: Task = {
      id: 'task-no-obj',
      name: 'Task No Objectives',
      objectives: [],
    };
    const { actions, onAction, tarkovStore } = await setup(task, [task], {});
    actions.markTaskComplete();
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('task-no-obj');
    expect(tarkovStore.setTaskObjectiveComplete).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'complete', taskId: 'task-no-obj' })
    );
  });
  it('handles tasks with no alternatives gracefully', async () => {
    const task: Task = {
      id: 'task-no-alt',
      name: 'Task No Alternatives',
      objectives: [{ id: 'obj-no-alt', count: 1 }],
      alternatives: undefined,
    };
    const { actions, onAction, tarkovStore } = await setup(task, [task], {});
    actions.markTaskComplete();
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('task-no-alt');
    expect(tarkovStore.setTaskFailed).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'complete', taskId: 'task-no-alt' })
    );
  });
  it('does not fail already completed alternatives when marking complete', async () => {
    const task: Task = {
      id: 'task-main-complete-alt',
      name: 'Main Task',
      objectives: [{ id: 'obj-main-complete-alt', count: 1 }],
      alternatives: ['task-alt-complete'],
    };
    const alternative: Task = {
      id: 'task-alt-complete',
      name: 'Completed Alt Task',
      objectives: [{ id: 'obj-alt-complete', count: 1 }],
    };
    const { actions, tarkovStore } = await setup(task, [task, alternative], {
      objectiveCounts: { 'obj-alt-complete': 1 },
      isTaskComplete: (taskId) => taskId === 'task-alt-complete',
    });
    actions.markTaskComplete();
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('task-main-complete-alt');
    expect(tarkovStore.setTaskFailed).not.toHaveBeenCalledWith('task-alt-complete');
    expect(tarkovStore.setTaskObjectiveUncomplete).not.toHaveBeenCalledWith('obj-alt-complete');
    expect(tarkovStore.setObjectiveCount).not.toHaveBeenCalledWith('obj-alt-complete', 0);
  });
  it('handles tasks with null/undefined fields without exceptions (defensive runtime handling)', async () => {
    // This test validates defensive handling of malformed/untyped external input.
    // In practice, task data from external APIs may have missing or null fields
    // despite TypeScript types. The unsafe assertions simulate this scenario.
    const task: Task = {
      id: 'task-null-fields',
      name: 'Task with Null Fields',
      objectives: undefined as unknown as Task['objectives'],
      alternatives: null as unknown as Task['alternatives'],
      predecessors: null as unknown as Task['predecessors'],
      taskRequirements: null as unknown as Task['taskRequirements'],
    };
    const { actions, onAction, tarkovStore } = await setup(task, [task], {});
    expect(() => actions.markTaskComplete()).not.toThrow();
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('task-null-fields');
    expect(onAction).toHaveBeenCalled();
  });
  it('handles marking available with no predecessors or requirements', async () => {
    const task: Task = {
      id: 'task-simple',
      name: 'Simple Task',
      objectives: [{ id: 'obj-simple', count: 1 }],
    };
    const { actions, onAction, tarkovStore } = await setup(task, [task], {});
    actions.markTaskAvailable();
    expect(tarkovStore.setTaskComplete).not.toHaveBeenCalled();
    expect(tarkovStore.setTaskFailed).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'available', taskId: 'task-simple' })
    );
  });
});
