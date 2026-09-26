import { describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { Task } from '@/types/tarkov';
const createTarkovStore = (options: {
  isTaskComplete?: (taskId: string) => boolean;
  isTaskActive?: (taskId: string) => boolean;
  objectiveCounts?: Record<string, number>;
}) => {
  const objectiveCounts = new Map<string, number>(Object.entries(options.objectiveCounts ?? {}));
  const manualActivityHistory: unknown[] = [];
  return {
    setTaskComplete: vi.fn(),
    setTaskActive: vi.fn(),
    isTaskActive: vi.fn((taskId: string) => options.isTaskActive?.(taskId) ?? false),
    setTaskFailed: vi.fn(),
    setTaskUncompleted: vi.fn(),
    setTaskObjectiveComplete: vi.fn(),
    setTaskObjectiveUncomplete: vi.fn(),
    setObjectiveCount: vi.fn((objectiveId: string, count: number) => {
      objectiveCounts.set(objectiveId, count);
    }),
    getObjectiveCount: vi.fn((objectiveId: string) => objectiveCounts.get(objectiveId) ?? 0),
    playerLevel: vi.fn(() => 1),
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
  it('records and reverses accepting a task', async () => {
    const task: Task = { id: 'task-active', name: 'Task Active' };
    const { notification, tarkovStore, stop } = await setup([task]);
    notification.onTaskAction({
      action: 'active',
      taskId: task.id,
      taskName: task.name!,
      statusKey: 'page.tasks.questcard.status_active',
    });
    await notification.undoLastAction();
    expect(tarkovStore.setTaskUncompleted).toHaveBeenCalledWith(task.id);
    stop();
  });
  it.each(['complete', 'fail'] as const)('restores acceptance when undoing %s', async (action) => {
    const task: Task = { id: 'accepted', name: 'Accepted task' };
    const { notification, tarkovStore, stop } = await setup([task], {
      isTaskActive: () => true,
    });
    notification.onTaskAction({ action, taskId: task.id, taskName: task.name! });
    tarkovStore.isTaskActive.mockReturnValue(false);
    await notification.undoLastAction();
    expect(tarkovStore.setTaskActive).toHaveBeenCalledWith(task.id);
    expect(tarkovStore.setTaskUncompleted).not.toHaveBeenCalled();
    stop();
  });
  it.each(['complete', 'fail'] as const)(
    'keeps a neutral task neutral when undoing %s',
    async (action) => {
      const task: Task = { id: 'neutral', name: 'Neutral task' };
      const { notification, tarkovStore, stop } = await setup([task]);
      notification.onTaskAction({ action, taskId: task.id, taskName: task.name! });
      await notification.undoLastAction();
      expect(tarkovStore.setTaskUncompleted).toHaveBeenCalledWith(task.id);
      expect(tarkovStore.setTaskActive).not.toHaveBeenCalled();
      stop();
    }
  );
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
    await notification.undoLastAction();
    expect(tarkovStore.setTaskComplete).toHaveBeenCalledWith('task-main');
    expect(tarkovStore.setTaskFailed).not.toHaveBeenCalledWith('task-alt-done');
    expect(tarkovStore.setTaskObjectiveUncomplete).not.toHaveBeenCalledWith('obj-alt-done');
    expect(tarkovStore.setObjectiveCount).not.toHaveBeenCalledWith('obj-alt-done', 0);
    stop();
  });
});
