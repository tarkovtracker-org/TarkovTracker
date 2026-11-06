import { counterValue } from '@/utils/taskCounters';
import { getTaskStatusFromFlags, isTaskComplete } from '@/utils/taskStatus';
import type { RequirementTranslate } from '@/features/tasks/requirement-format';
import type {
  RequirementComparison,
  Task,
  TaskCounterDerivation,
  TaskProgressionPool,
} from '@/types/tarkov';
import type { RawTaskCompletion } from '@/utils/taskStatus';
type PoolStatus = 'available' | 'locked' | 'completed' | 'failed' | 'unavailable';
export type PoolTask = {
  id: string;
  name: string;
  status: PoolStatus;
  current: boolean;
};
export type PoolGroup = {
  key: string;
  anyOf: boolean;
  complete: boolean;
  tasks: PoolTask[];
};
export type TaskRequirementPool = {
  id: string;
  candidate: boolean;
  confirmed: boolean;
  groups: PoolGroup[];
};
export type PoolTaskContext = {
  currentTaskId: string;
  taskById: (id: string) => Task | undefined;
  completion: (id: string) => RawTaskCompletion;
  available: (id: string) => boolean;
  unavailable: (id: string) => boolean;
};
const STATUS_ORDER: Record<PoolStatus, number> = {
  available: 0,
  locked: 1,
  completed: 2,
  failed: 3,
  unavailable: 4,
};
const COMPARISON_KEYS: Record<RequirementComparison, string> = {
  '>=': 'at_least',
  '>': 'above',
  '<=': 'at_most',
  '<': 'below',
  '=': 'exactly',
  '==': 'exactly',
  '!=': 'not_equal',
};
const poolLabelKind = (
  pool: TaskProgressionPool | undefined,
  trader: string | undefined
): string => (pool && trader ? 'named_pool' : 'task_pool');
export const poolRequirementLabel = (
  t: RequirementTranslate,
  pool: TaskProgressionPool | undefined,
  trader: string | undefined,
  method: RequirementComparison | undefined,
  required: number
): string => {
  const requirement = t(`page.tasks.requirements.task_count_${COMPARISON_KEYS[method ?? '>=']}`, {
    value: required,
  });
  const kind = poolLabelKind(pool, trader);
  return t(`page.tasks.requirements.${kind}_${required === 1 ? 'one' : 'other'}`, {
    requirement,
    trader,
    level: pool?.loyaltyLevel,
  });
};
export const poolProgressLabel = (
  t: RequirementTranslate,
  current: number | undefined,
  required: number,
  method: RequirementComparison | undefined,
  source: 'tracked' | 'account' = 'tracked'
): string => {
  if (current === undefined) return t('page.tasks.requirements.pool_unverified');
  const value = (method ?? '>=') === '>=' ? `${current}/${required}` : String(current);
  return t(`page.tasks.requirements.pool_${source}`, { value });
};
export const poolBlockerLabel = (
  t: RequirementTranslate,
  blocker: {
    taskPool?: TaskProgressionPool;
    compareMethod?: RequirementComparison;
    required?: number;
  },
  trader: string | undefined
): string =>
  poolRequirementLabel(t, blocker.taskPool, trader, blocker.compareMethod, blocker.required ?? 0);
export const genericProgressionLabel = (t: RequirementTranslate): string =>
  t('page.tasks.requirements.global_variable');
export const poolTrackedValue = (
  counter: TaskCounterDerivation,
  context: PoolTaskContext
): number => counterValue(counter, (id) => isTaskComplete(context.completion(id)));
const taskStatus = (id: string, context: PoolTaskContext): PoolStatus => {
  const status = getTaskStatusFromFlags(context.completion(id));
  if (status !== 'incomplete') return status;
  if (context.unavailable(id)) return 'unavailable';
  return context.available(id) ? 'available' : 'locked';
};
const taskRank = (task: PoolTask): number => (task.current ? 5 : STATUS_ORDER[task.status]);
const poolTask = (id: string, context: PoolTaskContext): PoolTask | undefined => {
  const task = context.taskById(id);
  if (!task) return undefined;
  return {
    id,
    name: task.name || id,
    status: taskStatus(id, context),
    current: id === context.currentTaskId,
  };
};
const poolGroup = (group: string[] | { anyOf: string[] }, context: PoolTaskContext): PoolGroup => {
  const anyOf = !Array.isArray(group);
  const ids = Array.isArray(group) ? group : group.anyOf;
  const complete = (id: string) => isTaskComplete(context.completion(id));
  return {
    key: ids.join('-'),
    anyOf,
    complete: anyOf ? ids.some(complete) : ids.every(complete),
    tasks: ids
      .map((id) => poolTask(id, context))
      .filter((task): task is PoolTask => !!task)
      .sort((a, b) => taskRank(a) - taskRank(b) || a.name.localeCompare(b.name)),
  };
};
const groupRank = (group: PoolGroup): number => Math.min(...group.tasks.map(taskRank));
export const poolContributorGroups = (
  counter: TaskCounterDerivation,
  context: PoolTaskContext
): PoolGroup[] => {
  const groups =
    counter.type === 'taskGroupCompletions' ? counter.groups : counter.taskIds.map((id) => [id]);
  return groups
    .map((group) => poolGroup(group, context))
    .filter((group) => group.tasks.length > 0)
    .sort((a, b) => groupRank(a) - groupRank(b) || a.key.localeCompare(b.key));
};
