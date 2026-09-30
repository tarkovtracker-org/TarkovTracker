import { describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { Task } from '@/types/tarkov';
const createTarkovStore = (options: {
  isTaskComplete?: (taskId: string) => boolean;
  objectiveCounts?: Record<string, number>;
  playerLevel?: number;
}) => {
  const objectiveCounts = new Map<string, number>(Object.entries(options.objectiveCounts ?? {}));
  const manualActivityHistory: unknown[] = [];
  return {
    setTaskComplete: vi.fn(),
    setTaskFailed: vi.fn(),
    setTaskUncompleted: vi.fn(),
    setTaskObjectiveComplete: vi.fn(),
    setTaskObjectiveUncomplete: vi.fn(),
    setStoryObjectiveUncomplete: vi.fn(),
    setObjectiveCount: vi.fn((objectiveId: string, count: number) => {
      objectiveCounts.set(objectiveId, count);
    }),
    getObjectiveCount: vi.fn((objectiveId: string) => objectiveCounts.get(objectiveId) ?? 0),
    playerLevel: vi.fn(() => options.playerLevel ?? 1),
    setLevel: vi.fn(),
    isTaskComplete: vi.fn((taskId: string) => options.isTaskComplete?.(taskId) ?? false),
    // Manual activity-log entries live in the synced progress blob (issue #445).
    getManualActivityHistory: vi.fn(() => manualActivityHistory),
    addManualActivityEntries: vi.fn((entries: unknown[]) => {
      manualActivityHistory.unshift(...entries);
    }),
    clearManualActivityHistory: vi.fn(() => {
      manualActivityHistory.length = 0;
    }),
  };
};
const setup = async (tasks: Task[], options: Parameters<typeof createTarkovStore>[0] = {}) => {
  const tarkovStore = createTarkovStore(options);
  const metadataStore = { tasks };
  vi.resetModules();
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => tarkovStore,
  }));
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => metadataStore,
  }));
  vi.doMock('vue-i18n', async () => ({
    ...(await vi.importActual<typeof import('vue-i18n')>('vue-i18n')),
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }));
  const { useTaskNotification } = await import('@/composables/useTaskNotification');
  const scope = effectScope();
  const notification = scope.run(() => useTaskNotification());
  if (!notification) {
    throw new Error('useTaskNotification failed to initialize');
  }
  return { notification, tarkovStore, stop: () => scope.stop() };
};
describe('useTaskNotification', () => {
  it('does not fail already completed alternatives when undoing uncomplete', async () => {
    const task: Task = {
      id: 'task-main',
      name: 'Main Task',
      objectives: [{ id: 'obj-main', count: 1 }],
      alternatives: ['task-alt-done'],
    };
    const alternative: Task = {
      id: 'task-alt-done',
      name: 'Completed Alt',
      objectives: [{ id: 'obj-alt-done', count: 1 }],
    };
    const { notification, tarkovStore, stop } = await setup([task, alternative], {
      isTaskComplete: (taskId) => taskId === 'task-alt-done',
      objectiveCounts: { 'obj-alt-done': 1 },
    });
    notification.onTaskAction({
      action: 'uncomplete',
      taskId: 'task-main',
      taskName: 'Main Task',
      statusKey: 'page.tasks.questcard.status_uncomplete',
    });
    notification.undoLastAction();
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('task-main');
    expect(tarkovStore.setTaskFailed).not.toHaveBeenCalledWith('task-alt-done');
    expect(tarkovStore.setTaskObjectiveUncomplete).not.toHaveBeenCalledWith('obj-alt-done');
    expect(tarkovStore.setObjectiveCount).not.toHaveBeenCalledWith('obj-alt-done', 0);
    stop();
  });
  const tourGated = (id: string): Task => ({
    id,
    name: id,
    otherRequirements: [
      {
        type: 'storyObjective',
        id: `overlay.${id}.tour.talk-to-therapist`,
        storyChapter: { id: 'tour' },
        objective: { id: 'talk' },
      },
    ],
  });
  const recorded = [{ chapterId: 'tour', objectiveId: 'talk' }];
  it.each(['complete', 'fail'] as const)(
    'undoing %s releases the story objectives that action recorded',
    async (action) => {
      const { notification, tarkovStore, stop } = await setup([tourGated('fil')]);
      notification.onTaskAction({
        action,
        taskId: 'fil',
        taskName: 'fil',
        statusKey: 'status',
        recordedStoryObjectives: recorded,
      });
      notification.undoLastAction();
      expect(tarkovStore.setStoryObjectiveUncomplete).toHaveBeenCalledWith('tour', 'talk');
      stop();
    }
  );
  it('keeps a released story objective another completed task still implies', async () => {
    const { notification, tarkovStore, stop } = await setup(
      [tourGated('fil'), tourGated('aquarius')],
      { isTaskComplete: (taskId) => taskId === 'aquarius' }
    );
    notification.onTaskAction({
      action: 'complete',
      taskId: 'fil',
      taskName: 'fil',
      statusKey: 'status',
      recordedStoryObjectives: recorded,
    });
    notification.undoLastAction();
    expect(tarkovStore.setStoryObjectiveUncomplete).not.toHaveBeenCalled();
    stop();
  });
  it('leaves story objectives alone when the action recorded none', async () => {
    const { notification, tarkovStore, stop } = await setup([tourGated('fil')]);
    notification.onTaskAction({
      action: 'complete',
      taskId: 'fil',
      taskName: 'fil',
      statusKey: 'status',
    });
    notification.undoLastAction();
    expect(tarkovStore.setStoryObjectiveUncomplete).not.toHaveBeenCalled();
    stop();
  });
  const undoTask: Task = {
    id: 'task-main',
    name: 'Main Task',
    minPlayerLevel: 10,
    objectives: [{ id: 'obj-main', count: 3 }],
    alternatives: ['task-alt'],
  };
  const alternativeTask: Task = {
    id: 'task-alt',
    name: 'Alt',
    objectives: [{ id: 'obj-alt', count: 1 }],
  };
  const undo = async (
    event: Omit<
      Parameters<
        ReturnType<
          typeof import('@/composables/useTaskNotification').useTaskNotification
        >['onTaskAction']
      >[0],
      'taskId'
    >,
    options: Parameters<typeof createTarkovStore>[0] = {}
  ) => {
    const context = await setup([undoTask, alternativeTask], options);
    context.notification.onTaskAction({ taskId: 'task-main', ...event });
    context.notification.undoLastAction();
    return context;
  };
  it('undoing complete uncompletes the task, its objectives and its alternatives', async () => {
    const { tarkovStore, stop } = await undo({ action: 'complete', taskName: 'Main Task' });
    expect(tarkovStore.setTaskUncompleted).toHaveBeenCalledWith('task-main');
    expect(tarkovStore.setTaskUncompleted).toHaveBeenCalledWith('task-alt');
    expect(tarkovStore.setTaskObjectiveUncomplete).toHaveBeenCalledWith('obj-main');
    expect(tarkovStore.setTaskObjectiveUncomplete).toHaveBeenCalledWith('obj-alt');
    stop();
  });
  it('undoing uncomplete restores completion, counts, failed alternatives and level', async () => {
    const { tarkovStore, stop } = await undo(
      { action: 'uncomplete', taskName: 'Main Task' },
      { playerLevel: 4, objectiveCounts: { 'obj-alt': 1 } }
    );
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('task-main');
    expect(tarkovStore.setTaskObjectiveComplete).toHaveBeenCalledWith('obj-main');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-main', 3);
    expect(tarkovStore.setTaskFailed).toHaveBeenCalledWith('task-alt');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-alt', 0);
    expect(tarkovStore.setLevel).toHaveBeenCalledWith(10);
    stop();
  });
  it('undoing uncomplete keeps a level already at the minimum', async () => {
    const { tarkovStore, stop } = await undo(
      { action: 'uncomplete', taskName: 'Main Task' },
      { playerLevel: 12 }
    );
    expect(tarkovStore.setLevel).not.toHaveBeenCalled();
    stop();
  });
  it.each([
    [true, [{ manual: true }]],
    [false, []],
  ] as const)(
    'undoing reset_failed (manual %s) re-fails and clears objectives',
    async (manual, extra) => {
      const { tarkovStore, stop } = await undo({
        action: 'reset_failed',
        taskName: 'Main Task',
        wasManualFail: manual,
      });
      expect(tarkovStore.setTaskFailed).toHaveBeenCalledWith('task-main', ...extra);
      expect(tarkovStore.setTaskObjectiveUncomplete).toHaveBeenCalledWith('obj-main');
      expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-main', 0);
      stop();
    }
  );
  it('undoing fail uncompletes the task and its objectives only', async () => {
    const { tarkovStore, stop } = await undo({ action: 'fail', taskName: 'Main Task' });
    expect(tarkovStore.setTaskUncompleted).toHaveBeenCalledWith('task-main');
    expect(tarkovStore.setTaskUncompleted).not.toHaveBeenCalledWith('task-alt');
    expect(tarkovStore.setTaskObjectiveUncomplete).toHaveBeenCalledWith('obj-main');
    stop();
  });
  it('offers no undo for Mark available', async () => {
    const { notification, tarkovStore, stop } = await undo({
      action: 'available',
      taskName: 'Main Task',
      statusKey: 'status',
    });
    expect(notification.showUndoButton.value).toBe(false);
    expect(tarkovStore.setTaskUncompleted).not.toHaveBeenCalled();
    expect(tarkovStore.setTaskComplete).not.toHaveBeenCalled();
    stop();
  });
});
