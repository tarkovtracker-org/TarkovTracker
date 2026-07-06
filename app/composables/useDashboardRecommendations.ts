import { useDashboardFilters } from '@/composables/useDashboardFilters';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { GAME_MODES, resolveTraderUnlockTaskIds } from '@/utils/constants';
import { buildTaskTypeFilterOptions, filterTasksByTypeSettings } from '@/utils/taskTypeFilters';
import type { ComputedRef } from '#imports';
import type { Task, TaskObjective, TaskRequirement } from '@/types/tarkov';
type DashboardRecommendationReason =
  | 'blocked-fence'
  | 'blocked-level'
  | 'blocked-prerequisite'
  | 'blocked-trader-unlock'
  | 'close'
  | 'complete'
  | 'default'
  | 'filter-hidden'
  | 'impact'
  | 'kappa'
  | 'lightkeeper'
  | 'unlock-trader';
export type DashboardRecommendationTone =
  'accent' | 'info' | 'kappa' | 'lightkeeper' | 'primary' | 'success' | 'warning';
export type DashboardRecommendationMode = 'actionable' | 'blocked' | 'complete' | 'empty';
export interface DashboardRecommendationRoute {
  path: string;
  query?: Record<string, string>;
}
export interface DashboardRecommendationBlocker {
  type: 'complete' | 'fence' | 'filters' | 'level' | 'prerequisite' | 'ready' | 'trader-unlock';
  count?: number;
  required?: number;
  taskName?: string;
  taskNames?: string[];
  traderName?: string;
}
export interface DashboardRecommendation {
  id: string;
  action: DashboardRecommendationRoute;
  blockers: DashboardRecommendationBlocker[];
  chainTraderName?: string;
  hiddenAvailableCount?: number;
  impact: number;
  isKappa: boolean;
  isLightkeeper: boolean;
  kind: 'filters' | 'task';
  progress: {
    completed: number;
    remaining: number;
    total: number;
  };
  reason: DashboardRecommendationReason;
  score: number;
  taskId?: string;
  taskName?: string;
  tone: DashboardRecommendationTone;
  unlockTraderName?: string;
}
const DASHBOARD_RECOMMENDATION_BLOCKER_PRIORITY: DashboardRecommendationBlocker['type'][] = [
  'trader-unlock',
  'level',
  'fence',
  'prerequisite',
  'filters',
  'complete',
  'ready',
];
const COMPLETE_STATUSES = ['complete', 'completed'];
const ACTIVE_STATUSES = ['accept', 'accepted', 'active'];
const FAILED_STATUSES = ['failed'];
const getCountedObjectives = (task: Task): TaskObjective[] => {
  const objectives = Array.isArray(task.objectives) ? task.objectives.filter(Boolean) : [];
  const requiredObjectives = objectives.filter((objective) => objective.optional !== true);
  return requiredObjectives.length ? requiredObjectives : objectives;
};
const normalizeRequirementStatuses = (statuses?: string[]) =>
  (statuses ?? []).map((status) => status.toLowerCase());
const hasRequirementStatus = (statuses: string[], values: string[]) =>
  values.some((value) => statuses.includes(value));
const getDashboardRecommendationBlockerPriority = (blocker: DashboardRecommendationBlocker) => {
  const index = DASHBOARD_RECOMMENDATION_BLOCKER_PRIORITY.indexOf(blocker.type);
  return index === -1 ? DASHBOARD_RECOMMENDATION_BLOCKER_PRIORITY.length : index;
};
export const compareDashboardRecommendationBlockers = (
  left: DashboardRecommendationBlocker,
  right: DashboardRecommendationBlocker
) =>
  getDashboardRecommendationBlockerPriority(left) -
  getDashboardRecommendationBlockerPriority(right);
export const getPrimaryDashboardRecommendationBlocker = (
  blockers: DashboardRecommendationBlocker[]
): DashboardRecommendationBlocker => {
  let primaryBlocker: DashboardRecommendationBlocker | null = null;
  let primaryPriority = Number.POSITIVE_INFINITY;
  for (const blocker of blockers) {
    const priority = getDashboardRecommendationBlockerPriority(blocker);
    if (priority < primaryPriority) {
      primaryBlocker = blocker;
      primaryPriority = priority;
    }
  }
  return primaryBlocker ?? { type: 'ready' };
};
export function useDashboardRecommendations(): {
  availableActionCount: ComputedRef<number>;
  filtersActive: ComputedRef<boolean>;
  hasMultipleStrongOptions: ComputedRef<boolean>;
  hiddenAvailableCount: ComputedRef<number>;
  mode: ComputedRef<DashboardRecommendationMode>;
  primaryRecommendation: ComputedRef<DashboardRecommendation | null>;
  secondaryRecommendations: ComputedRef<DashboardRecommendation[]>;
} {
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const { hasDashboardFiltersActive: filtersActive } = useDashboardFilters(preferencesStore);
  const currentFaction = computed(() => tarkovStore.getPMCFaction());
  const currentMode = computed(() => tarkovStore.getCurrentGameMode?.() ?? GAME_MODES.PVP);
  const currentLevel = computed(() => progressStore.getLevel('self'));
  const taskById = computed(
    () => new Map((metadataStore.tasks ?? []).map((task) => [task.id, task]))
  );
  const fenceTrader = computed(() =>
    metadataStore.traders.find((trader) => trader.normalizedName === 'fence')
  );
  const baseTasks = computed(() => {
    if (!metadataStore.tasks?.length) return [];
    return metadataStore.tasks.filter(
      (task) =>
        task &&
        (task.factionName === 'Any' ||
          !task.factionName ||
          task.factionName === currentFaction.value)
    );
  });
  const filteredTasks = computed(() => {
    const options = buildTaskTypeFilterOptions(preferencesStore, tarkovStore, metadataStore);
    return filterTasksByTypeSettings(baseTasks.value, options);
  });
  const isTaskInvalid = (taskId: string) => progressStore.invalidTasks?.[taskId]?.self === true;
  const isTaskSuccessful = (taskId: string) =>
    tarkovStore.isTaskComplete(taskId) && !tarkovStore.isTaskFailed(taskId);
  const isTaskAvailable = (taskId: string) => progressStore.unlockedTasks?.[taskId]?.self === true;
  const trackableTasks = (tasks: Task[]) =>
    tasks.filter((task) => !tarkovStore.isTaskFailed(task.id) && !isTaskInvalid(task.id));
  const pendingTasks = (tasks: Task[]) =>
    trackableTasks(tasks).filter((task) => !isTaskSuccessful(task.id));
  const filteredTrackableTasks = computed(() => trackableTasks(filteredTasks.value));
  const unfilteredPendingTasks = computed(() => pendingTasks(baseTasks.value));
  const filteredPendingTasks = computed(() => pendingTasks(filteredTasks.value));
  const availableTaskIds = (tasks: Task[]) =>
    new Set(tasks.filter((task) => isTaskAvailable(task.id)).map((task) => task.id));
  const filteredAvailableTaskIds = computed(() => availableTaskIds(filteredPendingTasks.value));
  const unfilteredAvailableTaskIds = computed(() => availableTaskIds(unfilteredPendingTasks.value));
  const hiddenAvailableCount = computed(() => {
    let count = 0;
    for (const taskId of unfilteredAvailableTaskIds.value) {
      if (!filteredAvailableTaskIds.value.has(taskId)) {
        count++;
      }
    }
    return count;
  });
  const eligibleTaskIds = computed(
    () => new Set(filteredPendingTasks.value.map((task) => task.id))
  );
  const impactScores = computed(() => {
    const scores = new Map<string, number>();
    for (const task of filteredPendingTasks.value) {
      const downstreamTaskIds =
        (Array.isArray(task.children) && task.children.length ? task.children : task.successors) ??
        [];
      const impact = downstreamTaskIds.filter((taskId) => eligibleTaskIds.value.has(taskId)).length;
      scores.set(task.id, impact);
    }
    return scores;
  });
  const traderUnlockTaskMap = computed(() => {
    const unlockMap = new Map<string, string>();
    for (const trader of metadataStore.sortedTraders ?? []) {
      const unlockTaskIds = resolveTraderUnlockTaskIds(trader.normalizedName, currentMode.value);
      for (const unlockTaskId of unlockTaskIds) {
        unlockMap.set(unlockTaskId, trader.name);
      }
    }
    return unlockMap;
  });
  const getTaskProgress = (task: Task) => {
    const objectives = getCountedObjectives(task);
    const completed = objectives.filter(
      (objective) => objective.id && tarkovStore.isTaskObjectiveComplete(objective.id)
    ).length;
    const total = objectives.length || 1;
    const remaining = Math.max(0, total - completed);
    return {
      completed: Math.min(completed, total),
      remaining,
      total,
    };
  };
  const getTaskRequirementBlockers = (taskRequirements?: TaskRequirement[]) => {
    if (!taskRequirements?.length) return [];
    return taskRequirements.filter((requirement) => {
      const requiredTaskId = requirement?.task?.id;
      if (!requiredTaskId) return false;
      const statuses = normalizeRequirementStatuses(requirement.status);
      const requiresComplete =
        statuses.length === 0 || hasRequirementStatus(statuses, COMPLETE_STATUSES);
      const requiresActive = hasRequirementStatus(statuses, ACTIVE_STATUSES);
      const requiresFailed = hasRequirementStatus(statuses, FAILED_STATUSES);
      const isComplete = tarkovStore.isTaskComplete(requiredTaskId);
      const isFailed = tarkovStore.isTaskFailed(requiredTaskId);
      const isUnlocked = isTaskAvailable(requiredTaskId);
      if (requiresComplete && isComplete) return false;
      if (requiresFailed && isFailed) return false;
      if (requiresActive && (isComplete || isUnlocked)) return false;
      return true;
    });
  };
  const getTaskBlockers = (task: Task): DashboardRecommendationBlocker[] => {
    const blockers: DashboardRecommendationBlocker[] = [];
    if (task.minPlayerLevel && currentLevel.value < task.minPlayerLevel) {
      blockers.push({
        type: 'level',
        count: task.minPlayerLevel - currentLevel.value,
        required: task.minPlayerLevel,
      });
    }
    const fenceRequirement = task.traderRequirements?.find(
      (requirement) => requirement.trader.id === fenceTrader.value?.id
    );
    if (fenceRequirement && fenceTrader.value) {
      const currentReputation = tarkovStore.getTraderReputation(fenceTrader.value.id);
      const needsHigherReputation =
        fenceRequirement.value >= 0 && currentReputation < fenceRequirement.value;
      const needsLowerReputation =
        fenceRequirement.value < 0 && currentReputation > fenceRequirement.value;
      if (needsHigherReputation || needsLowerReputation) {
        blockers.push({
          type: 'fence',
          count: Math.abs(fenceRequirement.value - currentReputation),
          required: fenceRequirement.value,
        });
      }
    }
    const unmetRequirements = getTaskRequirementBlockers(task.taskRequirements);
    if (unmetRequirements.length) {
      blockers.push({
        type: 'prerequisite',
        count: unmetRequirements.length,
        taskNames: unmetRequirements
          .slice(0, 3)
          .map(
            (requirement) =>
              requirement.task.name ||
              taskById.value.get(requirement.task.id)?.name ||
              requirement.task.id
          ),
      });
    }
    const traderName = task.trader?.normalizedName || task.trader?.name?.toLowerCase();
    const unlockTaskIds = resolveTraderUnlockTaskIds(traderName, currentMode.value).filter(
      (unlockTaskId) => unlockTaskId !== task.id && taskById.value.has(unlockTaskId)
    );
    if (
      unlockTaskIds.length &&
      !unlockTaskIds.some((unlockTaskId) => tarkovStore.isTaskComplete(unlockTaskId))
    ) {
      const unlockTaskId = unlockTaskIds[0];
      const unlockTask = unlockTaskId ? taskById.value.get(unlockTaskId) : null;
      blockers.push({
        type: 'trader-unlock',
        taskName: unlockTask?.name || unlockTaskId,
        traderName: task.trader?.name,
      });
    }
    if (!blockers.length) {
      blockers.push({ type: 'ready' });
    }
    return blockers.sort(compareDashboardRecommendationBlockers);
  };
  const getRecommendationTone = (task: Task | null, reason: DashboardRecommendationReason) => {
    if (reason === 'filter-hidden') return 'info';
    if (reason.startsWith('blocked')) return 'warning';
    if (reason === 'impact' || reason === 'unlock-trader') return 'primary';
    if (reason === 'close') return 'success';
    if (reason === 'lightkeeper' || task?.lightkeeperRequired) return 'lightkeeper';
    if (reason === 'kappa' || task?.kappaRequired) return 'kappa';
    return 'accent';
  };
  const getRecommendationReason = (
    task: Task,
    impact: number,
    blockers: DashboardRecommendationBlocker[],
    unlockTraderName?: string
  ): DashboardRecommendationReason => {
    const primaryBlocker = getPrimaryDashboardRecommendationBlocker(blockers);
    if (primaryBlocker.type === 'trader-unlock') return 'blocked-trader-unlock';
    if (primaryBlocker.type === 'level') return 'blocked-level';
    if (primaryBlocker.type === 'fence') return 'blocked-fence';
    if (primaryBlocker.type === 'prerequisite') return 'blocked-prerequisite';
    if (unlockTraderName) return 'unlock-trader';
    if (impact > 0) return 'impact';
    if (task.lightkeeperRequired) return 'lightkeeper';
    if (task.kappaRequired) return 'kappa';
    const progress = getTaskProgress(task);
    if (progress.remaining <= 1) return 'close';
    return 'default';
  };
  const buildTaskRecommendation = (task: Task, ready: boolean): DashboardRecommendation => {
    const blockers = ready
      ? [{ type: 'ready' } satisfies DashboardRecommendationBlocker]
      : getTaskBlockers(task);
    const impact = impactScores.value.get(task.id) ?? 0;
    const progress = getTaskProgress(task);
    const unlockTraderName = traderUnlockTaskMap.value.get(task.id);
    const reason = getRecommendationReason(task, impact, blockers, unlockTraderName);
    const progressRatio = progress.total > 0 ? progress.completed / progress.total : 0;
    const score =
      (unlockTraderName ? 1000 : 0) +
      impact * 120 +
      (task.lightkeeperRequired ? 90 : 0) +
      (task.kappaRequired ? 70 : 0) +
      Math.round(progressRatio * 100) +
      Math.max(0, 30 - progress.remaining * 6) -
      (ready ? 0 : blockers.reduce((total, blocker) => total + (blocker.count ?? 1) * 12, 0));
    return {
      id: `${ready ? 'available' : 'blocked'}-${task.id}`,
      action: {
        path: '/tasks',
        query: { task: task.id },
      },
      blockers,
      chainTraderName: task.trader?.name,
      impact,
      isKappa: task.kappaRequired === true,
      isLightkeeper: task.lightkeeperRequired === true,
      kind: 'task',
      progress,
      reason,
      score,
      taskId: task.id,
      taskName: task.name || task.id,
      tone: getRecommendationTone(task, reason),
      unlockTraderName,
    };
  };
  const compareRecommendations = (
    left: DashboardRecommendation,
    right: DashboardRecommendation
  ) => {
    if (right.score !== left.score) return right.score - left.score;
    const leftName = left.taskName?.toLowerCase() ?? '';
    const rightName = right.taskName?.toLowerCase() ?? '';
    return leftName.localeCompare(rightName);
  };
  const availableRecommendations = computed(() =>
    filteredPendingTasks.value
      .filter((task) => isTaskAvailable(task.id))
      .map((task) => buildTaskRecommendation(task, true))
      .sort(compareRecommendations)
  );
  const blockedRecommendations = computed(() =>
    filteredPendingTasks.value
      .filter((task) => !isTaskAvailable(task.id))
      .map((task) => buildTaskRecommendation(task, false))
      .sort(compareRecommendations)
  );
  const filterHiddenRecommendation = computed<DashboardRecommendation | null>(() => {
    if (!filtersActive.value || hiddenAvailableCount.value <= 0) return null;
    if (availableRecommendations.value.length > 0) return null;
    return {
      id: 'filters-hidden',
      action: { path: '/tasks' },
      blockers: [
        {
          type: 'filters',
          count: hiddenAvailableCount.value,
        },
      ],
      hiddenAvailableCount: hiddenAvailableCount.value,
      impact: 0,
      isKappa: false,
      isLightkeeper: false,
      kind: 'filters',
      progress: {
        completed: 0,
        remaining: hiddenAvailableCount.value,
        total: hiddenAvailableCount.value,
      },
      reason: 'filter-hidden',
      score: hiddenAvailableCount.value * 100,
      tone: 'info',
    };
  });
  const completeRecommendation = computed<DashboardRecommendation | null>(() => {
    if (filteredPendingTasks.value.length > 0) return null;
    if (!filteredTrackableTasks.value.length) return null;
    return {
      id: 'dashboard-complete',
      action: { path: '/tasks' },
      blockers: [{ type: 'complete' }],
      impact: 0,
      isKappa: false,
      isLightkeeper: false,
      kind: 'task',
      progress: {
        completed: filteredTrackableTasks.value.length,
        remaining: 0,
        total: filteredTrackableTasks.value.length,
      },
      reason: 'complete',
      score: 0,
      tone: 'success',
    };
  });
  const primaryRecommendation = computed<DashboardRecommendation | null>(() => {
    if (availableRecommendations.value.length > 0) {
      return availableRecommendations.value[0] ?? null;
    }
    if (filterHiddenRecommendation.value) {
      return filterHiddenRecommendation.value;
    }
    if (blockedRecommendations.value.length > 0) {
      return blockedRecommendations.value[0] ?? null;
    }
    if (completeRecommendation.value) {
      return completeRecommendation.value;
    }
    return null;
  });
  const secondaryRecommendations = computed(() => {
    const primary = primaryRecommendation.value;
    if (!primary) return [];
    if (primary.id === 'filters-hidden') {
      return blockedRecommendations.value.slice(0, 3);
    }
    if (availableRecommendations.value.length > 1) {
      return availableRecommendations.value
        .filter((candidate) => candidate.id !== primary.id)
        .slice(0, 3);
    }
    if (primary.blockers.some((blocker) => blocker.type !== 'ready')) {
      return blockedRecommendations.value
        .filter((candidate) => candidate.id !== primary.id)
        .slice(0, 3);
    }
    return [];
  });
  const hasMultipleStrongOptions = computed(() => {
    if (availableRecommendations.value.length < 2) return false;
    const [first, second] = availableRecommendations.value;
    return (first?.score ?? 0) - (second?.score ?? 0) <= 40;
  });
  const mode = computed<DashboardRecommendationMode>(() => {
    const primary = primaryRecommendation.value;
    if (!primary) return 'empty';
    if (primary.reason === 'complete') return 'complete';
    if (
      primary.kind === 'filters' ||
      primary.blockers.some((blocker) => blocker.type !== 'ready')
    ) {
      return 'blocked';
    }
    return 'actionable';
  });
  return {
    availableActionCount: computed(() => availableRecommendations.value.length),
    filtersActive,
    hasMultipleStrongOptions,
    hiddenAvailableCount,
    mode,
    primaryRecommendation,
    secondaryRecommendations,
  };
}
