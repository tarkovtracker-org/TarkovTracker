import type { Task, TaskObjective } from '@/types/tarkov';
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
  if (store.playerLevel() >= minLevel) return;
  store.setLevel(minLevel);
}
const applyTraderLevelRequirement = (
  store: TaskTraderProgressStore,
  traderId: string,
  requiredLevel: number
) => {
  if (store.getTraderLevel(traderId) >= requiredLevel) return;
  store.setTraderLevel(traderId, requiredLevel);
};
const getPositiveRequiredReputation = (currentReputation: number, requiredReputation: number) =>
  currentReputation < requiredReputation ? requiredReputation : undefined;
const getNegativeFenceRequiredReputation = (
  currentReputation: number,
  requiredReputation: number,
  isFence: boolean
) => {
  if (!isFence) return undefined;
  return currentReputation > requiredReputation ? requiredReputation : undefined;
};
const getRequiredTraderReputation = (
  currentReputation: number,
  requiredReputation: number,
  isFence: boolean
) => {
  if (requiredReputation >= 0) {
    return getPositiveRequiredReputation(currentReputation, requiredReputation);
  }
  return getNegativeFenceRequiredReputation(currentReputation, requiredReputation, isFence);
};
const applyTraderReputationRequirement = (
  store: TaskTraderProgressStore,
  traderId: string,
  requiredReputation: number,
  fenceId: string | undefined
) => {
  const reputation = getRequiredTraderReputation(
    store.getTraderReputation(traderId),
    requiredReputation,
    traderId === fenceId
  );
  if (reputation === undefined) return;
  store.setTraderReputation(traderId, reputation);
};
const getTraderId = (requirement: { trader?: { id: string } }) => requirement.trader?.id;
const getTaskTraderLevelRequirements = (task: Task) => task.traderLevelRequirements ?? [];
const getTaskTraderReputationRequirements = (task: Task) => task.traderRequirements ?? [];
const applyTaskTraderLevelRequirements = (store: TaskTraderProgressStore, task: Task) => {
  for (const requirement of getTaskTraderLevelRequirements(task)) {
    const traderId = getTraderId(requirement);
    if (!traderId) continue;
    applyTraderLevelRequirement(store, traderId, requirement.level);
  }
};
const applyTaskTraderReputationRequirements = (
  store: TaskTraderProgressStore,
  task: Task,
  fenceId: string | undefined
) => {
  for (const requirement of getTaskTraderReputationRequirements(task)) {
    const traderId = getTraderId(requirement);
    if (!traderId) continue;
    applyTraderReputationRequirement(store, traderId, requirement.value, fenceId);
  }
};
export function applyTaskTraderRequirements(options: {
  store: TaskTraderProgressStore;
  task: Task;
  fenceId?: string;
}): void {
  const { store, task, fenceId } = options;
  applyTaskTraderLevelRequirements(store, task);
  applyTaskTraderReputationRequirements(store, task, fenceId);
}
export function applyTaskAvailabilityRequirements(options: {
  onCompleteRequirement: (taskId: string) => void;
  onFailRequirement: (taskId: string) => void;
  task: Task;
}): void {
  const { task, onCompleteRequirement, onFailRequirement } = options;
  const handledRequirementTaskIds = new Set<string>();
  const taskRequirements = Array.isArray(task.taskRequirements) ? task.taskRequirements : [];
  const predecessors = Array.isArray(task.predecessors) ? task.predecessors : [];
  taskRequirements.forEach((requirement) => {
    const requirementTaskId = requirement?.task?.id;
    if (!requirementTaskId) return;
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
