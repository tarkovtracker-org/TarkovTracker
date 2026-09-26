/**
 * Progress invalidation shared by the Nuxt app and the api-gateway Worker.
 *
 * Runtime-independent: this module must not import Nuxt, Vue, or Worker modules. Callers pass
 * tasks in whatever shape their runtime uses; only the structural fields declared below are read.
 *
 * "Invalid" means a task (and its objectives) can no longer be completed by this player given
 * their faction and recorded completions/failures. Tasks that ARE failed are not invalid — they
 * are simply failed; invalidation targets what the failure makes unreachable downstream.
 */
export type InvalidationTaskCompletion = { complete?: boolean; failed?: boolean };
export type InvalidationTaskRequirement = { task?: { id: string }; status?: string[] };
export type InvalidationTask = {
  id: string;
  factionName?: string;
  objectives?: Array<{ id?: string }>;
  taskRequirements?: InvalidationTaskRequirement[];
  /**
   * Legacy alternative-branch ids. Upstream no longer ships this field; it is read here only to
   * preserve existing behavior for callers that still populate it.
   */
  alternatives?: string[];
};
export type InvalidationInput = {
  tasks: readonly InvalidationTask[];
  taskCompletions: Record<string, InvalidationTaskCompletion>;
  pmcFaction: string;
};
export type InvalidationResult = {
  invalidTasks: Record<string, boolean>;
  invalidObjectives: Record<string, boolean>;
};
const COMPLETION_OR_ACTIVE_STATUSES = ['complete', 'completed', 'active', 'accept', 'accepted'];
const normalizeStatuses = (statuses: string[] | undefined): string[] =>
  (statuses ?? []).map((status) => status.toLowerCase());
const hasAnyStatus = (statuses: string[], values: string[]): boolean =>
  values.some((value) => statuses.includes(value));
/** An empty status list means "must be complete or active" (upstream default). */
const requiresCompletionOrActive = (statuses: string[] | undefined): boolean => {
  const normalized = normalizeStatuses(statuses);
  if (normalized.length === 0) return true;
  return hasAnyStatus(normalized, COMPLETION_OR_ACTIVE_STATUSES);
};
const acceptsFailedStatus = (statuses: string[] | undefined): boolean =>
  normalizeStatuses(statuses).includes('failed');
/** The requirement is satisfied only by a failed prerequisite (e.g. `status: ['failed']`). */
const isFailedRequirementOnly = (statuses: string[] | undefined): boolean => {
  const normalized = normalizeStatuses(statuses);
  if (normalized.length === 0) return false;
  return normalized.includes('failed') && !hasAnyStatus(normalized, COMPLETION_OR_ACTIVE_STATUSES);
};
const isCompleted = (completion: InvalidationTaskCompletion | undefined): boolean =>
  completion?.complete === true && completion?.failed !== true;
export const computeInvalidProgress = ({
  tasks,
  taskCompletions,
  pmcFaction,
}: InvalidationInput): InvalidationResult => {
  const invalidTasks: Record<string, boolean> = {};
  const invalidObjectives: Record<string, boolean> = {};
  if (!tasks.length) return { invalidTasks, invalidObjectives };
  const tasksById = new Map<string, InvalidationTask>();
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
  const markInvalid = (task: InvalidationTask) => {
    // Terminal outcomes take precedence over every invalidation entry point.
    const completion = taskCompletions[task.id];
    if (isCompleted(completion) || completion?.failed === true) return;
    invalidTasks[task.id] = true;
    task.objectives?.forEach((objective) => {
      if (objective?.id) {
        invalidObjectives[objective.id] = true;
      }
    });
  };
  const visited = new Set<string>();
  const invalidateTaskRecursive = (taskId: string) => {
    const task = tasksById.get(taskId);
    if (!task) return;
    // Completed tasks stop propagation; failed tasks still block strict dependents.
    const completed = isCompleted(taskCompletions[taskId]);
    if (!invalidTasks[taskId]) {
      markInvalid(task);
    }
    if (visited.has(taskId)) return;
    visited.add(taskId);
    const dependents = requiredBy.get(taskId);
    if (!dependents) return;
    // Don't propagate invalidation through completed tasks.
    if (completed) return;
    dependents.forEach((dependentId) => {
      // A dependent whose requirement on this task accepts `failed` (e.g. `['complete', 'failed']`)
      // stays reachable when this task is failed/invalid, so the cascade stops here.
      const requirement = tasksById
        .get(dependentId)
        ?.taskRequirements?.find((req) => req?.task?.id === taskId);
      if (requirement && acceptsFailedStatus(requirement.status)) return;
      invalidateTaskRecursive(dependentId);
    });
  };
  // Invalidate faction-specific tasks (but DON'T cascade - there may be faction equivalents).
  // For example, USEC and BEAR have equivalent questlines, so invalidating a USEC task
  // shouldn't invalidate Collector, which can be reached via BEAR equivalents.
  tasks.forEach((task) => {
    if (task.factionName && task.factionName !== 'Any' && task.factionName !== pmcFaction) {
      markInvalid(task);
    }
  });
  // Invalidate tasks whose failed-only requirements are not actually failed.
  tasks.forEach((task) => {
    if (!task.taskRequirements?.length) return;
    const shouldInvalidate = task.taskRequirements.some((req) => {
      if (!isFailedRequirementOnly(req.status) || !req.task?.id) return false;
      return isCompleted(taskCompletions[req.task.id]);
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
      if (acceptsFailedStatus(req.status)) return false;
      if (!requiresCompletionOrActive(req.status)) return false;
      return taskCompletions[req.task.id]?.failed === true;
    });
    if (hasFailedPrerequisite) {
      invalidateTaskRecursive(task.id);
    }
  });
  // Invalidate alternative branches when this task is completed.
  tasks.forEach((task) => {
    if (!task.alternatives?.length) return;
    if (!isCompleted(taskCompletions[task.id])) return;
    task.alternatives.forEach((alternativeId) => {
      invalidateTaskRecursive(alternativeId);
    });
  });
  return { invalidTasks, invalidObjectives };
};
