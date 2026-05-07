import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { isAllUsersView } from '@/types/taskFilter';
import { perfEnd, perfStart } from '@/utils/perf';
import type { Task } from '@/types/tarkov';
import type { TaskSecondaryView } from '@/types/taskFilter';
export function useTaskCounts() {
  const progressStore = useProgressStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const isTaskInvalid = (taskId: string, userView: string, teamIds?: string[]): boolean => {
    if (isAllUsersView(userView)) {
      const ids = teamIds ?? Object.keys(progressStore.visibleTeamStores || {});
      return ids.every((teamId) => progressStore.invalidTasks?.[taskId]?.[teamId] === true);
    }
    return progressStore.invalidTasks?.[taskId]?.[userView] === true;
  };
  const shouldApplyRequiredKeysFilter = (): boolean =>
    preferencesStore.getOnlyTasksWithRequiredKeys && metadataStore.tasksObjectivesHydrated;
  const taskHasRequiredKeys = (task: Task): boolean => (task.requiredKeys?.length ?? 0) > 0;
  const calculateStatusCounts = (
    userView: string
  ): { all: number; available: number; locked: number; completed: number; failed: number } => {
    const perfTimer = perfStart('[Tasks] calculateStatusCounts', {
      tasks: metadataStore.tasks.length,
      userView,
    });
    const counts = { all: 0, available: 0, locked: 0, completed: 0, failed: 0 };
    const taskList = metadataStore.tasks;
    const showKappa = !preferencesStore.getHideNonKappaTasks;
    const showLightkeeper = preferencesStore.getShowLightkeeperTasks;
    const showNonSpecial = preferencesStore.getShowNonSpecialTasks;
    const hasTypeSelection = showKappa || showLightkeeper || showNonSpecial;
    const onlyTasksWithRequiredKeys = shouldApplyRequiredKeysFilter();
    const userPrestigeLevel = tarkovStore.getPrestigeLevel();
    const prestigeTaskMap = metadataStore.prestigeTaskMap || new Map<string, number>();
    const userEdition = tarkovStore.getGameEdition();
    const excludedTaskIds = metadataStore.getExcludedTaskIdsForEdition(userEdition);
    const isAllUsers = isAllUsersView(userView);
    const visibleTeamIds = isAllUsers ? Object.keys(progressStore.visibleTeamStores || {}) : [];
    for (const task of taskList) {
      if (excludedTaskIds.has(task.id)) continue;
      if (prestigeTaskMap.has(task.id)) {
        const taskPrestigeLevel = prestigeTaskMap.get(task.id);
        if (taskPrestigeLevel !== userPrestigeLevel) continue;
      }
      const isKappaRequired = task.kappaRequired === true;
      const isLightkeeperRequired = task.lightkeeperRequired === true;
      const isNonSpecial = !isKappaRequired && !isLightkeeperRequired;
      if (hasTypeSelection) {
        const matchesTaskType =
          (isKappaRequired && showKappa) ||
          (isLightkeeperRequired && showLightkeeper) ||
          (isNonSpecial && showNonSpecial);
        if (!matchesTaskType) continue;
      }
      if (onlyTasksWithRequiredKeys && !taskHasRequiredKeys(task)) {
        continue;
      }
      if (isAllUsers) {
        const relevantTeamIds = visibleTeamIds.filter((teamId) => {
          const teamFaction = progressStore.playerFaction[teamId];
          const taskFaction = task.factionName;
          return taskFaction === 'Any' || taskFaction === teamFaction;
        });
        if (relevantTeamIds.length === 0) continue;
        counts.all++;
        const isFailedForAny = relevantTeamIds.some(
          (teamId) => progressStore.tasksFailed?.[task.id]?.[teamId] === true
        );
        const isAvailableForAny = relevantTeamIds.some((teamId) => {
          const isUnlocked = progressStore.unlockedTasks?.[task.id]?.[teamId] === true;
          const isCompleted = progressStore.tasksCompletions?.[task.id]?.[teamId] === true;
          const isFailed = progressStore.tasksFailed?.[task.id]?.[teamId] === true;
          return isUnlocked && !isCompleted && !isFailed;
        });
        const isCompletedByAll = relevantTeamIds.every((teamId) => {
          return (
            progressStore.tasksCompletions?.[task.id]?.[teamId] === true &&
            progressStore.tasksFailed?.[task.id]?.[teamId] !== true
          );
        });
        if (isFailedForAny) {
          counts.failed++;
        } else if (isCompletedByAll) {
          counts.completed++;
        } else if (isAvailableForAny && !isTaskInvalid(task.id, 'all', visibleTeamIds)) {
          counts.available++;
        } else if (!isTaskInvalid(task.id, 'all', visibleTeamIds)) {
          counts.locked++;
        }
      } else {
        const taskFaction = task.factionName;
        const userFaction = progressStore.playerFaction[userView];
        if (taskFaction !== 'Any' && taskFaction !== userFaction) continue;
        counts.all++;
        const isUnlocked = progressStore.unlockedTasks?.[task.id]?.[userView] === true;
        const isCompleted = progressStore.tasksCompletions?.[task.id]?.[userView] === true;
        const isFailed = progressStore.tasksFailed?.[task.id]?.[userView] === true;
        if (isFailed) {
          counts.failed++;
        } else if (isCompleted) {
          counts.completed++;
        } else if (isUnlocked && !isTaskInvalid(task.id, userView)) {
          counts.available++;
        } else if (!isTaskInvalid(task.id, userView)) {
          counts.locked++;
        }
      }
    }
    perfEnd(perfTimer, { total: counts.all });
    return counts;
  };
  const calculateTraderCounts = (
    userView: string,
    secondaryView: TaskSecondaryView = 'available'
  ): Record<string, number> => {
    const perfTimer = perfStart('[Tasks] calculateTraderCounts', {
      tasks: metadataStore.tasks.length,
      userView,
      secondaryView,
    });
    const counts: Record<string, number> = {};
    const taskList = metadataStore.tasks;
    const showKappa = !preferencesStore.getHideNonKappaTasks;
    const showLightkeeper = preferencesStore.getShowLightkeeperTasks;
    const showNonSpecial = preferencesStore.getShowNonSpecialTasks;
    const hasTypeSelection = showKappa || showLightkeeper || showNonSpecial;
    const onlyTasksWithRequiredKeys = shouldApplyRequiredKeysFilter();
    const userPrestigeLevel = tarkovStore.getPrestigeLevel();
    const prestigeTaskMap = metadataStore.prestigeTaskMap || new Map<string, number>();
    const userEdition = tarkovStore.getGameEdition();
    const excludedTaskIds = metadataStore.getExcludedTaskIdsForEdition(userEdition);
    const isAllUsers = isAllUsersView(userView);
    const visibleTeamIds = isAllUsers ? Object.keys(progressStore.visibleTeamStores || {}) : [];
    const isAvailableStatus = (status: {
      isUnlocked: boolean;
      isCompleted: boolean;
      isFailed: boolean;
    }) => status.isUnlocked && !status.isCompleted && !status.isFailed;
    for (const task of taskList) {
      if (excludedTaskIds.has(task.id)) continue;
      if (prestigeTaskMap.has(task.id)) {
        const taskPrestigeLevel = prestigeTaskMap.get(task.id);
        if (taskPrestigeLevel !== userPrestigeLevel) continue;
      }
      const isKappaRequired = task.kappaRequired === true;
      const isLightkeeperRequired = task.lightkeeperRequired === true;
      const isNonSpecial = !isKappaRequired && !isLightkeeperRequired;
      if (hasTypeSelection) {
        const matchesTaskType =
          (isKappaRequired && showKappa) ||
          (isLightkeeperRequired && showLightkeeper) ||
          (isNonSpecial && showNonSpecial);
        if (!matchesTaskType) continue;
      }
      if (onlyTasksWithRequiredKeys && !taskHasRequiredKeys(task)) {
        continue;
      }
      const traderId = task.trader?.id;
      if (!traderId) continue;
      if (!counts[traderId]) counts[traderId] = 0;
      const taskFaction = task.factionName;
      if (isAllUsers) {
        const relevantTeamIds = visibleTeamIds.filter((teamId) => {
          const teamFaction = progressStore.playerFaction[teamId];
          return taskFaction === 'Any' || taskFaction === teamFaction;
        });
        if (relevantTeamIds.length === 0) continue;
        const taskStatuses = relevantTeamIds.map((teamId) => ({
          isUnlocked: progressStore.unlockedTasks?.[task.id]?.[teamId] === true,
          isCompleted: progressStore.tasksCompletions?.[task.id]?.[teamId] === true,
          isFailed: progressStore.tasksFailed?.[task.id]?.[teamId] === true,
        }));
        let shouldCount = false;
        switch (secondaryView) {
          case 'all':
            shouldCount = true;
            break;
          case 'available':
            if (isTaskInvalid(task.id, 'all', visibleTeamIds)) continue;
            shouldCount = taskStatuses.some(isAvailableStatus);
            break;
          case 'locked':
            if (isTaskInvalid(task.id, 'all', visibleTeamIds)) continue;
            shouldCount =
              !taskStatuses.some(isAvailableStatus) &&
              !taskStatuses.every(({ isCompleted }) => isCompleted) &&
              !taskStatuses.some(({ isFailed }) => isFailed);
            break;
          case 'completed':
            shouldCount = taskStatuses.every(
              ({ isCompleted, isFailed }) => isCompleted && !isFailed
            );
            break;
          case 'failed':
            shouldCount = taskStatuses.some(({ isFailed }) => isFailed);
            break;
        }
        if (shouldCount) counts[traderId]++;
      } else {
        const userFaction = progressStore.playerFaction[userView];
        if (taskFaction !== 'Any' && taskFaction !== userFaction) continue;
        const isUnlocked = progressStore.unlockedTasks?.[task.id]?.[userView] === true;
        const isCompleted = progressStore.tasksCompletions?.[task.id]?.[userView] === true;
        const isFailed = progressStore.tasksFailed?.[task.id]?.[userView] === true;
        let shouldCount = false;
        switch (secondaryView) {
          case 'all':
            shouldCount = true;
            break;
          case 'available':
            if (isTaskInvalid(task.id, userView)) continue;
            shouldCount = isUnlocked && !isCompleted && !isFailed;
            break;
          case 'locked':
            if (isTaskInvalid(task.id, userView)) continue;
            shouldCount = !isCompleted && !isFailed && !isUnlocked;
            break;
          case 'completed':
            shouldCount = isCompleted && !isFailed;
            break;
          case 'failed':
            shouldCount = isFailed;
            break;
        }
        if (shouldCount) counts[traderId]++;
      }
    }
    perfEnd(perfTimer, { traders: Object.keys(counts).length });
    return counts;
  };
  return {
    calculateStatusCounts,
    calculateTraderCounts,
  };
}
