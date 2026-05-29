import { getNeededItemId } from '@/features/neededitems/neededItemFilters';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { CURRENCY_ITEM_IDS } from '@/utils/constants';
import { isTaskAvailableForEdition as checkTaskEdition } from '@/utils/editionHelpers';
import { isTaskComplete, isTaskCounted } from '@/utils/taskStatus';
import { buildTaskTypeFilterOptions, filterTasksByTypeSettings } from '@/utils/taskTypeFilters';
import type { ComputedRef } from '#imports';
import type {
  NeededItemHideoutModule,
  NeededItemTaskObjective,
  Task,
  Trader,
} from '@/types/tarkov';
export type TraderStats = {
  id: Trader['id'];
  name: Trader['name'];
  normalizedName: Trader['normalizedName'];
  imageLink: Trader['imageLink'];
  levels: Trader['levels'];
  totalTasks: number;
  completedTasks: number;
  percentage: number;
};
type MergedNeededTaskObjective = NeededItemTaskObjective & { objectiveIds: string[] };
export function useDashboardStats(): {
  availableTasksCount: ComputedRef<number>;
  failedTasksCount: ComputedRef<number>;
  totalTasks: ComputedRef<number>;
  totalObjectives: ComputedRef<number>;
  completedObjectives: ComputedRef<number>;
  completedTasks: ComputedRef<number>;
  completedTaskItems: ComputedRef<number>;
  totalTaskItems: ComputedRef<number>;
  completedHideoutItems: ComputedRef<number>;
  totalHideoutItems: ComputedRef<number>;
  totalKappaTasks: ComputedRef<number>;
  completedKappaTasks: ComputedRef<number>;
  totalLightkeeperTasks: ComputedRef<number>;
  completedLightkeeperTasks: ComputedRef<number>;
  traderStats: ComputedRef<TraderStats[]>;
} {
  const progressStore = useProgressStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const isTaskSuccessful = (taskId: string) =>
    isTaskComplete({
      complete: tarkovStore.isTaskComplete(taskId),
      failed: tarkovStore.isTaskFailed(taskId),
    });
  // Check if a task is invalid (failed, blocked by failed prereqs, wrong faction, etc.)
  const isTaskInvalid = (taskId: string) => progressStore.invalidTasks[taskId]?.self === true;
  // Check if a task should be counted toward progression totals
  const isCountedForStats = (taskId: string) => {
    const completion = {
      complete: tarkovStore.isTaskComplete(taskId),
      failed: tarkovStore.isTaskFailed(taskId),
    };
    return isTaskCounted(completion, isTaskInvalid(taskId));
  };
  // Check if a task is available for the user's edition (uses shared helper)
  const isTaskAvailableForEdition = (taskId: string): boolean =>
    checkTaskEdition(taskId, tarkovStore.getGameEdition(), metadataStore.editions);
  const relevantTasks = computed(() => {
    if (!metadataStore.tasks) return [];
    const currentFaction = tarkovStore.getPMCFaction();
    const factionFiltered = metadataStore.tasks.filter(
      (task) => task && (task.factionName === 'Any' || task.factionName === currentFaction)
    );
    const options = buildTaskTypeFilterOptions(preferencesStore, tarkovStore, metadataStore);
    return filterTasksByTypeSettings(factionFiltered, options);
  });
  // Available tasks count
  const availableTasksCount = computed(() => {
    if (!progressStore.unlockedTasks) return 0;
    let count = 0;
    for (const taskId in progressStore.unlockedTasks) {
      if (progressStore.unlockedTasks[taskId]?.self) count++;
    }
    return count;
  });
  // Failed tasks count
  const failedTasksCount = computed(() => {
    if (!metadataStore.tasks) return 0;
    return metadataStore.tasks.filter((t) => tarkovStore.isTaskFailed(t.id)).length;
  });
  // Needed item task objectives (memoized)
  const neededItemTaskObjectives = computed<NeededItemTaskObjective[]>(
    () => metadataStore.neededItemTaskObjectives ?? []
  );
  const mergedNeededTaskItems = computed<MergedNeededTaskObjective[]>(() => {
    if (!neededItemTaskObjectives.value.length) return [];
    const merged = new Map<string, MergedNeededTaskObjective>();
    for (const objective of neededItemTaskObjectives.value) {
      if (!objective?.taskId || !objective.id) continue;
      if (!isObjectiveRelevant(objective)) continue;
      const itemId = getNeededItemId(objective);
      if (!itemId) continue;
      const key = `${objective.taskId}:${itemId}`;
      const normalizedCount = objective.count || 1;
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, {
          ...existing,
          count: (existing.count || 1) + normalizedCount,
          objectiveIds: existing.objectiveIds.includes(objective.id)
            ? existing.objectiveIds
            : [...existing.objectiveIds, objective.id],
        });
      } else {
        merged.set(key, { ...objective, count: normalizedCount, objectiveIds: [objective.id] });
      }
    }
    return Array.from(merged.values());
  });
  const neededItemHideoutModules = computed<NeededItemHideoutModule[]>(
    () => metadataStore.neededItemHideoutModules ?? []
  );
  const isHideoutModuleCompleted = (moduleId: string): boolean =>
    progressStore.moduleCompletions?.[moduleId]?.['self'] ?? false;
  const mergedNeededHideoutItems = computed<NeededItemHideoutModule[]>(() => {
    if (!neededItemHideoutModules.value.length) return [];
    const merged = new Map<string, NeededItemHideoutModule>();
    for (const requirement of neededItemHideoutModules.value) {
      const moduleId = requirement?.hideoutModule?.id;
      if (!requirement?.id || !moduleId) continue;
      const itemId = getNeededItemId(requirement);
      if (!itemId) continue;
      if (CURRENCY_ITEM_IDS.includes(itemId as (typeof CURRENCY_ITEM_IDS)[number])) continue;
      const key = `${moduleId}:${itemId}`;
      const normalizedCount = requirement.count || 1;
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, { ...existing, count: (existing.count || 1) + normalizedCount });
      } else {
        merged.set(key, { ...requirement, count: normalizedCount });
      }
    }
    return Array.from(merged.values());
  });
  const taskById = computed(
    () => new Map((metadataStore.tasks ?? []).map((task) => [task.id, task]))
  );
  // Total tasks count - includes completed tasks, excludes failed and invalid tasks
  const totalTasks = computed(() => {
    return relevantTasks.value.filter((task) => isCountedForStats(task.id)).length;
  });
  // Total objectives count - includes objectives from completed tasks, excludes from failed/invalid tasks
  const totalObjectives = computed(() => {
    return relevantTasks.value.reduce((total, task) => {
      if (isCountedForStats(task.id)) {
        return total + (task?.objectives?.length || 0);
      }
      return total;
    }, 0);
  });
  // Completed objectives count - from completed tasks or non-failed/non-invalid incomplete tasks
  const completedObjectives = computed(() => {
    if (!relevantTasks.value.length || !tarkovStore) {
      return 0;
    }
    let count = 0;
    for (const task of relevantTasks.value) {
      if (!isCountedForStats(task.id)) {
        continue;
      }
      for (const objective of task.objectives || []) {
        if (objective?.id && tarkovStore.isTaskObjectiveComplete(objective.id)) {
          count++;
        }
      }
    }
    return count;
  });
  // Completed tasks count (only faction-relevant tasks)
  const completedTasks = computed(() => {
    if (!relevantTasks.value.length) return 0;
    return relevantTasks.value.filter((task) => isTaskSuccessful(task.id)).length;
  });
  // Helper to check if objective is relevant for current faction and edition
  const isObjectiveRelevant = (
    objective: Pick<NeededItemTaskObjective, 'item' | 'markerItem' | 'taskId'> | null | undefined
  ) => {
    if (!objective) return false;
    const primaryItem = objective.item ?? objective.markerItem;
    if (
      primaryItem &&
      CURRENCY_ITEM_IDS.includes(primaryItem.id as (typeof CURRENCY_ITEM_IDS)[number])
    ) {
      return false;
    }
    const relatedTask = (objective.taskId ? taskById.value.get(objective.taskId) : null) as
      | Task
      | null
      | undefined;
    if (!relatedTask) return false;
    // Exclude objectives from tasks not available for user's edition
    if (!isTaskAvailableForEdition(relatedTask.id)) return false;
    // Exclude objectives from failed tasks
    if (tarkovStore.isTaskFailed(relatedTask.id)) return false;
    // Exclude objectives from incomplete invalid tasks (but include from completed tasks)
    if (!isTaskSuccessful(relatedTask.id) && isTaskInvalid(relatedTask.id)) return false;
    const currentPMCFaction = tarkovStore.getPMCFaction();
    return !!(
      relatedTask.factionName &&
      currentPMCFaction !== undefined &&
      (relatedTask.factionName === 'Any' || relatedTask.factionName === currentPMCFaction)
    );
  };
  // Completed task items count
  const completedTaskItems = computed(() => {
    if (!mergedNeededTaskItems.value.length || !metadataStore.tasks || !tarkovStore) {
      return 0;
    }
    let total = 0;
    mergedNeededTaskItems.value.forEach((objective) => {
      if (!objective.id || !objective.taskId) return;
      const requiredCount = objective.count || 1;
      const maxObjectiveCount = objective.objectiveIds.reduce(
        (currentMax, objectiveId) =>
          Math.max(currentMax, tarkovStore.getObjectiveCount(objectiveId)),
        0
      );
      const currentCount = Math.min(requiredCount, maxObjectiveCount);
      const hasCompletedObjectives =
        objective.objectiveIds.length > 0 &&
        objective.objectiveIds.every((objectiveId) =>
          tarkovStore.isTaskObjectiveComplete(objectiveId)
        );
      if (
        isTaskSuccessful(objective.taskId) ||
        hasCompletedObjectives ||
        requiredCount <= currentCount
      ) {
        total += requiredCount;
      } else {
        total += currentCount;
      }
    });
    return total;
  });
  // Total task items count
  const totalTaskItems = computed(() => {
    if (!mergedNeededTaskItems.value.length || !metadataStore.tasks || !tarkovStore) {
      return 0;
    }
    return mergedNeededTaskItems.value.reduce(
      (total, objective) => total + (objective.count || 1),
      0
    );
  });
  const completedHideoutItems = computed(() => {
    if (!mergedNeededHideoutItems.value.length || !tarkovStore) {
      return 0;
    }
    let total = 0;
    mergedNeededHideoutItems.value.forEach((requirement) => {
      if (!requirement.id) return;
      const requiredCount = requirement.count || 1;
      const moduleId = requirement.hideoutModule?.id;
      if (moduleId && isHideoutModuleCompleted(moduleId)) {
        total += requiredCount;
        return;
      }
      const currentCount = Math.min(requiredCount, tarkovStore.getHideoutPartCount(requirement.id));
      if (tarkovStore.isHideoutPartComplete(requirement.id) || requiredCount <= currentCount) {
        total += requiredCount;
      } else {
        total += currentCount;
      }
    });
    return total;
  });
  const totalHideoutItems = computed(() => {
    if (!mergedNeededHideoutItems.value.length) {
      return 0;
    }
    return mergedNeededHideoutItems.value.reduce(
      (total, requirement) => total + (requirement.count || 1),
      0
    );
  });
  // Total Kappa tasks count - includes completed, excludes failed and invalid
  const totalKappaTasks = computed(() => {
    return relevantTasks.value.filter((task) => {
      if (!task.kappaRequired) return false;
      return isCountedForStats(task.id);
    }).length;
  });
  // Completed Kappa tasks count
  const completedKappaTasks = computed(() => {
    return relevantTasks.value.filter(
      (task) => task.kappaRequired === true && isTaskSuccessful(task.id)
    ).length;
  });
  // Total Lightkeeper tasks count - includes completed, excludes failed and invalid
  const totalLightkeeperTasks = computed(() => {
    return relevantTasks.value.filter((task) => {
      if (!task.lightkeeperRequired) return false;
      return isCountedForStats(task.id);
    }).length;
  });
  // Completed Lightkeeper tasks count
  const completedLightkeeperTasks = computed(() => {
    return relevantTasks.value.filter(
      (task) => task.lightkeeperRequired === true && isTaskSuccessful(task.id)
    ).length;
  });
  // Trader-specific stats - includes completed, excludes failed and invalid
  const traderStats = computed(() => {
    if (!metadataStore.traders) return [];
    return metadataStore.sortedTraders
      .map((trader) => {
        const traderTasks = relevantTasks.value.filter((task) => task.trader?.id === trader.id);
        // Total includes completed tasks, excludes failed and invalid tasks
        const totalTasks = traderTasks.filter((task) => isCountedForStats(task.id)).length;
        const completedTasks = traderTasks.filter((task) => isTaskSuccessful(task.id)).length;
        return {
          id: trader.id,
          name: trader.name,
          normalizedName: trader.normalizedName,
          imageLink: trader.imageLink,
          levels: trader.levels,
          totalTasks,
          completedTasks,
          percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 1000) / 10 : 0,
        };
      })
      .filter((stats) => stats.totalTasks > 0); // Only show traders with at least 1 task
  });
  return {
    availableTasksCount,
    failedTasksCount,
    totalTasks,
    totalObjectives,
    completedObjectives,
    completedTasks,
    completedTaskItems,
    totalTaskItems,
    completedHideoutItems,
    totalHideoutItems,
    totalKappaTasks,
    completedKappaTasks,
    totalLightkeeperTasks,
    completedLightkeeperTasks,
    traderStats,
  };
}
