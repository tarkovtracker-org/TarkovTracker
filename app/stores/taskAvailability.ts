import { resolveTraderUnlockTaskIds, type GameMode } from '@/utils/constants';
import { compareRequirement, getTaskTraderRequirements } from '@/utils/taskRequirements';
import {
  isTaskActive,
  isTaskComplete,
  isTaskFailed,
  type RawTaskCompletion,
} from '@/utils/taskStatus';
import type { UserProgressData } from '@/types/progress';
import type { RequirementComparison, Task, TaskRequirement } from '@/types/tarkov';
export type TaskAvailabilityTeamData = {
  completions: Record<string, RawTaskCompletion>;
  faction: string;
  level: number;
  mode: GameMode;
  traders: Record<string, { level?: number; reputation?: number }>;
  prestigeLevel?: number;
  storyChapters?: UserProgressData['storyChapters'];
};
export type TaskBlocker = {
  type:
    | 'player_level'
    | 'trader_level'
    | 'trader_reputation'
    | 'prerequisite'
    | 'failed_branch'
    | 'faction'
    | 'trader_unlock'
    | 'prestige'
    | 'unknown'
    | 'cycle'
    | 'complete'
    | 'failed'
    | 'disabled';
  requirementId?: string;
  current?: number;
  required?: number;
  compareMethod?: RequirementComparison;
  trader?: { id: string; name: string };
  taskId?: string;
  requirements?: TaskRequirement[];
  chapterIds?: string[];
  reason?: string;
};
export type TaskAvailabilityResult = { available: boolean; blockers: TaskBlocker[] };
export type TaskEvaluationMap = Record<string, Record<string, TaskAvailabilityResult>>;
export type TaskEvaluationOptions = {
  requireTraderLevels: boolean;
  prestigeTaskMap?: ReadonlyMap<string, number>;
};
const result = (blockers: TaskBlocker[]): TaskAvailabilityResult => ({
  available: blockers.length === 0,
  blockers,
});
const KNOWN_STATUSES = new Set(['complete', 'completed', 'failed', 'active', 'accept', 'accepted']);
const requirementStatuses = (requirement: TaskRequirement): unknown[] => {
  if (Array.isArray(requirement.status)) return requirement.status;
  return requirement.status === undefined ? [] : ['unknown'];
};
const normalizeStatuses = (requirement: TaskRequirement): string[] =>
  requirementStatuses(requirement).map((status) =>
    typeof status === 'string' ? status.toLowerCase() : 'unknown'
  );
const isValidRequirement = (
  requirement: TaskRequirement | null | undefined
): requirement is TaskRequirement =>
  Boolean(requirement?.task?.id) &&
  normalizeStatuses(requirement!).every((status) => KNOWN_STATUSES.has(status));
const completedObjective = (
  objectives: NonNullable<UserProgressData['storyChapters']>[string]['objectives'] = {}
) => Object.values(objectives).some((objective) => objective.complete === true);
export const hasStoryUnlockProgress = (
  chapterId: string,
  data: Pick<TaskAvailabilityTeamData, 'storyChapters'>
): boolean => {
  const progress = data.storyChapters?.[chapterId];
  if (!progress) return false;
  return progress.complete === true || completedObjective(progress.objectives);
};
const acceptsCompleted = (statuses: string[]) =>
  !statuses.length || statuses.some((status) => ['complete', 'completed'].includes(status));
const acceptsActive = (statuses: string[]) =>
  statuses.some((status) => ['active', 'accept', 'accepted'].includes(status));
const terminalStatusMet = (statuses: string[], completion: RawTaskCompletion) =>
  (acceptsCompleted(statuses) && isTaskComplete(completion)) ||
  (statuses.includes('failed') && isTaskFailed(completion));
const traderMetric = (
  type: 'level' | 'reputation',
  trader: { level?: number; reputation?: number }
) => (type === 'level' ? (trader.level ?? 1) : (trader.reputation ?? 0));
const traderCurrentValue = (
  requirement: Exclude<
    ReturnType<typeof getTaskTraderRequirements>[number],
    { requirementType: 'unknown' }
  >,
  data: TaskAvailabilityTeamData
) => {
  const trader = data.traders[requirement.trader.id] ?? {};
  return traderMetric(requirement.requirementType, trader);
};
const failedBranchBlockers = (
  task: Task,
  data: TaskAvailabilityTeamData,
  tasksById: Map<string, Task>
): TaskBlocker[] =>
  (task.failedRequirements ?? []).flatMap<TaskBlocker>((requirement) => {
    if (!isValidRequirement(requirement))
      return [{ type: 'unknown', reason: 'failed_requirement' }];
    if (!tasksById.has(requirement.task.id))
      return [{ type: 'unknown', taskId: requirement.task.id, reason: 'failed_requirement' }];
    return isTaskFailed(data.completions[requirement.task.id])
      ? [{ type: 'failed_branch', taskId: requirement.task.id }]
      : [];
  });
const playerLevelBlockers = (task: Task, data: TaskAvailabilityTeamData): TaskBlocker[] => {
  const required = task.minPlayerLevel ?? 0;
  return data.level < required
    ? [{ type: 'player_level', current: data.level, required, compareMethod: '>=' }]
    : [];
};
const factionBlockers = (task: Task, data: TaskAvailabilityTeamData): TaskBlocker[] => {
  if (!task.factionName || task.factionName === 'Any' || task.factionName === data.faction)
    return [];
  return [{ type: 'faction', reason: task.factionName }];
};
const terminalBlockers = (
  completion: RawTaskCompletion,
  taskId: string,
  allowCompleted: boolean
): TaskAvailabilityResult | undefined => {
  if (isTaskFailed(completion)) return result([{ type: 'failed', taskId }]);
  if (!allowCompleted && isTaskComplete(completion)) return result([{ type: 'complete', taskId }]);
  return undefined;
};
const missingPrestige = (task: Task): TaskBlocker[] =>
  task.requiredPrestige ? [{ type: 'unknown', reason: 'prestige_reference' }] : [];
const traderNameFor = (task: Task) =>
  task.trader?.normalizedName || task.trader?.name?.toLowerCase();
const traderDisplayName = (task: Task, fallback: string) => task.trader?.name || fallback;
const storyChapterIds = (task: Task) => (task.storyUnlocks ?? []).map((chapter) => chapter.id);
const traderUnlocked = (ids: string[], data: TaskAvailabilityTeamData) =>
  !ids.length || ids.some((id) => isTaskComplete(data.completions[id]));
const disabledBlockers = (task: Task): TaskBlocker[] =>
  task.disabled ? [{ type: 'disabled', taskId: task.id }] : [];
const missingTaskResult = (taskId: string) =>
  result([{ type: 'unknown', taskId, reason: 'task_reference' }]);
const createTeamEvaluator = (
  tasksById: Map<string, Task>,
  data: TaskAvailabilityTeamData,
  options: TaskEvaluationOptions
) => {
  const memo = new Map<string, TaskAvailabilityResult>();
  const visiting = new Set<string>();
  const activeRequirementResult = (
    taskId: string,
    completion: RawTaskCompletion
  ): TaskAvailabilityResult => {
    if (isTaskFailed(completion)) return result([{ type: 'prerequisite' }]);
    if (isTaskActive(completion) || isTaskComplete(completion)) return result([]);
    return evaluate(taskId, true);
  };
  const requiredTaskResult = (requirement: TaskRequirement): TaskAvailabilityResult => {
    const taskId = requirement.task.id;
    const completion = data.completions[taskId];
    const statuses = normalizeStatuses(requirement);
    if (!tasksById.has(taskId))
      return result([{ type: 'unknown', taskId, reason: 'task_reference' }]);
    if (terminalStatusMet(statuses, completion)) return result([]);
    return acceptsActive(statuses)
      ? activeRequirementResult(taskId, completion)
      : result([{ type: 'prerequisite' }]);
  };
  const knownTraderBlockers = (
    requirement: Exclude<
      ReturnType<typeof getTaskTraderRequirements>[number],
      { requirementType: 'unknown' }
    >
  ): TaskBlocker[] => {
    if (!options.requireTraderLevels) return [];
    const current = traderCurrentValue(requirement, data);
    if (compareRequirement(current, requirement.compareMethod, requirement.value)) return [];
    return [
      {
        type: requirement.requirementType === 'level' ? 'trader_level' : 'trader_reputation',
        requirementId: requirement.id,
        trader: requirement.trader,
        current,
        required: requirement.value,
        compareMethod: requirement.compareMethod,
      },
    ];
  };
  const traderBlockers = (task: Task): TaskBlocker[] =>
    getTaskTraderRequirements(task).flatMap<TaskBlocker>((requirement) => {
      if (requirement.requirementType === 'unknown')
        return [{ type: 'unknown', requirementId: requirement.id, reason: requirement.reason }];
      return knownTraderBlockers(requirement);
    });
  const prerequisiteBlockers = (task: Task): TaskBlocker[] => {
    const requirements = task.taskRequirements ?? [];
    const chapterIds = storyChapterIds(task);
    // A wired story route can satisfy the quest group, never trader/faction/prestige gates.
    if (chapterIds.some((id) => hasStoryUnlockProgress(id, data))) return [];
    const malformed = requirements.filter((requirement) => !isValidRequirement(requirement));
    if (malformed.length) return [{ type: 'unknown', reason: 'task_requirement' }];
    return unmetPrerequisiteBlockers(requirements, chapterIds);
  };
  const unmetPrerequisiteBlockers = (
    requirements: TaskRequirement[],
    chapterIds: string[]
  ): TaskBlocker[] => {
    const evaluated = requirements.map((requirement) => ({
      requirement,
      result: requiredTaskResult(requirement),
    }));
    const unmet = evaluated.filter((entry) => !entry.result.available);
    if (!unmet.length) return [];
    const diagnostics = unmet
      .flatMap((entry) => entry.result.blockers)
      .filter((blocker) => ['cycle', 'unknown'].includes(blocker.type));
    const ordinary = unmet.filter((entry) =>
      entry.result.blockers.every((blocker) => !['cycle', 'unknown'].includes(blocker.type))
    );
    if (!ordinary.length) return diagnostics;
    return [
      ...diagnostics,
      {
        type: 'prerequisite',
        requirements: ordinary.map((entry) => entry.requirement),
        chapterIds,
      },
    ];
  };
  const unlockBlockers = (task: Task): TaskBlocker[] => {
    const traderName = traderNameFor(task);
    if (!traderName) return [];
    const ids = resolveTraderUnlockTaskIds(traderName, data.mode).filter(
      (id) => id !== task.id && tasksById.has(id)
    );
    if (traderUnlocked(ids, data)) return [];
    return [
      {
        type: 'trader_unlock',
        taskId: ids[0],
        trader: { id: task.trader!.id, name: traderDisplayName(task, traderName) },
      },
    ];
  };
  const prestigeBlockers = (task: Task): TaskBlocker[] => {
    const required = options.prestigeTaskMap?.get(task.id);
    if (required === undefined) return missingPrestige(task);
    const current = data.prestigeLevel ?? 0;
    return current === required
      ? []
      : [{ type: 'prestige', current, required, compareMethod: '=' }];
  };
  const cachedResult = (key: string, taskId: string) =>
    memo.get(key) ?? (visiting.has(key) ? result([{ type: 'cycle', taskId }]) : undefined);
  const evaluate = (taskId: string, allowCompleted = false): TaskAvailabilityResult => {
    const key = `${allowCompleted}:${taskId}`;
    const cached = cachedResult(key, taskId);
    if (cached) return cached;
    const task = tasksById.get(taskId);
    if (!task) return missingTaskResult(taskId);
    const terminal = terminalBlockers(data.completions[taskId], taskId, allowCompleted);
    if (terminal) return terminal;
    visiting.add(key);
    const blockers: TaskBlocker[] = disabledBlockers(task);
    blockers.push(
      ...playerLevelBlockers(task, data),
      ...factionBlockers(task, data),
      ...failedBranchBlockers(task, data, tasksById),
      ...traderBlockers(task),
      ...prestigeBlockers(task),
      ...prerequisiteBlockers(task),
      ...unlockBlockers(task)
    );
    visiting.delete(key);
    const evaluated = result(blockers);
    memo.set(key, evaluated);
    return evaluated;
  };
  return (taskId: string) => evaluate(taskId);
};
export const buildTaskEvaluations = (
  tasks: Task[],
  teams: Map<string, TaskAvailabilityTeamData>,
  options: TaskEvaluationOptions
): TaskEvaluationMap => {
  const evaluations: TaskEvaluationMap = Object.fromEntries(tasks.map((task) => [task.id, {}]));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  for (const [teamId, data] of teams) {
    const evaluate = createTeamEvaluator(tasksById, data, options);
    for (const task of tasks) evaluations[task.id]![teamId] = evaluate(task.id);
  }
  return evaluations;
};
