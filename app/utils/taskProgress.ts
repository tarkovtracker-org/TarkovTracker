import { getTaskTraderRequirements } from '@/utils/taskRequirements';
import {
  isTaskComplete,
  isTaskFailed,
  isTaskActive,
  type RawTaskCompletion,
} from '@/utils/taskStatus';
import type { Task, TaskObjective, TaskRequirement } from '@/types/tarkov';
type TaskObjectiveProgressStore = {
  getObjectiveCount: (objectiveId: string) => number;
  setObjectiveCount: (objectiveId: string, count: number) => void;
  setTaskObjectiveComplete: (objectiveId: string) => void;
  setTaskObjectiveUncomplete: (objectiveId: string) => void;
};
export type TaskProgressStore = TaskObjectiveProgressStore & {
  isTaskComplete: (taskId: string) => boolean;
  setTaskComplete: (taskId: string) => void;
  setTaskFailed: (taskId: string, options?: { manual?: boolean }) => void;
  setTaskUncompleted: (taskId: string) => void;
};
type TaskLevelProgressStore = {
  playerLevel: () => number;
  setLevel: (level: number) => void;
};
type TaskTraderProgressStore = {
  getTraderLevel: (traderId: string) => number;
  getTraderReputation: (traderId: string) => number;
  setTraderLevel: (traderId: string, level: number) => void;
  setTraderReputation: (traderId: string, reputation: number) => void;
};
const normalizeStatuses = (statuses?: string[]) =>
  (statuses ?? []).map((status) => status.toLowerCase());
const hasAnyStatus = (statuses: string[], values: string[]) =>
  values.some((value) => statuses.includes(value));
export function isFailedOnlyRequirement(statuses?: string[]): boolean {
  const normalized = normalizeStatuses(statuses);
  if (normalized.length === 0) return false;
  return (
    normalized.includes('failed') &&
    !hasAnyStatus(normalized, ['complete', 'completed', 'active', 'accept', 'accepted'])
  );
}
const getPositiveObjectiveCount = (objective: TaskObjective) => {
  const count = objective.count ?? 0;
  return count > 0 ? count : undefined;
};
const completeTaskObjective = (store: TaskObjectiveProgressStore, objective: TaskObjective) => {
  if (!objective?.id) return;
  store.setTaskObjectiveComplete(objective.id);
  const count = getPositiveObjectiveCount(objective);
  if (count === undefined) return;
  store.setObjectiveCount(objective.id, count);
};
const completeTaskObjectives = (store: TaskObjectiveProgressStore, objectives: TaskObjective[]) => {
  objectives.forEach((objective) => completeTaskObjective(store, objective));
};
const shouldClearObjectiveCount = (objective: TaskObjective, currentCount: number) =>
  (objective.count ?? 0) > 0 || currentCount > 0;
const clearTaskObjectives = (store: TaskObjectiveProgressStore, objectives: TaskObjective[]) => {
  objectives.forEach((objective) => {
    if (!objective?.id) return;
    store.setTaskObjectiveUncomplete(objective.id);
    const currentCount = store.getObjectiveCount(objective.id);
    if (shouldClearObjectiveCount(objective, currentCount)) {
      store.setObjectiveCount(objective.id, 0);
    }
  });
};
const uncompleteTaskObjectives = (
  store: TaskObjectiveProgressStore,
  objectives: TaskObjective[]
) => {
  objectives.forEach((objective) => {
    if (!objective?.id) return;
    store.setTaskObjectiveUncomplete(objective.id);
  });
};
const failAlternativeTasks = (
  store: TaskProgressStore,
  tasksMap: ReadonlyMap<string, Task>,
  alternatives: string[] | undefined
) => {
  if (!Array.isArray(alternatives)) return;
  alternatives.forEach((alternativeTaskId) => {
    if (store.isTaskComplete(alternativeTaskId)) return;
    store.setTaskFailed(alternativeTaskId);
    const alternativeTask = tasksMap.get(alternativeTaskId);
    if (alternativeTask?.objectives) {
      clearTaskObjectives(store, alternativeTask.objectives);
    }
  });
};
export function completeTaskForProgress(options: {
  store: TaskProgressStore;
  taskId: string;
  tasksMap: ReadonlyMap<string, Task>;
}): void {
  const { store, taskId, tasksMap } = options;
  store.setTaskComplete(taskId);
  const task = tasksMap.get(taskId);
  if (!task) return;
  completeTaskObjectives(store, task.objectives ?? []);
  failAlternativeTasks(store, tasksMap, task.alternatives);
}
export function failTaskForProgress(options: {
  store: TaskProgressStore;
  taskId: string;
  tasksMap: ReadonlyMap<string, Task>;
  manual?: boolean;
}): void {
  const { store, taskId, tasksMap, manual } = options;
  if (manual === undefined) {
    store.setTaskFailed(taskId);
  } else {
    store.setTaskFailed(taskId, { manual });
  }
  const task = tasksMap.get(taskId);
  if (!task) return;
  clearTaskObjectives(store, task.objectives ?? []);
}
export function uncompleteTaskForProgress(options: {
  store: TaskProgressStore;
  taskId: string;
  tasksMap: ReadonlyMap<string, Task>;
  restoreAlternatives?: boolean;
}): void {
  const { store, taskId, tasksMap, restoreAlternatives = true } = options;
  const uncompleteTask = (currentTaskId: string) => {
    store.setTaskUncompleted(currentTaskId);
    const currentTask = tasksMap.get(currentTaskId);
    if (currentTask?.objectives) {
      uncompleteTaskObjectives(store, currentTask.objectives);
    }
  };
  const task = tasksMap.get(taskId);
  uncompleteTask(taskId);
  if (!restoreAlternatives) return;
  const alternatives = Array.isArray(task?.alternatives) ? task.alternatives : [];
  alternatives.forEach(uncompleteTask);
}
export function ensureTaskMinPlayerLevel(store: TaskLevelProgressStore, task: Task): void {
  const minLevel = task.minPlayerLevel ?? 0;
  if (minLevel <= 0 || store.playerLevel() >= minLevel) return;
  store.setLevel(minLevel);
}
type KnownTraderRequirement = Exclude<
  ReturnType<typeof getTaskTraderRequirements>[number],
  { requirementType: 'unknown' }
>;
const applyLoyaltyMinimum = (
  store: TaskTraderProgressStore,
  requirement: KnownTraderRequirement
) => {
  const minimum = requirement.value + (requirement.compareMethod === '>' ? 1 : 0);
  if (minimum <= 4 && store.getTraderLevel(requirement.trader.id) < minimum)
    store.setTraderLevel(requirement.trader.id, minimum);
};
const applyTraderMinimum = (
  store: TaskTraderProgressStore,
  requirement: KnownTraderRequirement
) => {
  if (requirement.requirementType === 'level') return applyLoyaltyMinimum(store, requirement);
  // Standing has no declared increment; do not invent a value above a strict bound.
  if (requirement.compareMethod === '>') return;
  if (store.getTraderReputation(requirement.trader.id) < requirement.value)
    store.setTraderReputation(requirement.trader.id, requirement.value);
};
/** Completion proves lower bounds, never that earned progress should be reduced. */
export function applyTaskTraderRequirements(options: {
  store: TaskTraderProgressStore;
  task: Task;
}): void {
  for (const requirement of getTaskTraderRequirements(options.task)) {
    if (requirement.requirementType === 'unknown') continue;
    if (['>=', '>', '=', '=='].includes(requirement.compareMethod))
      applyTraderMinimum(options.store, requirement);
  }
}
const completedStatusMet = (completion: RawTaskCompletion, values: string[]) =>
  (!values.length || hasAnyStatus(values, ['complete', 'completed'])) && isTaskComplete(completion);
const activeStatusMet = (completion: RawTaskCompletion, values: string[]) =>
  hasAnyStatus(values, ['active', 'accept', 'accepted']) &&
  (isTaskActive(completion) || isTaskComplete(completion));
const alreadyMeetsStatus = (completion: RawTaskCompletion, statuses?: string[]): boolean => {
  const values = normalizeStatuses(statuses);
  return (
    completedStatusMet(completion, values) ||
    (values.includes('failed') && isTaskFailed(completion)) ||
    activeStatusMet(completion, values)
  );
};
const requiredTaskId = (requirement: TaskRequirement) => requirement?.task?.id;
export function applyTaskAvailabilityRequirements(options: {
  getCompletion?: (taskId: string) => RawTaskCompletion;
  skipTaskRequirements?: boolean;
  onCompleteRequirement: (taskId: string) => void;
  onFailRequirement: (taskId: string) => void;
  task: Task;
}): void {
  const {
    task,
    onCompleteRequirement,
    onFailRequirement,
    getCompletion = () => undefined,
  } = options;
  if (options.skipTaskRequirements) return;
  const handledRequirementTaskIds = new Set<string>();
  const taskRequirements = Array.isArray(task.taskRequirements) ? task.taskRequirements : [];
  const predecessors = Array.isArray(task.predecessors) ? task.predecessors : [];
  taskRequirements.forEach((requirement) => {
    const requirementTaskId = requiredTaskId(requirement);
    if (!requirementTaskId) return;
    handledRequirementTaskIds.add(requirementTaskId);
    if (alreadyMeetsStatus(getCompletion(requirementTaskId), requirement.status)) return;
    if (isFailedOnlyRequirement(requirement.status)) {
      onFailRequirement(requirementTaskId);
    } else {
      onCompleteRequirement(requirementTaskId);
    }
    handledRequirementTaskIds.add(requirementTaskId);
  });
  predecessors.forEach((predecessorId) => {
    if (!predecessorId) return;
    if (handledRequirementTaskIds.has(predecessorId)) return;
    onCompleteRequirement(predecessorId);
  });
}
