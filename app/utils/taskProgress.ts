import type { Task, TaskObjective } from '@/types/tarkov';
export type TaskProgressStore = {
  getObjectiveCount: (objectiveId: string) => number;
  isTaskComplete: (taskId: string) => boolean;
  setObjectiveCount: (objectiveId: string, count: number) => void;
  setTaskComplete: (taskId: string) => void;
  setTaskFailed: (taskId: string) => void;
  setTaskObjectiveComplete: (objectiveId: string) => void;
  setTaskObjectiveUncomplete: (objectiveId: string) => void;
};
type TaskAlternativesAction = 'setTaskFailed';
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
const handleTaskObjectives = (
  store: TaskProgressStore,
  objectives: TaskObjective[],
  action: 'setTaskObjectiveComplete' | 'setTaskObjectiveUncomplete'
) => {
  objectives.forEach((objective) => {
    if (!objective?.id) return;
    if (action === 'setTaskObjectiveComplete') {
      store.setTaskObjectiveComplete(objective.id);
      if (objective.count !== undefined && objective.count > 0) {
        store.setObjectiveCount(objective.id, objective.count);
      }
      return;
    }
    store.setTaskObjectiveUncomplete(objective.id);
  });
};
const clearTaskObjectives = (store: TaskProgressStore, objectives: TaskObjective[]) => {
  objectives.forEach((objective) => {
    if (!objective?.id) return;
    store.setTaskObjectiveUncomplete(objective.id);
    const currentCount = store.getObjectiveCount(objective.id);
    if ((objective.count ?? 0) > 0 || currentCount > 0) {
      store.setObjectiveCount(objective.id, 0);
    }
  });
};
const handleAlternatives = (
  store: TaskProgressStore,
  tasksMap: ReadonlyMap<string, Task>,
  alternatives: string[] | undefined,
  taskAction: TaskAlternativesAction
) => {
  if (!Array.isArray(alternatives)) return;
  alternatives.forEach((alternativeTaskId) => {
    const preserveCompletedAlternative =
      taskAction === 'setTaskFailed' && store.isTaskComplete(alternativeTaskId);
    if (preserveCompletedAlternative) return;
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
  if (task?.objectives) {
    handleTaskObjectives(store, task.objectives, 'setTaskObjectiveComplete');
  }
  if (task?.alternatives) {
    handleAlternatives(store, tasksMap, task.alternatives, 'setTaskFailed');
  }
}
export function failTaskForProgress(options: {
  store: TaskProgressStore;
  taskId: string;
  tasksMap: ReadonlyMap<string, Task>;
}): void {
  const { store, taskId, tasksMap } = options;
  store.setTaskFailed(taskId);
  const task = tasksMap.get(taskId);
  if (task?.objectives) {
    clearTaskObjectives(store, task.objectives);
  }
}
export function applyTaskAvailabilityRequirements(options: {
  onCompleteRequirement: (taskId: string) => void;
  onFailRequirement: (taskId: string) => void;
  task: Task;
}): void {
  const { task, onCompleteRequirement, onFailRequirement } = options;
  const handledRequirementTaskIds = new Set<string>();
  const failedRequirementTaskIds = new Set<string>();
  const taskRequirements = Array.isArray(task.taskRequirements) ? task.taskRequirements : [];
  const predecessors = Array.isArray(task.predecessors) ? task.predecessors : [];
  taskRequirements.forEach((requirement) => {
    const requirementTaskId = requirement?.task?.id;
    if (!requirementTaskId) return;
    if (isFailedOnlyRequirement(requirement.status)) {
      onFailRequirement(requirementTaskId);
      failedRequirementTaskIds.add(requirementTaskId);
    } else {
      onCompleteRequirement(requirementTaskId);
    }
    handledRequirementTaskIds.add(requirementTaskId);
  });
  predecessors.forEach((predecessorId) => {
    if (!predecessorId) return;
    if (handledRequirementTaskIds.has(predecessorId)) return;
    if (failedRequirementTaskIds.has(predecessorId)) return;
    onCompleteRequirement(predecessorId);
  });
}
