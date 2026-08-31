import { describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { Task } from '@/types/tarkov';
const createTarkovStore = (options: {
  isTaskComplete?: (taskId: string) => boolean;
  objectiveCounts?: Record<string, number>;
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
    playerLevel: vi.fn(() => 1),
    setLevel: vi.fn(),
    isTaskComplete: vi.fn((taskId: string) => options.isTaskComplete?.(taskId) ?? false),
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
