import {
  normalizeRequirementStatuses,
  requiresCompletionOrActive,
} from '@tarkovtracker/progress-contracts/requirementStatus';
import type { TaskAvailabilityResult, TaskBlocker } from '@/stores/taskAvailability';
import type { Task, TaskObjective, TaskRequirement } from '@/types/tarkov';
export type UpNextReason =
  | 'unlock-trader'
  | 'opens'
  | 'lightkeeper'
  | 'kappa'
  | 'almost-done'
  | 'in-progress'
  | 'ready'
  | 'blocked';
export type UpNextState = 'actionable' | 'blocked' | 'filtered' | 'complete' | 'empty';
export interface UpNextProgress {
  completed: number;
  remaining: number;
  total: number;
}
export interface UpNextItem {
  taskId: string;
  taskName: string;
  reason: UpNextReason;
  score: number;
  progress: UpNextProgress;
  opens: number;
  traderName?: string;
  blocker?: TaskBlocker;
}
export type EvaluationLookup = (taskId: string) => TaskAvailabilityResult | undefined;
export interface UpNextContext {
  evaluation: EvaluationLookup;
  eligibleTaskIds: ReadonlySet<string>;
  isObjectiveComplete: (objectiveId: string) => boolean;
  unlockTraders: ReadonlyMap<string, string>;
}
export interface TraderUnlockSource {
  id: string;
  name: string;
  unlockTaskIds: string[];
}
const UP_NEXT_LIMIT = 4;
const BLOCKED_LIMIT = 3;
const countedObjectives = (task: Task): TaskObjective[] => {
  const objectives = (task.objectives ?? []).filter(Boolean);
  const required = objectives.filter((objective) => objective.optional !== true);
  return required.length ? required : objectives;
};
const taskProgress = (
  task: Task,
  isObjectiveComplete: UpNextContext['isObjectiveComplete']
): UpNextProgress => {
  const objectives = countedObjectives(task);
  const total = objectives.length || 1;
  const done = objectives.filter((objective) => isObjectiveComplete(objective.id)).length;
  const completed = Math.min(done, total);
  return { completed, remaining: total - completed, total };
};
const directChildren = (task: Task): string[] =>
  task.children?.length ? task.children : (task.successors ?? []);
const opensOnCompletion = (taskId: string, requirement: TaskRequirement): boolean =>
  requirement.task.id === taskId &&
  requiresCompletionOrActive(normalizeRequirementStatuses(requirement.status));
const onlyWaitsOn = (taskId: string, result: TaskAvailabilityResult | undefined): boolean => {
  const [blocker, ...rest] = result?.blockers ?? [];
  if (!blocker || rest.length || blocker.type !== 'prerequisite') return false;
  const requirements = blocker.requirements ?? [];
  return requirements.length > 0 && requirements.every((req) => opensOnCompletion(taskId, req));
};
/** Follow-up tasks whose only remaining gate is completing `task`. */
export const opensCount = (
  task: Task,
  evaluation: EvaluationLookup,
  eligibleTaskIds: ReadonlySet<string>
): number =>
  directChildren(task).filter(
    (childId) => eligibleTaskIds.has(childId) && onlyWaitsOn(task.id, evaluation(childId))
  ).length;
/** Unlock task id -> trader name, for traders none of whose unlock tasks are complete yet. */
export const lockedTraderUnlockTaskIds = (
  traders: TraderUnlockSource[],
  isTaskComplete: (taskId: string) => boolean
): Map<string, string> => {
  const map = new Map<string, string>();
  const locked = traders.filter(
    (trader) => trader.unlockTaskIds.length && !trader.unlockTaskIds.some(isTaskComplete)
  );
  for (const trader of locked) for (const id of trader.unlockTaskIds) map.set(id, trader.name);
  return map;
};
const flagReason = (task: Task, opens: number, traderName?: string): UpNextReason | null => {
  if (traderName) return 'unlock-trader';
  if (opens > 0) return 'opens';
  if (task.lightkeeperRequired) return 'lightkeeper';
  return task.kappaRequired ? 'kappa' : null;
};
const progressReason = (progress: UpNextProgress): UpNextReason => {
  if (progress.completed === 0) return 'ready';
  return progress.remaining <= 1 ? 'almost-done' : 'in-progress';
};
const flagScore = (task: Task, opens: number, traderName?: string): number =>
  (traderName ? 1000 : 0) +
  opens * 120 +
  (task.lightkeeperRequired ? 90 : 0) +
  (task.kappaRequired ? 70 : 0);
const progressScore = (progress: UpNextProgress): number =>
  Math.round((progress.completed / progress.total) * 100) +
  Math.max(0, 30 - progress.remaining * 6);
const buildItem = (task: Task, context: UpNextContext): UpNextItem => {
  const opens = opensCount(task, context.evaluation, context.eligibleTaskIds);
  const traderName = context.unlockTraders.get(task.id);
  const progress = taskProgress(task, context.isObjectiveComplete);
  return {
    taskId: task.id,
    taskName: task.name || task.id,
    reason: flagReason(task, opens, traderName) ?? progressReason(progress),
    score: flagScore(task, opens, traderName) + progressScore(progress),
    progress,
    opens,
    traderName,
  };
};
const ranksBefore = (left: UpNextItem, right: UpNextItem): boolean =>
  left.score === right.score
    ? left.taskName.localeCompare(right.taskName) < 0
    : left.score > right.score;
const insertTop = (top: UpNextItem[], item: UpNextItem, limit: number): void => {
  const index = top.findIndex((existing) => ranksBefore(item, existing));
  if (index === -1 && top.length >= limit) return;
  top.splice(index === -1 ? top.length : index, 0, item);
  if (top.length > limit) top.pop();
};
const topItems = (items: Iterable<UpNextItem>, limit: number): UpNextItem[] => {
  const top: UpNextItem[] = [];
  for (const item of items) insertTop(top, item, limit);
  return top;
};
function* mapTasks(tasks: Task[], build: (task: Task) => UpNextItem | null) {
  for (const task of tasks) {
    const item = build(task);
    if (item) yield item;
  }
}
/** Best available tasks, highest score first. */
export const rankUpNext = (
  availableTasks: Task[],
  context: UpNextContext,
  limit = UP_NEXT_LIMIT
): UpNextItem[] =>
  topItems(
    mapTasks(availableTasks, (task) => buildItem(task, context)),
    limit
  );
const BLOCKED_SKIP = new Set<TaskBlocker['type']>([
  'complete',
  'failed',
  'failed_branch',
  'disabled',
  'cycle',
  'faction',
  'unknown',
  'global_variable_unknown',
]);
const isSingleGate = (blocker: TaskBlocker): boolean =>
  blocker.type === 'prerequisite'
    ? blocker.requirements?.length === 1
    : !BLOCKED_SKIP.has(blocker.type);
const singleBlocker = (result: TaskAvailabilityResult | undefined): TaskBlocker | undefined => {
  const [blocker, ...rest] = result?.blockers ?? [];
  return blocker && !rest.length && isSingleGate(blocker) ? blocker : undefined;
};
const buildBlocked = (task: Task, context: UpNextContext): UpNextItem | null => {
  const blocker = singleBlocker(context.evaluation(task.id));
  if (!blocker) return null;
  const item = buildItem(task, context);
  return { ...item, reason: 'blocked', blocker };
};
/** Locked tasks that are one gate away from opening, used when nothing is available. */
export const pickClosestBlocked = (
  lockedTasks: Task[],
  context: UpNextContext,
  limit = BLOCKED_LIMIT
): UpNextItem[] =>
  topItems(
    mapTasks(lockedTasks, (task) => buildBlocked(task, context)),
    limit
  );
