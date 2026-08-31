import type { Task } from '@/types/tarkov';
export type TaskCompletion = { complete?: boolean; failed?: boolean };
type InvalidationInput = {
  tasks: Task[];
  taskCompletions: Record<string, TaskCompletion>;
  pmcFaction: string;
};
export type InvalidationResult = {
  invalidTasks: Record<string, boolean>;
  invalidObjectives: Record<string, boolean>;
};
const normalizeStatuses = (statuses: string[] | undefined): string[] =>
  (statuses ?? []).map((status) => status.toLowerCase());
const hasAnyStatus = (statuses: string[], values: string[]): boolean =>
  values.some((value) => statuses.includes(value));
const requiresCompletionOrActive = (statuses: string[] | undefined): boolean => {
  const normalized = normalizeStatuses(statuses);
  if (normalized.length === 0) return true;
  return hasAnyStatus(normalized, ['complete', 'completed', 'active', 'accept', 'accepted']);
};
const acceptsFailedStatus = (statuses: string[] | undefined): boolean => {
  const normalized = normalizeStatuses(statuses);
  return normalized.includes('failed');
};
const isFailedRequirementOnly = (statuses: string[] | undefined): boolean => {
  const normalized = normalizeStatuses(statuses);
  if (normalized.length === 0) return false;
  return (
    normalized.includes('failed') &&
    !hasAnyStatus(normalized, ['active', 'accept', 'accepted', 'complete', 'completed'])
  );
};
export const computeInvalidProgress = ({
  tasks,
  taskCompletions,
  pmcFaction,
}: InvalidationInput): InvalidationResult => {
  const invalidTasks: Record<string, boolean> = {};
  const invalidObjectives: Record<string, boolean> = {};
  if (!tasks.length) return { invalidTasks, invalidObjectives };
  const tasksById = new Map<string, Task>();
  const requiredBy = new Map<string, Set<string>>();
  tasks.forEach((task) => {
    tasksById.set(task.id, task);
    task.taskRequirements?.forEach((requirement) => {
      const requiredTaskId = requirement?.task?.id;
      if (!requiredTaskId || !requiresCompletionOrActive(requirement.status)) return;
      if (!requiredBy.has(requiredTaskId)) {
        requiredBy.set(requiredTaskId, new Set());
      }
      requiredBy.get(requiredTaskId)!.add(task.id);
    });
  });
  const visited = new Set<string>();
  const invalidateTaskRecursive = (taskId: string, childOnly = false) => {
    const task = tasksById.get(taskId);
    if (!task) return;
    // Never mark completed tasks as invalid - they're already done
    const completion = taskCompletions[taskId];
    const isCompleted = completion?.complete === true && completion?.failed !== true;
    if (!childOnly && !invalidTasks[taskId] && !isCompleted) {
      invalidTasks[taskId] = true;
      task.objectives?.forEach((objective) => {
        if (objective?.id) {
          invalidObjectives[objective.id] = true;
        }
      });
    }
    if (visited.has(taskId)) return;
    visited.add(taskId);
    const dependents = requiredBy.get(taskId);
    if (!dependents) return;
    // Don't propagate invalidation through completed tasks
    if (isCompleted) return;
    dependents.forEach((dependentId) => {
      // Check if the dependent task accepts failed status for this requirement
      // If so, don't invalidate it when the prereq is failed/invalid
      const dependentTask = tasksById.get(dependentId);
      const reqForThisTask = dependentTask?.taskRequirements?.find(
        (req) => req?.task?.id === taskId
      );
      if (reqForThisTask && acceptsFailedStatus(reqForThisTask.status)) {
        return; // Skip - this task accepts failed prereqs
      }
      invalidateTaskRecursive(dependentId, false);
    });
  };
  // Invalidate faction-specific tasks (but DON'T cascade - there may be faction equivalents).
  // For example, USEC and BEAR have equivalent questlines, so invalidating a USEC task
  // shouldn't invalidate Collector, which can be reached via BEAR equivalents.
  tasks.forEach((task) => {
    if (task.factionName && task.factionName !== 'Any' && task.factionName !== pmcFaction) {
      // Only mark this specific task as invalid, don't cascade to dependents
      invalidTasks[task.id] = true;
      task.objectives?.forEach((objective) => {
        if (objective?.id) {
          invalidObjectives[objective.id] = true;
        }
      });
    }
  });
  // Invalidate tasks whose failed-only requirements are not actually failed.
  tasks.forEach((task) => {
    if (!task.taskRequirements?.length) return;
    const shouldInvalidate = task.taskRequirements.some((req) => {
      if (!isFailedRequirementOnly(req.status) || !req.task?.id) return false;
      const completion = taskCompletions[req.task.id];
      return completion?.complete === true && completion?.failed !== true;
    });
    if (shouldInvalidate) {
      invalidateTaskRecursive(task.id);
    }
  });
  // Invalidate tasks whose prerequisites have been failed (making them impossible to complete).
  // Skip if the requirement explicitly accepts 'failed' status (e.g., status: ['complete', 'failed']).
  tasks.forEach((task) => {
    if (!task.taskRequirements?.length) return;
    const hasFailedPrerequisite = task.taskRequirements.some((req) => {
      if (!req.task?.id) return false;
      // If this requirement accepts failed status, a failed prereq doesn't block the task
      if (acceptsFailedStatus(req.status)) return false;
      // If this requirement needs completion/active status, check if prereq was failed
      if (!requiresCompletionOrActive(req.status)) return false;
      const completion = taskCompletions[req.task.id];
      return completion?.failed === true;
    });
    if (hasFailedPrerequisite) {
      invalidateTaskRecursive(task.id);
    }
  });
  // Invalidate alternative branches when this task is completed.
  tasks.forEach((task) => {
    if (!task.alternatives?.length) return;
    const completion = taskCompletions[task.id];
    const isCompleted = completion?.complete === true && completion?.failed !== true;
    if (!isCompleted) return;
    task.alternatives.forEach((alternativeId) => {
      invalidateTaskRecursive(alternativeId);
    });
  });
  return { invalidTasks, invalidObjectives };
};
