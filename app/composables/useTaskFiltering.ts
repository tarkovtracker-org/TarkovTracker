import { ref, shallowRef } from 'vue';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import type { Task, TaskObjective } from '@/types/tarkov';
import type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
import { EXCLUDED_SCAV_KARMA_TASKS, TRADER_ORDER } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { perfEnabled, perfEnd, perfNow, perfStart } from '@/utils/perf';
interface MergedMap {
  id: string;
  mergedIds?: string[];
}
const RAID_RELEVANT_OBJECTIVE_TYPES = [
  'shoot',
  'extract',
  'mark',
  'visit',
  'findItem',
  'findQuestItem',
  'giveQuestItem',
  'plantItem',
  'plantQuestItem',
  'useItem',
  'experience',
];
export function useTaskFiltering() {
  const progressStore = useProgressStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const roundMs = (value: number) => Math.round(value * 10) / 10;
  /**
   * Execute a function and return [result, elapsedMs].
   * When perf is disabled, elapsedMs is 0 to avoid overhead.
   */
  const timed = <T>(fn: () => T, perfOn: boolean): [T, number] => {
    if (!perfOn) {
      return [fn(), 0];
    }
    const t0 = perfNow();
    const result = fn();
    return [result, perfNow() - t0];
  };
  const reloadingTasks = ref(false);
  const visibleTasks = shallowRef<Task[]>([]);
  // Cached trader order map to avoid rebuilding on every sort
  let cachedTraderOrderMap: Map<string, number> | null = null;
  let cachedTradersRef: typeof metadataStore.traders | null = null;
  const mapObjectiveTypes = [
    'mark',
    'zone',
    'extract',
    'visit',
    'findItem',
    'findQuestItem',
    'plantItem',
    'plantQuestItem',
    'shoot',
  ];
  const isRaidRelevantObjective = (obj: TaskObjective): boolean => {
    if (RAID_RELEVANT_OBJECTIVE_TYPES.includes(obj.type || '')) return true;
    if (obj.type === 'giveItem' && obj.foundInRaid) return true;
    return false;
  };
  const isGlobalTask = (task: Task): boolean => {
    const hasMap = task.map?.id != null;
    const hasLocations = Array.isArray(task.locations) && task.locations.length > 0;
    const hasMapObjectives = task.objectives?.some(
      (obj) =>
        Array.isArray(obj.maps) && obj.maps.length > 0 && mapObjectiveTypes.includes(obj.type || '')
    );
    const isMapless = !hasMap && !hasLocations && !hasMapObjectives;
    const hasRaidRelevantObjectives = task.objectives?.some(isRaidRelevantObjective) ?? false;
    return isMapless && hasRaidRelevantObjectives;
  };
  const filterTasksByView = (
    taskList: Task[],
    primaryView: string,
    mapView: string,
    traderView: string,
    mergedMaps: MergedMap[]
  ) => {
    if (primaryView === 'maps') {
      return filterTasksByMap(taskList, mapView, mergedMaps);
    } else if (primaryView === 'traders') {
      return taskList.filter((task) => task.trader?.id === traderView);
    }
    return taskList;
  };
  const filterTasksByMap = (taskList: Task[], mapView: string, mergedMaps: MergedMap[]) => {
    const showGlobalTasks = !preferencesStore.getHideGlobalTasks;
    let mapSpecificTasks: Task[];
    const mergedMap = mergedMaps.find((m) => m.mergedIds && m.mergedIds.includes(mapView));
    if (mergedMap && mergedMap.mergedIds) {
      const ids = mergedMap.mergedIds;
      mapSpecificTasks = taskList.filter((task) => {
        const taskLocations = Array.isArray(task.locations) ? task.locations : [];
        let hasMap = ids.some((id: string) => taskLocations.includes(id));
        if (!hasMap && Array.isArray(task.objectives)) {
          hasMap = task.objectives.some(
            (obj) =>
              Array.isArray(obj.maps) &&
              obj.maps.some((map) => ids.includes(map.id)) &&
              mapObjectiveTypes.includes(obj.type || '')
          );
        }
        return hasMap;
      });
    } else {
      mapSpecificTasks = taskList.filter((task) =>
        task.objectives?.some(
          (obj) =>
            obj.maps?.some((map) => map.id === mapView) &&
            mapObjectiveTypes.includes(obj.type || '')
        )
      );
    }
    if (showGlobalTasks) {
      const globalTasks = taskList.filter(isGlobalTask);
      return [...mapSpecificTasks, ...globalTasks];
    }
    return mapSpecificTasks;
  };
  /**
   * Check if a task is invalid (permanently blocked) for a user
   */
  const isTaskInvalid = (taskId: string, userView: string): boolean => {
    if (userView === 'all') {
      // For "all" view, check if invalid for ALL team members
      const teamIds = Object.keys(progressStore.visibleTeamStores || {});
      return teamIds.every((teamId) => progressStore.invalidTasks?.[taskId]?.[teamId] === true);
    }
    return progressStore.invalidTasks?.[taskId]?.[userView] === true;
  };
  /**
   * Filter tasks by status (available, locked, completed) and user view
   */
  const filterTasksByStatus = (taskList: Task[], secondaryView: string, userView: string) => {
    if (userView === 'all') {
      return filterTasksForAllUsers(taskList, secondaryView);
    } else {
      return filterTasksForUser(taskList, secondaryView, userView);
    }
  };
  /**
   * Helper to get relevant team members for a task based on faction
   */
  const getRelevantTeamIds = (task: Task, teamIds: string[]): string[] => {
    return teamIds.filter((teamId) => {
      const userFaction = progressStore.playerFaction[teamId];
      const taskFaction = task.factionName;
      return taskFaction === 'Any' || taskFaction === userFaction;
    });
  };
  /**
   * Helper to get task status for a team member
   */
  const getTaskStatus = (taskId: string, teamId: string) => {
    const isUnlocked = progressStore.unlockedTasks?.[taskId]?.[teamId] === true;
    const isCompleted = progressStore.tasksCompletions?.[taskId]?.[teamId] === true;
    const isFailed = progressStore.tasksFailed?.[taskId]?.[teamId] === true;
    return { isUnlocked, isCompleted, isFailed };
  };
  /**
   * Filter tasks for all team members view
   */
  const filterTasksForAllUsers = (taskList: Task[], secondaryView: string) => {
    const tempVisibleTasks = [];
    const teamIds = Object.keys(progressStore.visibleTeamStores || {});
    logger.debug('[TaskFiltering] Filtering for all users. Visible team IDs:', teamIds);
    for (const task of taskList) {
      const relevantTeamIds = getRelevantTeamIds(task, teamIds);
      if (relevantTeamIds.length === 0) continue;
      const taskStatuses = relevantTeamIds.map((teamId) => ({
        teamId,
        ...getTaskStatus(task.id, teamId),
      }));
      if (secondaryView === 'all') {
        // Show all tasks regardless of status
        const usersWhoNeedTask = taskStatuses
          .filter(
            ({ isUnlocked, isCompleted, isFailed }) => isUnlocked && !isCompleted && !isFailed
          )
          .map(({ teamId }) => progressStore.getDisplayName(teamId));
        tempVisibleTasks.push({ ...task, neededBy: usersWhoNeedTask });
      } else if (secondaryView === 'available') {
        // Exclude permanently invalid/blocked tasks from available view
        if (isTaskInvalid(task.id, 'all')) continue;
        const usersWhoNeedTask = taskStatuses
          .filter(
            ({ isUnlocked, isCompleted, isFailed }) => isUnlocked && !isCompleted && !isFailed
          )
          .map(({ teamId }) => progressStore.getDisplayName(teamId));
        if (usersWhoNeedTask.length > 0) {
          if (usersWhoNeedTask.length > 1) {
            logger.debug(
              `[TaskFiltering] Task "${task.name}" needed by multiple users:`,
              usersWhoNeedTask
            );
          }
          tempVisibleTasks.push({ ...task, neededBy: usersWhoNeedTask });
        }
      } else if (secondaryView === 'failed') {
        const hasFailed = taskStatuses.some(({ isFailed }) => isFailed);
        if (hasFailed) {
          tempVisibleTasks.push({ ...task, neededBy: [] });
        }
      } else if (secondaryView === 'locked') {
        // Exclude permanently invalid/blocked tasks from locked view
        if (isTaskInvalid(task.id, 'all')) continue;
        const isAvailableForAny = taskStatuses.some(
          ({ isUnlocked, isCompleted, isFailed }) => isUnlocked && !isCompleted && !isFailed
        );
        const isCompletedByAll = taskStatuses.every(({ isCompleted }) => isCompleted);
        const isFailedForAny = taskStatuses.some(({ isFailed }) => isFailed);
        if (!isAvailableForAny && !isCompletedByAll && !isFailedForAny) {
          tempVisibleTasks.push({ ...task, neededBy: [] });
        }
      } else if (secondaryView === 'completed') {
        const isCompletedByAll = taskStatuses.every(
          ({ isCompleted, isFailed }) => isCompleted && !isFailed
        );
        if (isCompletedByAll) {
          tempVisibleTasks.push({ ...task, neededBy: [] });
        }
      }
    }
    return tempVisibleTasks;
  };
  /**
   * Filter tasks for specific user
   */
  const filterTasksForUser = (taskList: Task[], secondaryView: string, userView: string) => {
    logger.debug('[TaskFiltering] Filtering for specific user:', {
      userView,
      secondaryView,
      totalTasks: taskList.length,
    });
    let filtered = taskList;
    // 'all' shows all tasks regardless of status
    if (secondaryView === 'available') {
      filtered = filtered.filter((task) => {
        // Exclude permanently invalid/blocked tasks from available view
        if (isTaskInvalid(task.id, userView)) return false;
        const isUnlocked = progressStore.unlockedTasks?.[task.id]?.[userView] === true;
        const isCompleted = progressStore.tasksCompletions?.[task.id]?.[userView] === true;
        const isFailed = progressStore.tasksFailed?.[task.id]?.[userView] === true;
        return isUnlocked && !isCompleted && !isFailed;
      });
    } else if (secondaryView === 'failed') {
      filtered = filtered.filter(
        (task) => progressStore.tasksFailed?.[task.id]?.[userView] === true
      );
    } else if (secondaryView === 'locked') {
      filtered = filtered.filter((task) => {
        // Exclude permanently invalid/blocked tasks from locked view
        if (isTaskInvalid(task.id, userView)) return false;
        const taskCompletions = progressStore.tasksCompletions?.[task.id];
        const unlockedTasks = progressStore.unlockedTasks?.[task.id];
        const failedTasks = progressStore.tasksFailed?.[task.id];
        return (
          taskCompletions?.[userView] !== true &&
          failedTasks?.[userView] !== true &&
          unlockedTasks?.[userView] !== true
        );
      });
    } else if (secondaryView === 'completed') {
      filtered = filtered.filter(
        (task) =>
          progressStore.tasksCompletions?.[task.id]?.[userView] === true &&
          progressStore.tasksFailed?.[task.id]?.[userView] !== true
      );
    }
    // 'all' case: no status filtering, just filter by faction below
    // Filter by faction
    const withFaction = filtered.filter(
      (task) =>
        task.factionName === 'Any' || task.factionName === progressStore.playerFaction[userView]
    );
    logger.debug('[TaskFiltering] Filtered results:', {
      userView,
      beforeFaction: filtered.length,
      afterFaction: withFaction.length,
      faction: progressStore.playerFaction[userView],
    });
    return withFaction;
  };
  /**
   * Filter tasks by type settings (Kappa, Lightkeeper, non-special)
   * Uses OR logic: show task if it matches ANY enabled category
   * Also filters out tasks not available for the user's game edition
   */
  const filterTasksByTypeSettings = (taskList: Task[]): Task[] => {
    const showKappa = !preferencesStore.getHideNonKappaTasks; // Show Kappa Required tasks
    const showLightkeeper = preferencesStore.getShowLightkeeperTasks;
    const showNonSpecial = preferencesStore.getShowNonSpecialTasks;
    const lightkeeperTraderId = metadataStore.getTraderByName('lightkeeper')?.id;
    // Get prestige filtering data
    const userPrestigeLevel = tarkovStore.getPrestigeLevel();
    const prestigeTaskMap = metadataStore.prestigeTaskMap;
    const prestigeTaskIds = metadataStore.prestigeTaskIds;
    // Get edition-based excluded tasks
    const userEdition = tarkovStore.getGameEdition();
    const excludedTaskIds = metadataStore.getExcludedTaskIdsForEdition(userEdition);
    return taskList.filter((task) => {
      // Skip excluded tasks (Scav Karma)
      if (EXCLUDED_SCAV_KARMA_TASKS.includes(task.id)) return false;
      // Filter out tasks not available for user's game edition
      if (excludedTaskIds.has(task.id)) return false;
      // Filter prestige-gated tasks ("New Beginning")
      // Only show the task that matches the user's current prestige level
      if (prestigeTaskIds.includes(task.id)) {
        const taskPrestigeLevel = prestigeTaskMap.get(task.id);
        if (taskPrestigeLevel !== userPrestigeLevel) {
          return false;
        }
      }
      const isKappaRequired = task.kappaRequired === true;
      const isLightkeeperRequired = task.lightkeeperRequired === true;
      const isLightkeeperTraderTask =
        lightkeeperTraderId !== undefined
          ? task.trader?.id === lightkeeperTraderId
          : task.trader?.name?.toLowerCase() === 'lightkeeper';
      const isNonSpecial = !isKappaRequired && !isLightkeeperRequired && !isLightkeeperTraderTask;
      // OR logic: show if task matches ANY enabled filter
      // A task can be both Kappa and Lightkeeper required - show if either filter is on
      if (isKappaRequired && showKappa) return true;
      if ((isLightkeeperRequired || isLightkeeperTraderTask) && showLightkeeper) return true;
      if (isNonSpecial && showNonSpecial) return true;
      // Task doesn't match any enabled filter
      return false;
    });
  };
  /**
   * Helper to extract all map locations from a task
   */
  const extractTaskLocations = (task: Task): string[] => {
    const locations = Array.isArray(task.locations) ? [...task.locations] : [];
    if (Array.isArray(task.objectives)) {
      for (const obj of task.objectives) {
        if (Array.isArray(obj.maps)) {
          for (const objMap of obj.maps) {
            if (objMap?.id && !locations.includes(objMap.id)) {
              locations.push(objMap.id);
            }
          }
        }
      }
    }
    return locations;
  };
  /**
   * Helper to check if user has unlocked task
   */
  const isTaskUnlockedForUser = (taskId: string, activeUserView: string): boolean => {
    if (activeUserView === 'all') {
      return Object.values(progressStore.unlockedTasks[taskId] || {}).some(Boolean);
    }
    return progressStore.unlockedTasks[taskId]?.[activeUserView] === true;
  };
  /**
   * Helper to check if any objectives remain incomplete
   */
  const hasIncompleteObjectives = (
    task: Task,
    mapIds: string[],
    activeUserView: string
  ): boolean => {
    return (
      task.objectives?.some((objective) => {
        if (!Array.isArray(objective.maps)) return false;
        if (!objective.maps.some((m) => mapIds.includes(m.id))) return false;
        const completions = progressStore.objectiveCompletions[objective.id] || {};
        return activeUserView === 'all'
          ? !Object.values(completions).every(Boolean)
          : completions[activeUserView] !== true;
      }) ?? false
    );
  };
  const calculateMapTaskTotals = (
    mergedMaps: MergedMap[],
    tasks: Task[],
    hideGlobalTasks: boolean,
    activeUserView: string,
    secondaryView: string
  ) => {
    const perfTimer = perfStart('[Tasks] calculateMapTaskTotals', {
      tasks: tasks.length,
      maps: mergedMaps.length,
      secondaryView,
      userView: activeUserView,
    });
    const mapTaskCounts: Record<string, number> = {};
    const typedTasks = filterTasksByTypeSettings(tasks);
    const statusFilteredTasks = filterTasksByStatus(typedTasks, secondaryView, activeUserView);
    let globalTaskCount = 0;
    if (!hideGlobalTasks) {
      for (const task of statusFilteredTasks) {
        if (!isGlobalTask(task)) continue;
        if (secondaryView === 'available') {
          if (!isTaskUnlockedForUser(task.id, activeUserView)) continue;
        }
        globalTaskCount++;
      }
    }
    for (const map of mergedMaps) {
      const ids = map.mergedIds || [map.id];
      const mapId = map.id;
      if (!mapId) continue;
      mapTaskCounts[mapId] = globalTaskCount;
      for (const task of statusFilteredTasks) {
        const taskLocations = extractTaskLocations(task);
        if (!ids.some((id: string) => taskLocations.includes(id))) continue;
        if (secondaryView === 'available') {
          if (!isTaskUnlockedForUser(task.id, activeUserView)) continue;
          if (!hasIncompleteObjectives(task, ids, activeUserView)) continue;
        }
        mapTaskCounts[mapId]!++;
      }
    }
    perfEnd(perfTimer, { mapsWithCounts: Object.keys(mapTaskCounts).length });
    return mapTaskCounts;
  };
  /**
   * Build impact scores for tasks (number of incomplete successor tasks)
   */
  const buildImpactScores = (taskList: Task[], userView: string): Map<string, number> => {
    const impactScores = new Map<string, number>();
    if (!taskList.length) return impactScores;
    const teamIds =
      userView === 'all' ? Object.keys(progressStore.visibleTeamStores || {}) : [userView];
    if (!teamIds.length) {
      taskList.forEach((task) => impactScores.set(task.id, 0));
      return impactScores;
    }
    const completions = progressStore.tasksCompletions;
    const failures = progressStore.tasksFailed;
    taskList.forEach((task) => {
      const successors = task.successors ?? [];
      if (!successors.length) {
        impactScores.set(task.id, 0);
        return;
      }
      let impact = 0;
      successors.forEach((successorId) => {
        // Count successor as incomplete if it is not completed OR is failed (matches UI tooltip)
        const isIncomplete = teamIds.some(
          (teamId) =>
            completions?.[successorId]?.[teamId] !== true ||
            failures?.[successorId]?.[teamId] === true
        );
        if (isIncomplete) {
          impact += 1;
        }
      });
      impactScores.set(task.id, impact);
    });
    return impactScores;
  };
  const buildTraderOrderMap = (): Map<string, number> => {
    const orderMap = new Map<string, number>();
    const traders = metadataStore.traders || [];
    traders.forEach((trader) => {
      const normalized = trader.normalizedName?.toLowerCase() ?? trader.name.toLowerCase();
      const index = TRADER_ORDER.indexOf(normalized as (typeof TRADER_ORDER)[number]);
      orderMap.set(trader.id, index === -1 ? TRADER_ORDER.length : index);
    });
    return orderMap;
  };
  /**
   * Get cached trader order map, rebuilding only when traders change
   */
  const getTraderOrderMap = (): Map<string, number> => {
    const traders = metadataStore.traders;
    // Use reference equality to detect changes in traders array
    if (cachedTraderOrderMap && cachedTradersRef === traders) {
      return cachedTraderOrderMap;
    }
    cachedTraderOrderMap = buildTraderOrderMap();
    cachedTradersRef = traders;
    return cachedTraderOrderMap;
  };
  /**
   * Reset the trader order map cache (call when traders are reloaded)
   */
  const resetTraderOrderMapCache = () => {
    cachedTraderOrderMap = null;
    cachedTradersRef = null;
  };
  const buildTeammateAvailableCounts = (taskList: Task[]): Map<string, number> => {
    const teamIds = Object.keys(progressStore.visibleTeamStores || {});
    const counts = new Map<string, number>();
    if (!teamIds.length) {
      taskList.forEach((task) => counts.set(task.id, 0));
      return counts;
    }
    taskList.forEach((task) => {
      const availableCount = teamIds.filter((teamId) => {
        const isUnlocked = progressStore.unlockedTasks?.[task.id]?.[teamId] === true;
        const isCompleted = progressStore.tasksCompletions?.[task.id]?.[teamId] === true;
        const isFailed = progressStore.tasksFailed?.[task.id]?.[teamId] === true;
        return isUnlocked && !isCompleted && !isFailed;
      }).length;
      counts.set(task.id, availableCount);
    });
    return counts;
  };
  const sortTasksByImpact = (
    taskList: Task[],
    userView: string,
    sortDirection: TaskSortDirection
  ): Task[] => {
    const directionFactor = sortDirection === 'desc' ? -1 : 1;
    const impactScores = buildImpactScores(taskList, userView);
    return [...taskList].sort((a, b) => {
      const impactA = impactScores.get(a.id) ?? 0;
      const impactB = impactScores.get(b.id) ?? 0;
      if (impactA !== impactB) return (impactA - impactB) * directionFactor;
      const nameA = a.name?.toLowerCase() ?? '';
      const nameB = b.name?.toLowerCase() ?? '';
      return nameA.localeCompare(nameB) * directionFactor;
    });
  };
  const sortTasksByName = (taskList: Task[], sortDirection: TaskSortDirection): Task[] => {
    const directionFactor = sortDirection === 'desc' ? -1 : 1;
    return [...taskList].sort((a, b) => {
      const nameA = a.name?.toLowerCase() ?? '';
      const nameB = b.name?.toLowerCase() ?? '';
      if (nameA !== nameB) return nameA.localeCompare(nameB) * directionFactor;
      return a.id.localeCompare(b.id) * directionFactor;
    });
  };
  const sortTasksByLevel = (taskList: Task[], sortDirection: TaskSortDirection): Task[] => {
    const directionFactor = sortDirection === 'desc' ? -1 : 1;
    return [...taskList].sort((a, b) => {
      const levelA = a.minPlayerLevel ?? 0;
      const levelB = b.minPlayerLevel ?? 0;
      if (levelA !== levelB) return (levelA - levelB) * directionFactor;
      const nameA = a.name?.toLowerCase() ?? '';
      const nameB = b.name?.toLowerCase() ?? '';
      return nameA.localeCompare(nameB) * directionFactor;
    });
  };
  const sortTasksByTrader = (taskList: Task[], sortDirection: TaskSortDirection): Task[] => {
    const directionFactor = sortDirection === 'desc' ? -1 : 1;
    const orderMap = getTraderOrderMap();
    return [...taskList].sort((a, b) => {
      const traderA = a.trader?.id
        ? (orderMap.get(a.trader.id) ?? TRADER_ORDER.length)
        : TRADER_ORDER.length;
      const traderB = b.trader?.id
        ? (orderMap.get(b.trader.id) ?? TRADER_ORDER.length)
        : TRADER_ORDER.length;
      if (traderA !== traderB) return (traderA - traderB) * directionFactor;
      const levelA = a.minPlayerLevel ?? 0;
      const levelB = b.minPlayerLevel ?? 0;
      if (levelA !== levelB) return (levelA - levelB) * directionFactor;
      const nameA = a.name?.toLowerCase() ?? '';
      const nameB = b.name?.toLowerCase() ?? '';
      return nameA.localeCompare(nameB) * directionFactor;
    });
  };
  const sortTasksByTeammatesAvailable = (
    taskList: Task[],
    sortDirection: TaskSortDirection
  ): Task[] => {
    const directionFactor = sortDirection === 'desc' ? -1 : 1;
    const counts = buildTeammateAvailableCounts(taskList);
    return [...taskList].sort((a, b) => {
      const countA = counts.get(a.id) ?? 0;
      const countB = counts.get(b.id) ?? 0;
      if (countA !== countB) return (countA - countB) * directionFactor;
      const nameA = a.name?.toLowerCase() ?? '';
      const nameB = b.name?.toLowerCase() ?? '';
      return nameA.localeCompare(nameB) * directionFactor;
    });
  };
  const sortTasksByXp = (taskList: Task[], sortDirection: TaskSortDirection): Task[] => {
    const directionFactor = sortDirection === 'desc' ? -1 : 1;
    return [...taskList].sort((a, b) => {
      const xpA = a.experience ?? 0;
      const xpB = b.experience ?? 0;
      if (xpA !== xpB) return (xpA - xpB) * directionFactor;
      const nameA = a.name?.toLowerCase() ?? '';
      const nameB = b.name?.toLowerCase() ?? '';
      return nameA.localeCompare(nameB) * directionFactor;
    });
  };
  const sortTasks = (
    taskList: Task[],
    userView: string,
    sortMode: TaskSortMode,
    sortDirection: TaskSortDirection
  ): Task[] => {
    switch (sortMode) {
      case 'alphabetical':
        return sortTasksByName(taskList, sortDirection);
      case 'level':
        return sortTasksByLevel(taskList, sortDirection);
      case 'impact':
        return sortTasksByImpact(taskList, userView, sortDirection);
      case 'trader':
        return sortTasksByTrader(taskList, sortDirection);
      case 'teammates':
        return sortTasksByTeammatesAvailable(taskList, sortDirection);
      case 'xp':
        return sortTasksByXp(taskList, sortDirection);
      case 'none':
      default:
        return sortDirection === 'desc' ? [...taskList].reverse() : [...taskList];
    }
  };
  /**
   * Main function to update visible tasks based on all filters
   */
  const updateVisibleTasks = async (
    activePrimaryView: string,
    activeSecondaryView: string,
    activeUserView: string,
    activeMapView: string,
    activeTraderView: string,
    mergedMaps: MergedMap[],
    tasksLoading: boolean,
    sortMode: TaskSortMode = 'none',
    sortDirection: TaskSortDirection = 'asc'
  ) => {
    const perfTimer = perfStart('[Tasks] updateVisibleTasks', {
      primaryView: activePrimaryView,
      secondaryView: activeSecondaryView,
      userView: activeUserView,
      mapView: activeMapView,
      traderView: activeTraderView,
      sortMode,
      sortDirection,
    });
    const perfOn = perfEnabled();
    const startOverall = perfOn ? perfNow() : 0;
    // Simple guard clauses - data should be available due to global initialization
    if (tasksLoading || !metadataStore.tasks.length) {
      perfEnd(perfTimer, {
        skipped: true,
        tasksLoading,
        tasks: metadataStore.tasks.length,
      });
      return;
    }
    reloadingTasks.value = true;
    try {
      let visibleTaskList = metadataStore.tasks;
      const tasksIn = visibleTaskList.length;
      // Apply task type filters (Kappa, Lightkeeper, Non-special)
      const [afterType, filterTypeMs] = timed(
        () => filterTasksByTypeSettings(visibleTaskList),
        perfOn
      );
      visibleTaskList = afterType;
      // Apply primary view filter
      const [afterView, filterViewMs] = timed(
        () =>
          filterTasksByView(
            visibleTaskList,
            activePrimaryView,
            activeMapView,
            activeTraderView,
            mergedMaps
          ),
        perfOn
      );
      visibleTaskList = afterView;
      // Apply status and user filters
      const [afterStatus, filterStatusMs] = timed(
        () => filterTasksByStatus(visibleTaskList, activeSecondaryView, activeUserView),
        perfOn
      );
      visibleTaskList = afterStatus;
      // Filter to tasks available to all visible teammates (team view only)
      let sharedFilterMs = 0;
      if (
        preferencesStore.getTaskSharedByAllOnly &&
        activeUserView === 'all' &&
        activeSecondaryView === 'available'
      ) {
        const teamIds = Object.keys(progressStore.visibleTeamStores || {});
        const [afterShared, ms] = timed(
          () =>
            visibleTaskList.filter((task) => {
              const relevantTeamIds = getRelevantTeamIds(task, teamIds);
              if (relevantTeamIds.length === 0) return false;
              return relevantTeamIds.every((teamId) => {
                const status = getTaskStatus(task.id, teamId);
                return status.isUnlocked && !status.isCompleted && !status.isFailed;
              });
            }),
          perfOn
        );
        visibleTaskList = afterShared;
        sharedFilterMs = ms;
      }
      // Apply sorting
      const [sorted, sortMs] = timed(
        () => sortTasks(visibleTaskList, activeUserView, sortMode, sortDirection),
        perfOn
      );
      visibleTasks.value = sorted;
      perfEnd(perfTimer, {
        tasksIn,
        tasksOut: sorted.length,
        totalMs: perfOn ? roundMs(perfNow() - startOverall) : undefined,
        filterTypeMs: perfOn ? roundMs(filterTypeMs) : undefined,
        filterViewMs: perfOn ? roundMs(filterViewMs) : undefined,
        filterStatusMs: perfOn ? roundMs(filterStatusMs) : undefined,
        sharedFilterMs: perfOn ? roundMs(sharedFilterMs) : undefined,
        sortMs: perfOn ? roundMs(sortMs) : undefined,
      });
    } finally {
      reloadingTasks.value = false;
    }
  };
  /**
   * Calculate task counts by status (all, available, locked, completed)
   */
  const calculateStatusCounts = (
    userView: string
  ): { all: number; available: number; locked: number; completed: number; failed: number } => {
    const perfTimer = perfStart('[Tasks] calculateStatusCounts', {
      tasks: metadataStore.tasks.length,
      userView,
    });
    const counts = { all: 0, available: 0, locked: 0, completed: 0, failed: 0 };
    const taskList = metadataStore.tasks;
    // Get prestige filtering data
    const userPrestigeLevel = tarkovStore.getPrestigeLevel();
    const prestigeTaskMap = metadataStore.prestigeTaskMap;
    const prestigeTaskIds = metadataStore.prestigeTaskIds;
    // Get edition-based excluded tasks
    const userEdition = tarkovStore.getGameEdition();
    const excludedTaskIds = metadataStore.getExcludedTaskIdsForEdition(userEdition);
    for (const task of taskList) {
      // Skip excluded tasks
      if (EXCLUDED_SCAV_KARMA_TASKS.includes(task.id)) continue;
      // Skip tasks not available for user's game edition
      if (excludedTaskIds.has(task.id)) continue;
      // Skip prestige tasks that don't match user's prestige level
      if (prestigeTaskIds.includes(task.id)) {
        const taskPrestigeLevel = prestigeTaskMap.get(task.id);
        if (taskPrestigeLevel !== userPrestigeLevel) continue;
      }
      if (userView === 'all') {
        // For "all" view
        const teamIds = Object.keys(progressStore.visibleTeamStores || {});
        const relevantTeamIds = teamIds.filter((teamId) => {
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
        } else if (isAvailableForAny && !isTaskInvalid(task.id, 'all')) {
          // Only count as available if not permanently invalid/blocked
          counts.available++;
        } else if (!isTaskInvalid(task.id, 'all')) {
          // Only count as locked if not permanently invalid/blocked
          counts.locked++;
        }
      } else {
        // For single user view
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
          // Only count as available if not permanently invalid/blocked
          counts.available++;
        } else if (!isTaskInvalid(task.id, userView)) {
          // Only count as locked if not permanently invalid/blocked
          counts.locked++;
        }
      }
    }
    perfEnd(perfTimer, { total: counts.all });
    return counts;
  };
  /**
   * Calculate task counts per trader based on current status filter
   */
  const calculateTraderCounts = (userView: string, secondaryView: string = 'available') => {
    const perfTimer = perfStart('[Tasks] calculateTraderCounts', {
      tasks: metadataStore.tasks.length,
      userView,
      secondaryView,
    });
    const counts: Record<string, number> = {};
    const taskList = metadataStore.tasks;
    // Get prestige filtering data
    const userPrestigeLevel = tarkovStore.getPrestigeLevel();
    const prestigeTaskMap = metadataStore.prestigeTaskMap;
    const prestigeTaskIds = metadataStore.prestigeTaskIds;
    // Get edition-based excluded tasks
    const userEdition = tarkovStore.getGameEdition();
    const excludedTaskIds = metadataStore.getExcludedTaskIdsForEdition(userEdition);
    for (const task of taskList) {
      // Skip excluded tasks
      if (EXCLUDED_SCAV_KARMA_TASKS.includes(task.id)) continue;
      // Skip tasks not available for user's game edition
      if (excludedTaskIds.has(task.id)) continue;
      // Skip prestige tasks that don't match user's prestige level
      if (prestigeTaskIds.includes(task.id)) {
        const taskPrestigeLevel = prestigeTaskMap.get(task.id);
        if (taskPrestigeLevel !== userPrestigeLevel) continue;
      }
      const traderId = task.trader?.id;
      if (!traderId) continue;
      // Initialize count for this trader
      if (!counts[traderId]) counts[traderId] = 0;
      // Filter by faction
      const taskFaction = task.factionName;
      if (userView === 'all') {
        // For "all" view, check task status across team members
        const teamIds = Object.keys(progressStore.visibleTeamStores || {});
        const relevantTeamIds = teamIds.filter((teamId) => {
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
        if (secondaryView === 'all') {
          shouldCount = true;
        } else if (secondaryView === 'available') {
          shouldCount = taskStatuses.some(
            ({ isUnlocked, isCompleted, isFailed }) => isUnlocked && !isCompleted && !isFailed
          );
        } else if (secondaryView === 'locked') {
          // Exclude permanently invalid/blocked tasks from locked count
          if (isTaskInvalid(task.id, 'all')) continue;
          const isAvailableForAny = taskStatuses.some(
            ({ isUnlocked, isCompleted, isFailed }) => isUnlocked && !isCompleted && !isFailed
          );
          const isCompletedByAll = taskStatuses.every(({ isCompleted }) => isCompleted);
          const isFailedForAny = taskStatuses.some(({ isFailed }) => isFailed);
          shouldCount = !isAvailableForAny && !isCompletedByAll && !isFailedForAny;
        } else if (secondaryView === 'completed') {
          shouldCount = taskStatuses.every(({ isCompleted, isFailed }) => isCompleted && !isFailed);
        } else if (secondaryView === 'failed') {
          shouldCount = taskStatuses.some(({ isFailed }) => isFailed);
        }
        if (shouldCount) counts[traderId]++;
      } else {
        // For single user view
        const userFaction = progressStore.playerFaction[userView];
        const factionMatch = taskFaction === 'Any' || taskFaction === userFaction;
        if (!factionMatch) continue;
        const isUnlocked = progressStore.unlockedTasks?.[task.id]?.[userView] === true;
        const isCompleted = progressStore.tasksCompletions?.[task.id]?.[userView] === true;
        const isFailed = progressStore.tasksFailed?.[task.id]?.[userView] === true;
        let shouldCount = false;
        if (secondaryView === 'all') {
          shouldCount = true;
        } else if (secondaryView === 'available') {
          shouldCount = isUnlocked && !isCompleted && !isFailed;
        } else if (secondaryView === 'locked') {
          // Exclude permanently invalid/blocked tasks from locked count
          if (isTaskInvalid(task.id, userView)) continue;
          shouldCount = !isCompleted && !isFailed && !isUnlocked;
        } else if (secondaryView === 'completed') {
          shouldCount = isCompleted && !isFailed;
        } else if (secondaryView === 'failed') {
          shouldCount = isFailed;
        }
        if (shouldCount) counts[traderId]++;
      }
    }
    perfEnd(perfTimer, { traders: Object.keys(counts).length });
    return counts;
  };
  return {
    visibleTasks,
    reloadingTasks,
    filterTasksByView,
    filterTasksByStatus,
    filterTasksByMap,
    filterTasksForAllUsers,
    filterTasksForUser,
    calculateMapTaskTotals,
    calculateStatusCounts,
    calculateTraderCounts,
    updateVisibleTasks,
    resetTraderOrderMapCache,
    mapObjectiveTypes,
    RAID_RELEVANT_OBJECTIVE_TYPES,
    isRaidRelevantObjective,
    isGlobalTask,
  };
}
