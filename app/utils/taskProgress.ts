import {
  acceptsActiveStatus,
  acceptsCompletionStatus,
  acceptsFailedStatus,
  isFailedOnlyRequirement,
  normalizeRequirementStatuses,
} from '@shared/utils/requirementStatus';
import { storyObjectiveRequirements } from '@/utils/taskOtherRequirements';
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
/** A started, completed or failed task has passed its start gates, so its story objectives were met. */
export function recordImpliedStoryObjectives(
  store: { setStoryObjectiveComplete: (chapterId: string, objectiveId: string) => void },
  task: Task
): void {
  for (const gate of storyObjectiveRequirements(task))
    store.setStoryObjectiveComplete(gate.storyChapter.id, gate.objective.id);
}
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
  (!values.length || acceptsCompletionStatus(values)) && isTaskComplete(completion);
const activeStatusMet = (completion: RawTaskCompletion, values: string[]) =>
  acceptsActiveStatus(values) && (isTaskActive(completion) || isTaskComplete(completion));
const alreadyMeetsStatus = (completion: RawTaskCompletion, statuses?: string[]): boolean => {
  const values = normalizeRequirementStatuses(statuses);
  return (
    completedStatusMet(completion, values) ||
    (acceptsFailedStatus(values) && isTaskFailed(completion)) ||
    activeStatusMet(completion, values)
  );
};
const requiredTaskId = (requirement: TaskRequirement) => requirement?.task?.id;
const completionOnlyRequirement = (requirement: TaskRequirement): boolean =>
  (requirement.status ?? []).every((status) =>
    ['complete', 'completed'].includes(status.toLowerCase())
  );
/** Non-object entries are malformed declared gates, never an unambiguous requirement. */
const unambiguousRequirement = (requirement: TaskRequirement): boolean =>
  Boolean(requirement && typeof requirement === 'object') &&
  (completionOnlyRequirement(requirement) || isFailedOnlyRequirement(requirement.status));
const resolvableRequirement = (
  requirement: TaskRequirement,
  getCompletion: (taskId: string) => RawTaskCompletion
): boolean => {
  const taskId = requiredTaskId(requirement);
  if (!taskId) return false;
  return (
    alreadyMeetsStatus(getCompletion(taskId), requirement.status) ||
    unambiguousRequirement(requirement)
  );
};
/**
 * Mark available can only settle a task's direct prerequisites when each unmet one names a single
 * status to record; an unmet active/mixed-status or malformed entry leaves the task locked, so the
 * action must not change any progress for it.
 */
export const canApplyTaskAvailabilityRequirements = (
  task: Task,
  getCompletion: (taskId: string) => RawTaskCompletion,
  skipTaskRequirements = false,
  /**
   * The evaluator's unmet direct prerequisites, when known. It already accepts an active
   * prerequisite that is itself available, so only what it still reports needs a recordable status.
   */
  unmetRequirements?: TaskRequirement[]
): boolean => {
  if (skipTaskRequirements || !Array.isArray(task.taskRequirements)) return true;
  if (unmetRequirements) return unmetRequirements.every(unambiguousRequirement);
  return task.taskRequirements.every((requirement) =>
    resolvableRequirement(requirement, getCompletion)
  );
};
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
    } else if (completionOnlyRequirement(requirement)) {
      onCompleteRequirement(requirementTaskId);
    }
  });
  // Flattened graph ancestors cannot identify a historical route through alternative statuses.
  if (!taskRequirements.every(unambiguousRequirement)) return;
  predecessors.forEach((predecessorId) => {
    if (!predecessorId) return;
    if (handledRequirementTaskIds.has(predecessorId)) return;
    // Transitive inference never resurrects a failed task: only the task the player confirmed
    // available can justify flipping its own direct gates.
    if (isTaskFailed(getCompletion(predecessorId))) return;
    onCompleteRequirement(predecessorId);
  });
}
