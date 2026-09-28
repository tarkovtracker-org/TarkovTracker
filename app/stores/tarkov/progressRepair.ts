import {
  acceptsCompletionStatus,
  normalizeRequirementStatuses,
} from '@shared/utils/requirementStatus';
import { GAME_MODE_VALUES, MANUAL_FAIL_TASK_IDS, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { nextClock } from '@/utils/taskAvailabilityConfirmation';
import type { UserProgressData } from '@/stores/progressState';
import type { TaskCompletion, TaskObjective } from '@/types/progress';
import type { Task, TaskObjective as TaskObjectiveDefinition } from '@/types/tarkov';
type TaskLookup = ReadonlyMap<string, Task>;
type ModeStates = Partial<Record<GameMode, UserProgressData | undefined>>;
type Completions = Record<string, TaskCompletion>;
type ModeRepair = (modeData: UserProgressData, tasks: TaskLookup) => number;
const completionsOf = (modeData: UserProgressData): Completions =>
  (modeData.taskCompletions ??= {});
const objectivesOf = (modeData: UserProgressData): Record<string, TaskObjective> =>
  (modeData.taskObjectives ??= {});
const isSuccessful = (completion?: TaskCompletion): boolean =>
  completion?.complete === true && completion.failed !== true;
const hasCountedProgress = (existing: TaskObjective, objective: TaskObjectiveDefinition) =>
  existing.count !== undefined || (objective.count ?? 0) > 0;
const zeroObjective = (existing: TaskObjective, objective: TaskObjectiveDefinition): void => {
  existing.complete = false;
  if (hasCountedProgress(existing, objective)) existing.count = 0;
};
const resetTaskObjectives = (modeData: UserProgressData, task?: Task, timestamp?: number): void => {
  if (!task?.objectives) return;
  const objectives = objectivesOf(modeData);
  for (const objective of task.objectives) {
    if (!objective?.id) continue;
    const existing = objectives[objective.id] ?? {};
    zeroObjective(existing, objective);
    if (timestamp !== undefined) existing.timestamp = timestamp;
    objectives[objective.id] = existing;
  }
};
/** Mark a task failed (keeping manual intent) and clear its objectives. */
function markTaskFailed(modeData: UserProgressData, taskId: string, tasks: TaskLookup) {
  const completion = (completionsOf(modeData)[taskId] ??= {});
  completion.complete = true;
  completion.failed = true;
  completion.manual = completion.manual === true;
  completion.timestamp ??= Date.now();
  resetTaskObjectives(modeData, tasks.get(taskId));
  return 1;
}
/** A repaired status must retire a confirmation even one stamped by a clock running ahead. */
const statusClock = (modeData: UserProgressData, taskId: string) =>
  nextClock(modeData.taskAvailability?.[taskId]?.timestamp ?? -1);
function markTaskUncompleted(modeData: UserProgressData, taskId: string, tasks: TaskLookup) {
  const now = statusClock(modeData, taskId);
  const completion = (completionsOf(modeData)[taskId] ??= {});
  Object.assign(completion, {
    complete: false,
    failed: false,
    manual: false,
    timestamp: now,
  });
  resetTaskObjectives(modeData, tasks.get(taskId), now);
  return 1;
}
const failsWhenCompleted = (task: Task | undefined, otherTaskId: string): boolean =>
  (task?.failConditions ?? []).some(
    (condition) =>
      condition?.task?.id === otherTaskId &&
      acceptsCompletionStatus(normalizeRequirementStatuses(condition.status))
  );
const branchLoser = (completions: Completions, taskId: string, altTaskId: string): string => {
  const taskTimestamp = completions[taskId]?.timestamp ?? 0;
  const altTimestamp = completions[altTaskId]?.timestamp ?? 0;
  if (taskTimestamp !== altTimestamp) return taskTimestamp > altTimestamp ? altTaskId : taskId;
  const loser = taskId > altTaskId ? taskId : altTaskId;
  logger.warn(
    `[TarkovStore] Both "${taskId}" and alternative "${altTaskId}" are complete ` +
      `${taskTimestamp === 0 ? 'with no timestamps' : 'with identical timestamps'} - ` +
      `applying deterministic fallback (failing "${loser}").`
  );
  return loser;
};
/** Which task of a completed branch pair must fail, if any. */
const branchTaskToFail = (
  completions: Completions,
  tasks: TaskLookup,
  taskId: string,
  altTaskId: string
): string | null => {
  const altCompletion = completions[altTaskId];
  if (altCompletion?.failed) return null;
  if (!altCompletion?.complete) return altTaskId;
  const mutuallyExclusive =
    failsWhenCompleted(tasks.get(altTaskId), taskId) &&
    failsWhenCompleted(tasks.get(taskId), altTaskId);
  return mutuallyExclusive ? branchLoser(completions, taskId, altTaskId) : null;
};
const enforceBranchFailures: ModeRepair = (modeData, tasks) => {
  const completions = completionsOf(modeData);
  const processedPairs = new Set<string>();
  let repaired = 0;
  for (const [taskId, completion] of Object.entries(completions)) {
    if (!isSuccessful(completion)) continue;
    for (const altTaskId of tasks.get(taskId)?.alternatives ?? []) {
      const pairKey = [taskId, altTaskId].sort().join('|');
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);
      const toFail = branchTaskToFail(completions, tasks, taskId, altTaskId);
      if (toFail) repaired += markTaskFailed(modeData, toFail, tasks);
    }
  }
  return repaired;
};
const indexAlternativeSources = (tasks: TaskLookup): Map<string, string[]> => {
  const sources = new Map<string, string[]>();
  for (const [taskId, task] of tasks) {
    for (const alternativeId of task.alternatives ?? []) {
      sources.set(alternativeId, [...(sources.get(alternativeId) ?? []), taskId]);
    }
  }
  return sources;
};
type FailureCheck = {
  completions: Completions;
  tasks: TaskLookup;
  task: Task;
  completion: TaskCompletion;
};
const completedBeforeTrigger = (check: FailureCheck, triggerTaskId: string): boolean => {
  if (failsWhenCompleted(check.tasks.get(triggerTaskId), check.task.id)) return false;
  const timestamp = check.completion.timestamp ?? 0;
  const triggerTimestamp = check.completions[triggerTaskId]?.timestamp ?? 0;
  if (timestamp > 0 && triggerTimestamp > 0) return timestamp < triggerTimestamp;
  return check.completion.complete === true;
};
const triggerStillFails = (check: FailureCheck, triggerTaskId: string): boolean =>
  isSuccessful(check.completions[triggerTaskId]) && !completedBeforeTrigger(check, triggerTaskId);
const failConditionTriggers = (task: Task): string[] =>
  (task.failConditions ?? [])
    .filter((condition) => acceptsCompletionStatus(normalizeRequirementStatuses(condition?.status)))
    .map((condition) => condition?.task?.id)
    .filter((taskId): taskId is string => Boolean(taskId));
const isStickyFailure = (task: Task | undefined, completion: TaskCompletion): boolean =>
  completion.manual === true || !task || MANUAL_FAIL_TASK_IDS.includes(task.id);
const shouldRemainFailed = (
  check: Omit<FailureCheck, 'task'> & { task?: Task },
  sources: string[]
) => {
  const { task } = check;
  if (isStickyFailure(task, check.completion) || !task) return true;
  const triggers = [...failConditionTriggers(task), ...sources];
  return triggers.some((triggerTaskId) => triggerStillFails({ ...check, task }, triggerTaskId));
};
const clearStaleFailures: ModeRepair = (modeData, tasks) => {
  const completions = completionsOf(modeData);
  const alternativeSources = indexAlternativeSources(tasks);
  let repaired = 0;
  for (const [taskId, completion] of Object.entries(completions)) {
    if (!completion?.failed) continue;
    const check = { completions, tasks, task: tasks.get(taskId), completion };
    if (shouldRemainFailed(check, alternativeSources.get(taskId) ?? [])) continue;
    logger.debug(`[TarkovStore] Clearing stale failed flag for "${taskId}"`, {
      taskId,
      reason: 'no manual fail, no matched failConditions, no successful alternative source',
    });
    repaired += markTaskUncompleted(modeData, taskId, tasks);
  }
  return repaired;
};
/** Re-apply legitimate branch failures, then clear failed flags that lost their cause. */
export const repairModeFailedTasks: ModeRepair = (modeData, tasks) =>
  enforceBranchFailures(modeData, tasks) + clearStaleFailures(modeData, tasks);
const clearObjectiveIfProgressed = (
  objectives: Record<string, TaskObjective>,
  objective: TaskObjectiveDefinition
): boolean => {
  const existing = objective?.id ? objectives[objective.id] : undefined;
  if (!existing || !(existing.complete || (existing.count ?? 0) > 0)) return false;
  zeroObjective(existing, objective);
  return true;
};
/** Failed tasks keep no objective progress. Counts tasks whose objectives changed. */
const clearFailedTaskObjectives: ModeRepair = (modeData, tasks) => {
  const objectives = modeData.taskObjectives;
  if (!objectives) return 0;
  let cleared = 0;
  for (const [taskId, completion] of Object.entries(modeData.taskCompletions ?? {})) {
    if (!completion?.failed) continue;
    const changes = (tasks.get(taskId)?.objectives ?? []).map((objective) =>
      clearObjectiveIfProgressed(objectives, objective)
    );
    if (changes.includes(true)) cleared += 1;
  }
  return cleared;
};
const fillObjective = (existing: TaskObjective, objective: TaskObjectiveDefinition): boolean => {
  const changed = existing.complete !== true;
  existing.complete = true;
  const requiredCount = objective.count ?? 0;
  if (requiredCount <= 0 || (existing.count ?? 0) >= requiredCount) return changed;
  existing.count = requiredCount;
  return true;
};
const completeTaskObjectives = (
  objectives: Record<string, TaskObjective>,
  task: Task,
  completion: TaskCompletion
): number => {
  let repaired = 0;
  for (const objective of task.objectives ?? []) {
    if (!objective?.id) continue;
    const existing = objectives[objective.id] ?? {};
    if (!fillObjective(existing, objective)) continue;
    existing.timestamp ||= completion.timestamp ?? Date.now();
    objectives[objective.id] = existing;
    repaired += 1;
  }
  return repaired;
};
/** Every successfully completed task has all objectives complete at their required count. */
const repairModeCompletedObjectives: ModeRepair = (modeData, tasks) => {
  const objectives = objectivesOf(modeData);
  let repaired = 0;
  for (const [taskId, completion] of Object.entries(modeData.taskCompletions ?? {})) {
    const task = tasks.get(taskId);
    if (!isSuccessful(completion) || !task) continue;
    repaired += completeTaskObjectives(objectives, task, completion);
  }
  return repaired;
};
const toLookup = (tasks: readonly Task[]): TaskLookup =>
  new Map(tasks.map((task) => [task.id, task]));
const repairModes = (
  state: ModeStates,
  tasks: readonly Task[],
  repairs: ModeRepair[],
  label: string
) => {
  if (!tasks.length) return 0;
  const lookup = toLookup(tasks);
  const counts: Partial<Record<GameMode, number>> = {};
  for (const mode of GAME_MODE_VALUES) {
    const modeData = state[mode];
    if (!modeData?.taskCompletions) continue;
    counts[mode] = repairs.reduce((sum, repair) => sum + repair(modeData, lookup), 0);
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total > 0) logger.debug(`[TarkovStore] ${label}`, counts);
  return total;
};
/** Repair failed-task state in every mode. Returns the number of changes made. */
export const repairFailedProgress = (state: ModeStates, tasks: readonly Task[]): number =>
  repairModes(
    state,
    tasks,
    [repairModeFailedTasks, clearFailedTaskObjectives],
    'Repaired failed task states'
  );
/** Complete objectives of completed tasks in every mode. Returns the number of changes made. */
export const repairCompletedProgress = (state: ModeStates, tasks: readonly Task[]): number =>
  repairModes(state, tasks, [repairModeCompletedObjectives], 'Repaired completed task objectives');
