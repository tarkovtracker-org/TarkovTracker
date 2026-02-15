import { isTaskAvailableForEdition as checkTaskEdition } from '@/utils/editionHelpers';
import { computeInvalidProgress } from '@/utils/progressInvalidation';
import { getCompletionFlags, type RawTaskCompletion } from '@/utils/taskStatus';
import type { GameEdition, NeededItemTaskObjective, Task } from '@/types/tarkov';
type TaskObjectiveProgress = {
  complete?: boolean;
  count?: number;
};
type NormalizedTaskCompletion = {
  complete?: boolean;
  failed?: boolean;
};
type MergedKappaItemRequirement = {
  count: number;
  objectiveIds: string[];
  taskId: string;
};
const COLLECTOR_TASK_ID = '5c51aac186f77432ea65c552';
export type StreamerKappaMetricSummary = {
  completed: number;
  percentage: number;
  remaining: number;
  total: number;
};
export type StreamerKappaMetrics = {
  items: {
    collected: number;
    percentage: number;
    remaining: number;
    total: number;
  };
  tasks: StreamerKappaMetricSummary;
};
export type ComputeStreamerKappaMetricsInput = {
  editions: GameEdition[];
  gameEdition: number;
  neededItemTaskObjectives: NeededItemTaskObjective[];
  pmcFaction: 'BEAR' | 'USEC';
  taskCompletions: Record<string, RawTaskCompletion>;
  taskObjectives: Record<string, TaskObjectiveProgress>;
  tasks: Task[];
};
const calculatePercentage = (completed: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (completed / total) * 100));
};
const isTaskSuccessful = (
  taskCompletions: Record<string, RawTaskCompletion>,
  taskId: string
): boolean => {
  const flags = getCompletionFlags(taskCompletions[taskId]);
  return flags.complete && !flags.failed;
};
const isTaskFailed = (
  taskCompletions: Record<string, RawTaskCompletion>,
  taskId: string
): boolean => {
  return getCompletionFlags(taskCompletions[taskId]).failed;
};
const getObjectiveCount = (
  taskObjectives: Record<string, TaskObjectiveProgress>,
  objectiveId: string
): number => {
  return Math.max(0, taskObjectives[objectiveId]?.count ?? 0);
};
const getPrimaryItemId = (objective: NeededItemTaskObjective): string | null => {
  if (objective.item?.id) {
    return objective.item.id;
  }
  if (objective.markerItem?.id) {
    return objective.markerItem.id;
  }
  return null;
};
const normalizeTaskCompletionsForInvalidation = (
  taskCompletions: Record<string, RawTaskCompletion>
): Record<string, NormalizedTaskCompletion> => {
  const normalized: Record<string, NormalizedTaskCompletion> = {};
  for (const [taskId, completion] of Object.entries(taskCompletions)) {
    const flags = getCompletionFlags(completion);
    normalized[taskId] = {
      complete: flags.complete,
      failed: flags.failed,
    };
  }
  return normalized;
};
const isCollectorTask = (task: Task): boolean => {
  if (!task?.id) {
    return false;
  }
  if (task.id === COLLECTOR_TASK_ID) {
    return true;
  }
  const normalizedName = task.name?.trim().toLowerCase();
  const normalizedTrader = task.trader?.name?.trim().toLowerCase();
  return normalizedName === 'collector' && normalizedTrader === 'fence';
};
const mergeKappaItemRequirements = (
  neededItemTaskObjectives: NeededItemTaskObjective[],
  eligibleTaskIds: Set<string>
): MergedKappaItemRequirement[] => {
  const merged = new Map<string, MergedKappaItemRequirement>();
  for (const objective of neededItemTaskObjectives) {
    if (!objective?.id || !objective.taskId || !eligibleTaskIds.has(objective.taskId)) {
      continue;
    }
    const itemId = getPrimaryItemId(objective);
    if (!itemId) {
      continue;
    }
    const key = `${objective.taskId}:${itemId}`;
    const normalizedCount = Math.max(0, objective.count ?? 1);
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, {
        ...existing,
        count: existing.count + normalizedCount,
        objectiveIds: existing.objectiveIds.includes(objective.id)
          ? existing.objectiveIds
          : [...existing.objectiveIds, objective.id],
      });
      continue;
    }
    merged.set(key, {
      count: normalizedCount,
      objectiveIds: [objective.id],
      taskId: objective.taskId,
    });
  }
  return [...merged.values()];
};
export const computeStreamerKappaMetrics = ({
  editions,
  gameEdition,
  neededItemTaskObjectives,
  pmcFaction,
  taskCompletions,
  taskObjectives,
  tasks,
}: ComputeStreamerKappaMetricsInput): StreamerKappaMetrics => {
  const relevantTasks = tasks.filter((task) => {
    if (!task?.id) {
      return false;
    }
    if (task.factionName && task.factionName !== 'Any' && task.factionName !== pmcFaction) {
      return false;
    }
    return checkTaskEdition(task.id, gameEdition, editions);
  });
  const invalidation = computeInvalidProgress({
    pmcFaction,
    taskCompletions: normalizeTaskCompletionsForInvalidation(taskCompletions),
    tasks: relevantTasks,
  });
  const eligibleKappaTaskIds = new Set<string>();
  const eligibleCollectorTaskIds = new Set<string>();
  let totalKappaTasks = 0;
  let completedKappaTasks = 0;
  for (const task of relevantTasks) {
    const successful = isTaskSuccessful(taskCompletions, task.id);
    const failed = isTaskFailed(taskCompletions, task.id);
    const invalid = invalidation.invalidTasks[task.id] === true;
    if (isCollectorTask(task) && (successful || (!failed && !invalid))) {
      eligibleCollectorTaskIds.add(task.id);
    }
    if (task.kappaRequired !== true) {
      continue;
    }
    if (successful) {
      totalKappaTasks += 1;
      completedKappaTasks += 1;
      eligibleKappaTaskIds.add(task.id);
      continue;
    }
    if (failed || invalid) {
      continue;
    }
    totalKappaTasks += 1;
    eligibleKappaTaskIds.add(task.id);
  }
  const mergedKappaItems = mergeKappaItemRequirements(
    neededItemTaskObjectives,
    eligibleCollectorTaskIds
  );
  let totalKappaItems = 0;
  let collectedKappaItems = 0;
  for (const requirement of mergedKappaItems) {
    const requiredCount = Math.max(0, requirement.count || 1);
    totalKappaItems += requiredCount;
    if (isTaskSuccessful(taskCompletions, requirement.taskId)) {
      collectedKappaItems += requiredCount;
      continue;
    }
    const maxObjectiveCount = requirement.objectiveIds.reduce((currentMax, objectiveId) => {
      return Math.max(currentMax, getObjectiveCount(taskObjectives, objectiveId));
    }, 0);
    const currentCount = Math.min(requiredCount, maxObjectiveCount);
    const hasCompletedObjectives =
      requirement.objectiveIds.length > 0 &&
      requirement.objectiveIds.every(
        (objectiveId) => taskObjectives[objectiveId]?.complete === true
      );
    if (hasCompletedObjectives || requiredCount <= currentCount) {
      collectedKappaItems += requiredCount;
      continue;
    }
    collectedKappaItems += currentCount;
  }
  const remainingKappaTasks = Math.max(totalKappaTasks - completedKappaTasks, 0);
  const remainingKappaItems = Math.max(totalKappaItems - collectedKappaItems, 0);
  return {
    items: {
      collected: collectedKappaItems,
      percentage: calculatePercentage(collectedKappaItems, totalKappaItems),
      remaining: remainingKappaItems,
      total: totalKappaItems,
    },
    tasks: {
      completed: completedKappaTasks,
      percentage: calculatePercentage(completedKappaTasks, totalKappaTasks),
      remaining: remainingKappaTasks,
      total: totalKappaTasks,
    },
  };
};
