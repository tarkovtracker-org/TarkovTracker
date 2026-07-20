import type { TarkovTask, TaskCompletion } from '../types';
type InvalidationInput = {
  tasks: TarkovTask[];
  taskCompletions: Record<string, TaskCompletion>;
  pmcFaction: string;
};
type InvalidationResult = {
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
  const tasksById = new Map<string, TarkovTask>();
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
  const invalidateTaskRecursive = (taskId: string) => {
    const task = tasksById.get(taskId);
    if (!task) return;
    const completion = taskCompletions[taskId];
    const isCompleted = completion?.complete === true && completion?.failed !== true;
    if (!invalidTasks[taskId] && !isCompleted) {
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
    if (isCompleted) return;
    dependents.forEach((dependentId) => invalidateTaskRecursive(dependentId));
  };
  // Invalidate faction-specific tasks (no cascade)
  tasks.forEach((task) => {
    if (task.factionName && task.factionName !== 'Any' && task.factionName !== pmcFaction) {
      invalidTasks[task.id] = true;
      task.objectives?.forEach((objective) => {
        if (objective?.id) {
          invalidObjectives[objective.id] = true;
        }
      });
    }
  });
  // Invalidate tasks with failed-only requirements
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
  // Invalidate tasks with failed prerequisites
  tasks.forEach((task) => {
    if (!task.taskRequirements?.length) return;
    const hasFailedPrerequisite = task.taskRequirements.some((req) => {
      if (!req.task?.id) return false;
      if (!requiresCompletionOrActive(req.status)) return false;
      const completion = taskCompletions[req.task.id];
      return completion?.failed === true;
    });
    if (hasFailedPrerequisite) {
      invalidateTaskRecursive(task.id);
    }
  });
  return { invalidTasks, invalidObjectives };
};
