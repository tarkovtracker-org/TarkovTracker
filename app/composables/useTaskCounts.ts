import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { isAllUsersView } from '@/types/taskFilter';
import { perfEnd, perfStart } from '@/utils/perf';
import type { Task } from '@/types/tarkov';
import type { TaskSecondaryView } from '@/types/taskFilter';
type TaskCountStatus = 'active' | 'available' | 'locked' | 'completed' | 'failed';
type TaskStatusCounts = Record<'all' | TaskCountStatus, number>;
type TeamTaskStatus = {
  teamId: string;
  isUnlocked: boolean;
  isActive: boolean;
  isCompleted: boolean;
  isFailed: boolean;
};
type TaskCountResult = { status: TaskCountStatus | null };
type TaskLifecycleStatus = 'active' | 'completed' | 'failed' | 'incomplete';
type TaskCountFilterContext = {
  showKappa: boolean;
  showLightkeeper: boolean;
  showNonSpecial: boolean;
  hasTypeSelection: boolean;
  onlyTasksWithRequiredKeys: boolean;
  userPrestigeLevel: number;
  prestigeTaskMap: Map<string, number>;
  excludedTaskIds: Set<string>;
};
const TASK_STATUS_TO_COUNT_STATUS: Record<
  Exclude<TaskLifecycleStatus, 'incomplete'>,
  TaskCountStatus
> = {
  active: 'active',
  completed: 'completed',
  failed: 'failed',
};
const isAvailableTeamTask = ({
  isUnlocked,
  isActive,
  isCompleted,
  isFailed,
}: TeamTaskStatus): boolean => isUnlocked && !isActive && !isCompleted && !isFailed;
const taskHasRequiredKeys = (task: Task): boolean => (task.requiredKeys?.length ?? 0) > 0;
const isTaskTypeVisible = (task: Task, context: TaskCountFilterContext): boolean => {
  if (!context.hasTypeSelection) return true;
  const isKappaRequired = task.kappaRequired === true;
  const isLightkeeperRequired = task.lightkeeperRequired === true;
  const isNonSpecial = !isKappaRequired && !isLightkeeperRequired;
  return (
    (isKappaRequired && context.showKappa) ||
    (isLightkeeperRequired && context.showLightkeeper) ||
    (isNonSpecial && context.showNonSpecial)
  );
};
const isTaskIncluded = (task: Task, context: TaskCountFilterContext): boolean => {
  if (context.excludedTaskIds.has(task.id)) return false;
  const taskPrestigeLevel = context.prestigeTaskMap.get(task.id);
  if (taskPrestigeLevel !== undefined && taskPrestigeLevel !== context.userPrestigeLevel) {
    return false;
  }
  if (!isTaskTypeVisible(task, context)) return false;
  return !context.onlyTasksWithRequiredKeys || taskHasRequiredKeys(task);
};
const resolveUnstartedTaskStatus = (
  isUnlocked: boolean,
  isInvalid: boolean
): TaskCountStatus | null => {
  if (isInvalid) return null;
  if (isUnlocked) return 'available';
  return 'locked';
};
const resolveAllUsersTaskStatus = (
  statuses: TeamTaskStatus[],
  isInvalid: boolean
): TaskCountStatus | null => {
  const terminalStatus = [
    { status: 'failed' as const, matches: statuses.some(({ isFailed }) => isFailed) },
    { status: 'completed' as const, matches: statuses.every(({ isCompleted }) => isCompleted) },
    { status: 'active' as const, matches: statuses.some(({ isActive }) => isActive) },
  ].find(({ matches }) => matches)?.status;
  if (terminalStatus) return terminalStatus;
  return resolveUnstartedTaskStatus(statuses.some(isAvailableTeamTask), isInvalid);
};
const resolveUserTaskStatus = (
  status: TaskLifecycleStatus,
  isUnlocked: boolean,
  isInvalid: boolean
): TaskCountStatus | null => {
  if (status !== 'incomplete') return TASK_STATUS_TO_COUNT_STATUS[status];
  return resolveUnstartedTaskStatus(isUnlocked, isInvalid);
};
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
  const getTaskFilterContext = (): TaskCountFilterContext => {
    const showKappa = !preferencesStore.getHideNonKappaTasks;
    const showLightkeeper = preferencesStore.getShowLightkeeperTasks;
    const showNonSpecial = preferencesStore.getShowNonSpecialTasks;
    return {
      showKappa,
      showLightkeeper,
      showNonSpecial,
      hasTypeSelection: showKappa || showLightkeeper || showNonSpecial,
      onlyTasksWithRequiredKeys: shouldApplyRequiredKeysFilter(),
      userPrestigeLevel: tarkovStore.getPrestigeLevel(),
      prestigeTaskMap: metadataStore.prestigeTaskMap || new Map<string, number>(),
      excludedTaskIds: metadataStore.getExcludedTaskIdsForEdition(tarkovStore.getGameEdition()),
    };
  };
  const getTeamTaskStatus = (taskId: string, teamId: string): TeamTaskStatus => {
    const status = progressStore.getTaskStatus(teamId, taskId);
    return {
      teamId,
      isUnlocked: progressStore.unlockedTasks?.[taskId]?.[teamId] === true,
      isActive: status === 'active',
      isCompleted: status === 'completed',
      isFailed: status === 'failed',
    };
  };
  const getAllUsersTaskCount = (task: Task, visibleTeamIds: string[]): TaskCountResult | null => {
    const relevantTeamIds = visibleTeamIds.filter((teamId) => {
      const teamFaction = progressStore.playerFaction[teamId];
      return task.factionName === 'Any' || task.factionName === teamFaction;
    });
    if (relevantTeamIds.length === 0) return null;
    const statuses = relevantTeamIds.map((teamId) => getTeamTaskStatus(task.id, teamId));
    const isInvalid = isTaskInvalid(task.id, 'all', visibleTeamIds);
    return { status: resolveAllUsersTaskStatus(statuses, isInvalid) };
  };
  const getUserTaskCount = (task: Task, userView: string): TaskCountResult | null => {
    const userFaction = progressStore.playerFaction[userView];
    if (task.factionName !== 'Any' && task.factionName !== userFaction) return null;
    const status = progressStore.getTaskStatus(userView, task.id);
    const isUnlocked = progressStore.unlockedTasks?.[task.id]?.[userView] === true;
    const isInvalid = isTaskInvalid(task.id, userView);
    return {
      status: resolveUserTaskStatus(status, isUnlocked, isInvalid),
    };
  };
  const calculateStatusCounts = (userView: string): TaskStatusCounts => {
    const perfTimer = perfStart('[Tasks] calculateStatusCounts', {
      tasks: metadataStore.tasks.length,
      userView,
    });
    const counts = { all: 0, active: 0, available: 0, locked: 0, completed: 0, failed: 0 };
    const taskFilterContext = getTaskFilterContext();
    const isAllUsers = isAllUsersView(userView);
    const visibleTeamIds = isAllUsers ? Object.keys(progressStore.visibleTeamStores || {}) : [];
    for (const task of metadataStore.tasks) {
      if (!isTaskIncluded(task, taskFilterContext)) continue;
      const result = isAllUsers
        ? getAllUsersTaskCount(task, visibleTeamIds)
        : getUserTaskCount(task, userView);
      if (!result) continue;
      counts.all++;
      if (result.status) counts[result.status]++;
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
    const taskFilterContext = getTaskFilterContext();
    const isAllUsers = isAllUsersView(userView);
    const visibleTeamIds = isAllUsers ? Object.keys(progressStore.visibleTeamStores || {}) : [];
    for (const task of metadataStore.tasks) {
      if (!isTaskIncluded(task, taskFilterContext)) continue;
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
        const taskStatuses = relevantTeamIds.map((teamId) => getTeamTaskStatus(task.id, teamId));
        let shouldCount = false;
        switch (secondaryView) {
          case 'all':
            shouldCount = true;
            break;
          case 'available':
            if (isTaskInvalid(task.id, 'all', visibleTeamIds)) continue;
            shouldCount = taskStatuses.some(isAvailableTeamTask);
            break;
          case 'active':
            shouldCount = taskStatuses.some(({ isActive }) => isActive);
            break;
          case 'locked':
            if (isTaskInvalid(task.id, 'all', visibleTeamIds)) continue;
            shouldCount =
              !taskStatuses.some(isAvailableTeamTask) &&
              !taskStatuses.some(({ isActive }) => isActive) &&
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
        const status = progressStore.getTaskStatus(userView, task.id);
        const isActive = status === 'active';
        const isCompleted = status === 'completed';
        const isFailed = status === 'failed';
        let shouldCount = false;
        switch (secondaryView) {
          case 'all':
            shouldCount = true;
            break;
          case 'available':
            if (isTaskInvalid(task.id, userView)) continue;
            shouldCount = isUnlocked && !isActive && !isCompleted && !isFailed;
            break;
          case 'active':
            shouldCount = isActive;
            break;
          case 'locked':
            if (isTaskInvalid(task.id, userView)) continue;
            shouldCount = !isActive && !isCompleted && !isFailed && !isUnlocked;
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
