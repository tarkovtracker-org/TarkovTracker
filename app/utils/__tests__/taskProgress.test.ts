import { describe, expect, it, vi } from 'vitest';
import {
  applyTaskAvailabilityRequirements,
  applyTaskTraderRequirements,
  completeTaskForProgress,
  ensureTaskMinPlayerLevel,
  failTaskForProgress,
  isFailedOnlyRequirement,
  uncompleteTaskForProgress,
} from '@/utils/taskProgress';
import type { Task } from '@/types/tarkov';
const createStore = (
  options: {
    completedTaskIds?: string[];
    objectiveCounts?: Record<string, number>;
    playerLevel?: number;
    traderLevels?: Record<string, number>;
    traderReputations?: Record<string, number>;
  } = {}
) => {
  const objectiveCounts = new Map(Object.entries(options.objectiveCounts ?? {}));
  return {
    getObjectiveCount: vi.fn((objectiveId: string) => objectiveCounts.get(objectiveId) ?? 0),
    getTraderLevel: vi.fn((traderId: string) => options.traderLevels?.[traderId] ?? 1),
    getTraderReputation: vi.fn((traderId: string) => options.traderReputations?.[traderId] ?? 0),
    isTaskComplete: vi.fn((taskId: string) => options.completedTaskIds?.includes(taskId) ?? false),
    playerLevel: vi.fn(() => options.playerLevel ?? 1),
    setLevel: vi.fn(),
    setObjectiveCount: vi.fn((objectiveId: string, count: number) => {
      objectiveCounts.set(objectiveId, count);
    }),
    setTaskComplete: vi.fn(),
    setTaskFailed: vi.fn(),
    setTaskObjectiveComplete: vi.fn(),
    setTaskObjectiveUncomplete: vi.fn(),
    setTaskUncompleted: vi.fn(),
    setTraderLevel: vi.fn(),
    setTraderReputation: vi.fn(),
  };
};
const createTasksMap = (...tasks: Task[]) => new Map(tasks.map((task) => [task.id, task]));
describe('task progress actions', () => {
  it('completes objectives and fails only incomplete alternatives', () => {
    const task: Task = {
      id: 'main',
      objectives: [{ id: 'main-objective', count: 2 }],
      alternatives: ['incomplete-alternative', 'complete-alternative'],
    };
    const incompleteAlternative: Task = {
      id: 'incomplete-alternative',
      objectives: [{ id: 'incomplete-objective', count: 1 }],
    };
    const completeAlternative: Task = {
      id: 'complete-alternative',
      objectives: [{ id: 'complete-objective', count: 1 }],
    };
    const store = createStore({
      completedTaskIds: ['complete-alternative'],
      objectiveCounts: { 'incomplete-objective': 1 },
    });
    completeTaskForProgress({
      store,
      taskId: task.id,
      tasksMap: createTasksMap(task, incompleteAlternative, completeAlternative),
    });
    expect(store.setTaskComplete).toHaveBeenCalledWith('main');
    expect(store.setTaskObjectiveComplete).toHaveBeenCalledWith('main-objective');
    expect(store.setObjectiveCount).toHaveBeenCalledWith('main-objective', 2);
    expect(store.setTaskFailed).toHaveBeenCalledTimes(1);
    expect(store.setTaskFailed).toHaveBeenCalledWith('incomplete-alternative');
    expect(store.setTaskObjectiveUncomplete).toHaveBeenCalledWith('incomplete-objective');
    expect(store.setTaskObjectiveUncomplete).not.toHaveBeenCalledWith('complete-objective');
  });
  it('records manual failure and clears objective state', () => {
    const task: Task = {
      id: 'failed-task',
      objectives: [{ id: 'failed-objective' }],
    };
    const store = createStore({ objectiveCounts: { 'failed-objective': 4 } });
    failTaskForProgress({
      store,
      taskId: task.id,
      tasksMap: createTasksMap(task),
      manual: true,
    });
    expect(store.setTaskFailed).toHaveBeenCalledWith('failed-task', { manual: true });
    expect(store.setTaskObjectiveUncomplete).toHaveBeenCalledWith('failed-objective');
    expect(store.setObjectiveCount).toHaveBeenCalledWith('failed-objective', 0);
  });
  it('uncompletes a task and its alternatives without changing objective counts', () => {
    const task: Task = {
      id: 'main',
      objectives: [{ id: 'main-objective', count: 2 }],
      alternatives: ['alternative'],
    };
    const alternative: Task = {
      id: 'alternative',
      objectives: [{ id: 'alternative-objective', count: 3 }],
    };
    const store = createStore();
    uncompleteTaskForProgress({
      store,
      taskId: task.id,
      tasksMap: createTasksMap(task, alternative),
    });
    expect(store.setTaskUncompleted).toHaveBeenNthCalledWith(1, 'main');
    expect(store.setTaskUncompleted).toHaveBeenNthCalledWith(2, 'alternative');
    expect(store.setTaskObjectiveUncomplete).toHaveBeenCalledWith('main-objective');
    expect(store.setTaskObjectiveUncomplete).toHaveBeenCalledWith('alternative-objective');
    expect(store.setObjectiveCount).not.toHaveBeenCalled();
  });
});
describe('task progress requirements', () => {
  it('raises player level only when the task requires it', () => {
    const lowLevelStore = createStore({ playerLevel: 3 });
    const highLevelStore = createStore({ playerLevel: 8 });
    const task: Task = { id: 'level-task', minPlayerLevel: 5 };
    ensureTaskMinPlayerLevel(lowLevelStore, task);
    ensureTaskMinPlayerLevel(highLevelStore, task);
    expect(lowLevelStore.setLevel).toHaveBeenCalledWith(5);
    expect(highLevelStore.setLevel).not.toHaveBeenCalled();
  });
  it('backfills only unmet trader levels and valid reputation requirements', () => {
    const store = createStore({
      traderLevels: { fence: 1, prapor: 4 },
      traderReputations: { fence: 0, prapor: 0 },
    });
    const task: Task = {
      id: 'trader-task',
      traderLevelRequirements: [
        { id: 'fence-level', trader: { id: 'fence', name: 'Fence' }, level: 2 },
        { id: 'prapor-level', trader: { id: 'prapor', name: 'Prapor' }, level: 3 },
      ],
      traderRequirements: [
        { id: 'fence-reputation', trader: { id: 'fence', name: 'Fence' }, value: -2 },
        { id: 'prapor-reputation', trader: { id: 'prapor', name: 'Prapor' }, value: -1 },
      ],
    };
    applyTaskTraderRequirements({ store, task, fenceId: 'fence' });
    expect(store.setTraderLevel).toHaveBeenCalledTimes(1);
    expect(store.setTraderLevel).toHaveBeenCalledWith('fence', 2);
    expect(store.setTraderReputation).toHaveBeenCalledTimes(1);
    expect(store.setTraderReputation).toHaveBeenCalledWith('fence', -2);
  });
  it('applies each requirement task once with failure taking precedence', () => {
    const onCompleteRequirement = vi.fn();
    const onFailRequirement = vi.fn();
    const task: Task = {
      id: 'available-task',
      taskRequirements: [
        { task: { id: 'failed-requirement' }, status: ['Failed'] },
        { task: { id: 'complete-requirement' }, status: ['Completed'] },
      ],
      predecessors: ['failed-requirement', 'complete-requirement', 'legacy-predecessor'],
    };
    applyTaskAvailabilityRequirements({ onCompleteRequirement, onFailRequirement, task });
    expect(onFailRequirement).toHaveBeenCalledTimes(1);
    expect(onFailRequirement).toHaveBeenCalledWith('failed-requirement');
    expect(onCompleteRequirement).toHaveBeenCalledTimes(2);
    expect(onCompleteRequirement).toHaveBeenCalledWith('complete-requirement');
    expect(onCompleteRequirement).toHaveBeenCalledWith('legacy-predecessor');
    expect(isFailedOnlyRequirement(['Failed'])).toBe(true);
    expect(isFailedOnlyRequirement(['Failed', 'Completed'])).toBe(false);
  });
});
