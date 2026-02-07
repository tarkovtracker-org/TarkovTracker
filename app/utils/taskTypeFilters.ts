import type { Task } from '@/types/tarkov';
export interface TaskTypeFilterOptions {
  showKappa: boolean;
  showLightkeeper: boolean;
  showNonSpecial: boolean;
  userPrestigeLevel: number;
  prestigeTaskMap: Map<string, number>;
  excludedTaskIds: Set<string>;
}
export function filterTasksByTypeSettings(
  taskList: Task[],
  options: TaskTypeFilterOptions
): Task[] {
  const {
    showKappa,
    showLightkeeper,
    showNonSpecial,
    userPrestigeLevel,
    prestigeTaskMap,
    excludedTaskIds,
  } = options;
  const hasTypeSelection = showKappa || showLightkeeper || showNonSpecial;
  return taskList.filter((task) => {
    if (excludedTaskIds.has(task.id)) return false;
    if (prestigeTaskMap.has(task.id)) {
      const taskPrestigeLevel = prestigeTaskMap.get(task.id)!;
      if (taskPrestigeLevel !== userPrestigeLevel) return false;
    }
    if (!hasTypeSelection) return true;
    const isKappaRequired = task.kappaRequired === true;
    const isLightkeeperRequired = task.lightkeeperRequired === true;
    const isNonSpecial = !isKappaRequired && !isLightkeeperRequired;
    if (isKappaRequired && showKappa) return true;
    if (isLightkeeperRequired && showLightkeeper) return true;
    if (isNonSpecial && showNonSpecial) return true;
    return false;
  });
}
export function buildTaskTypeFilterOptions(
  preferencesStore: {
    getHideNonKappaTasks: boolean;
    getShowLightkeeperTasks: boolean;
    getShowNonSpecialTasks: boolean;
  },
  tarkovStore: {
    getPrestigeLevel: () => number;
    getGameEdition: () => number | undefined;
  },
  metadataStore: {
    prestigeTaskMap: Map<string, number>;
    getExcludedTaskIdsForEdition: (edition: number | undefined) => Set<string>;
  }
): TaskTypeFilterOptions {
  return {
    showKappa: !preferencesStore.getHideNonKappaTasks,
    showLightkeeper: preferencesStore.getShowLightkeeperTasks,
    showNonSpecial: preferencesStore.getShowNonSpecialTasks,
    userPrestigeLevel: tarkovStore.getPrestigeLevel(),
    prestigeTaskMap: metadataStore.prestigeTaskMap,
    excludedTaskIds: metadataStore.getExcludedTaskIdsForEdition(tarkovStore.getGameEdition()),
  };
}
