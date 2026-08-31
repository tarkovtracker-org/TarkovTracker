import { resolveTraderUnlockTaskIds, type GameMode } from '@/utils/constants';
import {
  isTaskActive,
  isTaskComplete,
  isTaskFailed,
  type RawTaskCompletion,
} from '@/utils/taskStatus';
import type { Task, TaskRequirement } from '@/types/tarkov';
export type TaskAvailabilityMap = Record<string, Record<string, boolean>>;
export type TaskAvailabilityTeamData = {
  completions: Record<string, RawTaskCompletion>;
  faction: string;
  level: number;
  mode: GameMode;
  traders: Record<string, { level?: number; reputation?: number }>;
};
type EvaluationContext = {
  fenceTraderId: string | null;
  requireTraderLevels: boolean;
  tasksById: Map<string, Task>;
  teamData: TaskAvailabilityTeamData;
};
const normalizeStatuses = (statuses?: string[]) =>
  (statuses ?? []).map((status) => status.toLowerCase());
const requiresCompletedStatus = (statuses: string[]): boolean => {
  if (!statuses.length) return true;
  return statuses.includes('complete') || statuses.includes('completed');
};
const matchesActiveStatus = (
  completion: RawTaskCompletion,
  taskId: string,
  isUnlockable: (taskId: string) => boolean
): boolean => {
  if (isTaskActive(completion)) return true;
  if (isTaskComplete(completion)) return true;
  return isUnlockable(taskId);
};
const requiresActiveStatus = (statuses: string[]): boolean =>
  ['active', 'accept', 'accepted'].some((status) => statuses.includes(status));
const matchesRequiredActiveStatus = (
  statuses: string[],
  completion: RawTaskCompletion,
  taskId: string,
  isUnlockable: (taskId: string) => boolean
): boolean => {
  if (!requiresActiveStatus(statuses)) return false;
  return matchesActiveStatus(completion, taskId, isUnlockable);
};
const hasRequiredTaskStatus = (
  requirement: TaskRequirement,
  teamData: TaskAvailabilityTeamData,
  isUnlockable: (taskId: string) => boolean
): boolean => {
  const taskId = requirement.task?.id;
  if (!taskId) return true;
  const statuses = normalizeStatuses(requirement.status);
  const completion = teamData.completions[taskId];
  const matches = [
    { met: isTaskComplete(completion), required: requiresCompletedStatus(statuses) },
    { met: isTaskFailed(completion), required: statuses.includes('failed') },
    {
      met: matchesRequiredActiveStatus(statuses, completion, taskId, isUnlockable),
      required: true,
    },
  ];
  return matches.some(({ met, required }) => met && required);
};
const failsTraderLevelRequirement = (
  requirement: NonNullable<Task['traderLevelRequirements']>[number],
  teamData: TaskAvailabilityTeamData
): boolean => {
  const trader = requirement.trader;
  if (!trader) return false;
  const level = teamData.traders[trader.id]?.level;
  const resolvedLevel = typeof level === 'number' ? level : 1;
  return resolvedLevel < requirement.level;
};
const meetsTraderLevelRequirements = (task: Task, teamData: TaskAvailabilityTeamData): boolean =>
  !(task.traderLevelRequirements ?? []).some((requirement) =>
    failsTraderLevelRequirement(requirement, teamData)
  );
const failsTraderReputationRequirement = (
  requirement: NonNullable<Task['traderRequirements']>[number],
  teamData: TaskAvailabilityTeamData,
  fenceTraderId: string | null
): boolean => {
  const trader = requirement.trader;
  if (!trader) return false;
  const traderState = teamData.traders[trader.id];
  const reputation = getTraderReputation(traderState);
  if (requirement.value >= 0) return reputation < requirement.value;
  if (trader.id !== fenceTraderId) return false;
  return reputation > requirement.value;
};
function getTraderReputation(trader: { reputation?: number } | undefined): number {
  if (!trader) return 0;
  return typeof trader.reputation === 'number' ? trader.reputation : 0;
}
const meetsTraderReputationRequirements = (
  task: Task,
  teamData: TaskAvailabilityTeamData,
  fenceTraderId: string | null
): boolean =>
  !(task.traderRequirements ?? []).some((requirement) =>
    failsTraderReputationRequirement(requirement, teamData, fenceTraderId)
  );
const meetsTraderRequirements = (task: Task, context: EvaluationContext): boolean =>
  !context.requireTraderLevels ||
  (meetsTraderLevelRequirements(task, context.teamData) &&
    meetsTraderReputationRequirements(task, context.teamData, context.fenceTraderId));
const getTaskTraderName = (task: Task): string | null => {
  const trader = task.trader;
  if (!trader) return null;
  if (trader.normalizedName) return trader.normalizedName;
  return String(trader.name ?? '').toLowerCase();
};
const meetsTraderUnlockRequirement = (task: Task, context: EvaluationContext): boolean => {
  const traderName = getTaskTraderName(task);
  if (!traderName) return true;
  const unlockTaskIds = resolveTraderUnlockTaskIds(traderName, context.teamData.mode).filter(
    (taskId) => [taskId !== task.id, context.tasksById.has(taskId)].every(Boolean)
  );
  if (!unlockTaskIds.length) return true;
  return unlockTaskIds.some((taskId) => isTaskComplete(context.teamData.completions[taskId]));
};
const createTeamEvaluator = (context: EvaluationContext) => {
  const availabilityMemo = new Map<string, boolean>();
  const unlockableMemo = new Map<string, boolean>();
  const visitingAvailable = new Set<string>();
  const visitingUnlockable = new Set<string>();
  let isUnlockable = (_taskId: string): boolean => false;
  const compute = (
    taskId: string,
    allowCompleted: boolean,
    memo: Map<string, boolean>,
    visiting: Set<string>
  ): boolean => {
    const cached = memo.get(taskId);
    if (cached !== undefined) return cached;
    if (visiting.has(taskId)) return false;
    const task = context.tasksById.get(taskId);
    if (!task) return false;
    visiting.add(taskId);
    const checks = [
      () => allowCompleted || !isTaskComplete(context.teamData.completions[taskId]),
      () =>
        !(task.failedRequirements ?? []).some((requirement) =>
          isTaskFailed(context.teamData.completions[requirement.task?.id ?? ''])
        ),
      () => !task.minPlayerLevel || context.teamData.level >= task.minPlayerLevel,
      () => meetsTraderRequirements(task, context),
      () =>
        (task.taskRequirements ?? []).every((requirement) =>
          hasRequiredTaskStatus(requirement, context.teamData, isUnlockable)
        ),
      () =>
        !task.factionName ||
        task.factionName === 'Any' ||
        task.factionName === context.teamData.faction,
      () => meetsTraderUnlockRequirement(task, context),
    ];
    const available = checks.every((check) => check());
    visiting.delete(taskId);
    memo.set(taskId, available);
    return available;
  };
  isUnlockable = (taskId) => compute(taskId, true, unlockableMemo, visitingUnlockable);
  return (taskId: string) => compute(taskId, false, availabilityMemo, visitingAvailable);
};
export const buildTaskAvailability = (
  tasks: Task[],
  teams: Map<string, TaskAvailabilityTeamData>,
  fenceTraderId: string | null,
  requireTraderLevels: boolean
): TaskAvailabilityMap => {
  const available = Object.fromEntries(tasks.map((task) => [task.id, {}])) as TaskAvailabilityMap;
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  for (const [teamId, teamData] of teams) {
    const isAvailable = createTeamEvaluator({
      fenceTraderId,
      requireTraderLevels,
      tasksById,
      teamData,
    });
    for (const task of tasks) available[task.id]![teamId] = isAvailable(task.id);
  }
  return available;
};
