import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { isAllUsersView } from '@/types/taskFilter';
import { TRADER_ORDER } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { perfEnabled, perfEnd, perfNow, perfStart } from '@/utils/perf';
import { buildTaskImpactScores, resolveImpactTeamIds } from '@/utils/taskImpact';
import {
  buildTaskTypeFilterOptions,
  filterTasksByTypeSettings as filterTasksByTypeSettingsUtil,
} from '@/utils/taskTypeFilters';
import type { Task, TaskObjective } from '@/types/tarkov';
import type {
  MergedMap,
  TaskFilterAndSortOptions,
  TaskPrimaryView,
  TaskSecondaryView,
} from '@/types/taskFilter';
import type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
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
    primaryView: TaskPrimaryView,
    mapView: string,
    traderView: string,
    mergedMaps: MergedMap[]
  ): Task[] => {
    if (primaryView === 'maps') {
      return filterTasksByMap(taskList, mapView, mergedMaps);
    }
    if (primaryView === 'traders') {
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
    if (isAllUsersView(userView)) {
      const teamIds = Object.keys(progressStore.visibleTeamStores || {});
      return teamIds.every((teamId) => progressStore.invalidTasks?.[taskId]?.[teamId] === true);
    }
    return progressStore.invalidTasks?.[taskId]?.[userView] === true;
  };
  /**
   * Filter tasks by status (available, locked, completed) and user view
   */
  const filterTasksByStatus = (
    taskList: Task[],
    secondaryView: TaskSecondaryView,
    userView: string
  ): Task[] => {
    if (isAllUsersView(userView)) {
      return filterTasksForAllUsers(taskList, secondaryView);
    }
    return filterTasksForUser(taskList, secondaryView, userView);
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
  const getUserTaskStatus = (taskId: string, userView: string) => {
    const status = progressStore.getTaskStatus(userView, taskId);
    return {
      isCompleted: status === 'completed',
      isFailed: status === 'failed',
    };
  };
  /**
   * Filter tasks for all team members view
   */
  const filterTasksForAllUsers = (taskList: Task[], secondaryView: TaskSecondaryView): Task[] => {
    const tempVisibleTasks: Task[] = [];
    const teamIds = Object.keys(progressStore.visibleTeamStores || {});
    logger.debug('[TaskFiltering] Filtering for all users. Visible team IDs:', teamIds);
    for (const task of taskList) {
      const relevantTeamIds = getRelevantTeamIds(task, teamIds);
      if (relevantTeamIds.length === 0) continue;
      const taskStatuses = relevantTeamIds.map((teamId) => ({
        teamId,
        ...getTaskStatus(task.id, teamId),
      }));
      const isAvailable = ({ isUnlocked, isCompleted, isFailed }: (typeof taskStatuses)[0]) =>
        isUnlocked && !isCompleted && !isFailed;
      switch (secondaryView) {
        case 'all': {
          const usersWhoNeedTask = taskStatuses
            .filter(isAvailable)
            .map(({ teamId }) => progressStore.getDisplayName(teamId));
          tempVisibleTasks.push({ ...task, neededBy: usersWhoNeedTask });
          break;
        }
        case 'available': {
          if (isTaskInvalid(task.id, 'all')) continue;
          const usersWhoNeedTask = taskStatuses
            .filter(isAvailable)
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
          break;
        }
        case 'failed': {
          if (taskStatuses.some(({ isFailed }) => isFailed)) {
            tempVisibleTasks.push({ ...task, neededBy: [] });
          }
          break;
        }
        case 'locked': {
          if (isTaskInvalid(task.id, 'all')) continue;
          const isAvailableForAny = taskStatuses.some(isAvailable);
          const isCompletedByAll = taskStatuses.every(({ isCompleted }) => isCompleted);
          const isFailedForAny = taskStatuses.some(({ isFailed }) => isFailed);
          if (!isAvailableForAny && !isCompletedByAll && !isFailedForAny) {
            tempVisibleTasks.push({ ...task, neededBy: [] });
          }
          break;
        }
        case 'completed': {
          const isCompletedByAll = taskStatuses.every(
            ({ isCompleted, isFailed }) => isCompleted && !isFailed
          );
          if (isCompletedByAll) {
            tempVisibleTasks.push({ ...task, neededBy: [] });
          }
          break;
        }
      }
    }
    return tempVisibleTasks;
  };
  /**
   * Filter tasks for specific user
   */
  const filterTasksForUser = (
    taskList: Task[],
    secondaryView: TaskSecondaryView,
    userView: string
  ): Task[] => {
    logger.debug('[TaskFiltering] Filtering for specific user:', {
      userView,
      secondaryView,
      totalTasks: taskList.length,
    });
    let filtered = taskList;
    switch (secondaryView) {
      case 'available':
        filtered = filtered.filter((task) => {
          if (isTaskInvalid(task.id, userView)) return false;
          const isUnlocked = progressStore.unlockedTasks?.[task.id]?.[userView] === true;
          const { isCompleted, isFailed } = getUserTaskStatus(task.id, userView);
          return isUnlocked && !isCompleted && !isFailed;
        });
        break;
      case 'failed':
        filtered = filtered.filter((task) => getUserTaskStatus(task.id, userView).isFailed);
        break;
      case 'locked':
        filtered = filtered.filter((task) => {
          if (isTaskInvalid(task.id, userView)) return false;
          const { isCompleted, isFailed } = getUserTaskStatus(task.id, userView);
          const unlockedTasks = progressStore.unlockedTasks?.[task.id];
          return isCompleted !== true && isFailed !== true && unlockedTasks?.[userView] !== true;
        });
        break;
      case 'completed':
        filtered = filtered.filter((task) => {
          const { isCompleted, isFailed } = getUserTaskStatus(task.id, userView);
          return isCompleted && !isFailed;
        });
        break;
      case 'all':
        break;
    }
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
  const getTaskTypeOptions = () =>
    buildTaskTypeFilterOptions(preferencesStore, tarkovStore, metadataStore);
  const filterTasksByTypeSettings = (taskList: Task[]): Task[] =>
    filterTasksByTypeSettingsUtil(taskList, getTaskTypeOptions());
  const taskHasRequiredKeys = (task: Task): boolean => (task.requiredKeys?.length ?? 0) > 0;
  const shouldApplyRequiredKeysFilter = (): boolean =>
    preferencesStore.getOnlyTasksWithRequiredKeys && metadataStore.tasksObjectivesHydrated;
  const filterTasksByRequiredKeysSetting = (taskList: Task[]): Task[] => {
    if (!shouldApplyRequiredKeysFilter()) {
      return taskList;
    }
    return taskList.filter(taskHasRequiredKeys);
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
    secondaryView: TaskSecondaryView
  ): Record<string, number> => {
    const perfTimer = perfStart('[Tasks] calculateMapTaskTotals', {
      tasks: tasks.length,
      maps: mergedMaps.length,
      secondaryView,
      userView: activeUserView,
    });
    const mapTaskCounts: Record<string, number> = {};
    const typedTasks = filterTasksByTypeSettings(tasks);
    const keyFilteredTasks = filterTasksByRequiredKeysSetting(typedTasks);
    const statusFilteredTasks = filterTasksByStatus(
      keyFilteredTasks,
      secondaryView,
      activeUserView
    );
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
    const teamIds = resolveImpactTeamIds(userView, progressStore.visibleTeamStores);
    const impactEligibleTaskIds = preferencesStore.getRespectTaskFiltersForImpact
      ? new Set(
          filterTasksByRequiredKeysSetting(filterTasksByTypeSettings(metadataStore.tasks)).map(
            (task) => task.id
          )
        )
      : undefined;
    const impactScores = buildTaskImpactScores(
      taskList,
      teamIds,
      {
        tasksCompletions: progressStore.tasksCompletions,
        tasksFailed: progressStore.tasksFailed,
      },
      impactEligibleTaskIds
    );
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
    const pinnedIds = preferencesStore.getPinnedTaskIds;
    // Partition tasks into pinned and unpinned
    const pinnedTasks: Task[] = [];
    const unpinnedTasks: Task[] = [];
    for (const task of taskList) {
      if (pinnedIds.includes(task.id)) {
        pinnedTasks.push(task);
      } else {
        unpinnedTasks.push(task);
      }
    }
    const applySort = (tasks: Task[]) => {
      switch (sortMode) {
        case 'alphabetical':
          return sortTasksByName(tasks, sortDirection);
        case 'level':
          return sortTasksByLevel(tasks, sortDirection);
        case 'impact':
          return sortTasksByImpact(tasks, userView, sortDirection);
        case 'trader':
          return sortTasksByTrader(tasks, sortDirection);
        case 'teammates':
          return sortTasksByTeammatesAvailable(tasks, sortDirection);
        case 'xp':
          return sortTasksByXp(tasks, sortDirection);
        case 'none':
        default:
          return sortDirection === 'desc' ? [...tasks].reverse() : [...tasks];
      }
    };
    return [...applySort(pinnedTasks), ...applySort(unpinnedTasks)];
  };
  /**
   * Main function to update visible tasks based on all filters.
   * Uses TaskFilterAndSortOptions parameter object for cleaner API.
   */
  const updateVisibleTasks = async (
    options: TaskFilterAndSortOptions,
    tasksLoading: boolean
  ): Promise<void> => {
    const {
      primaryView,
      secondaryView,
      userView,
      mapView,
      traderView,
      mergedMaps,
      sortMode,
      sortDirection,
    } = options;
    const perfTimer = perfStart('[Tasks] updateVisibleTasks', {
      primaryView,
      secondaryView,
      userView,
      mapView,
      traderView,
      sortMode,
      sortDirection,
    });
    const perfOn = perfEnabled();
    const startOverall = perfOn ? perfNow() : 0;
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
      const [afterType, filterTypeMs] = timed(
        () => filterTasksByTypeSettings(visibleTaskList),
        perfOn
      );
      visibleTaskList = afterType;
      const [afterView, filterViewMs] = timed(
        () => filterTasksByView(visibleTaskList, primaryView, mapView, traderView, mergedMaps),
        perfOn
      );
      visibleTaskList = afterView;
      const [afterStatus, filterStatusMs] = timed(
        () => filterTasksByStatus(visibleTaskList, secondaryView, userView),
        perfOn
      );
      visibleTaskList = afterStatus;
      const [afterRequiredKeys, filterRequiredKeysMs] = timed(
        () => filterTasksByRequiredKeysSetting(visibleTaskList),
        perfOn
      );
      visibleTaskList = afterRequiredKeys;
      let sharedFilterMs = 0;
      if (
        preferencesStore.getTaskSharedByAllOnly &&
        isAllUsersView(userView) &&
        secondaryView === 'available'
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
      const [sorted, sortMs] = timed(
        () => sortTasks(visibleTaskList, userView, sortMode, sortDirection),
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
        filterRequiredKeysMs: perfOn ? roundMs(filterRequiredKeysMs) : undefined,
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
    // Get task type filter settings
    const showKappa = !preferencesStore.getHideNonKappaTasks;
    const showLightkeeper = preferencesStore.getShowLightkeeperTasks;
    const showNonSpecial = preferencesStore.getShowNonSpecialTasks;
    const hasTypeSelection = showKappa || showLightkeeper || showNonSpecial;
    const onlyTasksWithRequiredKeys = shouldApplyRequiredKeysFilter();
    // Get prestige filtering data
    const userPrestigeLevel = tarkovStore.getPrestigeLevel();
    const prestigeTaskMap = metadataStore.prestigeTaskMap || new Map<string, number>();
    const prestigeTaskIds = Array.from(prestigeTaskMap.keys());
    // Get edition-based excluded tasks
    const userEdition = tarkovStore.getGameEdition();
    const excludedTaskIds = metadataStore.getExcludedTaskIdsForEdition(userEdition);
    for (const task of taskList) {
      // Skip tasks not available for user's game edition
      if (excludedTaskIds.has(task.id)) continue;
      // Skip prestige tasks that don't match user's prestige level
      if (prestigeTaskIds.includes(task.id)) {
        const taskPrestigeLevel = prestigeTaskMap.get(task.id);
        if (taskPrestigeLevel !== userPrestigeLevel) continue;
      }
      // Skip tasks filtered out by task type settings
      const isKappaRequired = task.kappaRequired === true;
      const isLightkeeperRequired = task.lightkeeperRequired === true;
      const isNonSpecial = !isKappaRequired && !isLightkeeperRequired;
      if (
        hasTypeSelection &&
        ((isKappaRequired && !showKappa) ||
          (isLightkeeperRequired && !showLightkeeper) ||
          (isNonSpecial && !showNonSpecial))
      ) {
        continue;
      }
      if (onlyTasksWithRequiredKeys && !taskHasRequiredKeys(task)) {
        continue;
      }
      if (isAllUsersView(userView)) {
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
          counts.available++;
        } else if (!isTaskInvalid(task.id, 'all')) {
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
    const prestigeTaskIds = Array.from(prestigeTaskMap.keys());
    const userEdition = tarkovStore.getGameEdition();
    const excludedTaskIds = metadataStore.getExcludedTaskIdsForEdition(userEdition);
    const isAvailableStatus = (status: {
      isUnlocked: boolean;
      isCompleted: boolean;
      isFailed: boolean;
    }) => status.isUnlocked && !status.isCompleted && !status.isFailed;
    for (const task of taskList) {
      if (excludedTaskIds.has(task.id)) continue;
      if (prestigeTaskIds.includes(task.id)) {
        const taskPrestigeLevel = prestigeTaskMap.get(task.id);
        if (taskPrestigeLevel !== userPrestigeLevel) continue;
      }
      const isKappaRequired = task.kappaRequired === true;
      const isLightkeeperRequired = task.lightkeeperRequired === true;
      const isNonSpecial = !isKappaRequired && !isLightkeeperRequired;
      if (
        hasTypeSelection &&
        ((isKappaRequired && !showKappa) ||
          (isLightkeeperRequired && !showLightkeeper) ||
          (isNonSpecial && !showNonSpecial))
      ) {
        continue;
      }
      if (onlyTasksWithRequiredKeys && !taskHasRequiredKeys(task)) {
        continue;
      }
      const traderId = task.trader?.id;
      if (!traderId) continue;
      if (!counts[traderId]) counts[traderId] = 0;
      const taskFaction = task.factionName;
      if (isAllUsersView(userView)) {
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
        switch (secondaryView) {
          case 'all':
            shouldCount = true;
            break;
          case 'available':
            shouldCount = taskStatuses.some(isAvailableStatus);
            break;
          case 'locked':
            if (isTaskInvalid(task.id, 'all')) continue;
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
    disabledTasks: [] as string[],
    RAID_RELEVANT_OBJECTIVE_TYPES,
    isRaidRelevantObjective,
    isGlobalTask,
  };
}
