import { defineStore } from 'pinia';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useTarkovStore } from '@/stores/useTarkov';
import { useTeammateStores, useTeamStore } from '@/stores/useTeamStore';
import {
  GAME_MODES,
  resolveTraderUnlockTaskIds,
  SPECIAL_STATIONS,
  TASK_STATE,
  type GameMode,
  type TaskState,
} from '@/utils/constants';
import { logger } from '@/utils/logger';
import { perfEnd, perfStart } from '@/utils/perf';
import { computeInvalidProgress } from '@/utils/progressInvalidation';
import { createDefaultOwnedProgressData } from '@/utils/progressSanitizers';
import {
  getCompletionFlags,
  getTaskStatusFromFlags,
  isTaskActive,
  isTaskComplete,
  isTaskFailed,
  type RawTaskCompletion,
} from '@/utils/taskStatus';
import type { UserProgressData, UserState } from '@/stores/progressState';
import type { GameEdition, Task, TaskRequirement } from '@/types/tarkov';
import type { Store } from 'pinia';
function getGameModeData(store: Store<string, UserState> | undefined): UserProgressData {
  if (!store) return createDefaultOwnedProgressData();
  const currentGameMode = store.$state.currentGameMode;
  const modeData =
    currentGameMode === GAME_MODES.PVP
      ? store.$state.pvp
      : currentGameMode === GAME_MODES.PVE
        ? store.$state.pve
        : undefined;
  return modeData ?? createDefaultOwnedProgressData();
}
type TeamStoresMap = Record<string, Store<string, UserState>>;
type CompletionsMap = Record<string, Record<string, boolean>>;
type FailedTasksMap = Record<string, Record<string, boolean>>;
type TraderLevelsMap = Record<string, Record<string, number>>;
type FactionMap = Record<string, string>;
type TaskAvailabilityMap = Record<string, Record<string, boolean>>;
type ObjectiveCompletionsMap = Record<string, Record<string, boolean>>;
type HideoutLevelMap = Record<string, Record<string, number>>;
type InvalidTasksMap = Record<string, Record<string, boolean>>;
type InvalidObjectivesMap = Record<string, Record<string, boolean>>;
/*
type ProgressGetters = {
  teamStores: TeamStoresMap;
  visibleTeamStores: TeamStoresMap;
  tasksCompletions: CompletionsMap;
  gameEditionData: GameEdition[];
  traderLevelsAchieved: TraderLevelsMap;
  playerFaction: FactionMap;
  unlockedTasks: TaskAvailabilityMap;
  objectiveCompletions: ObjectiveCompletionsMap;
  hideoutLevels: HideoutLevelMap;
  getTeamIndex: (teamId: string) => number;
  getDisplayName: (teamId: string) => string;
  getLevel: (teamId: string) => number;
  getFaction: (teamId: string) => string;
};
*/
export const useProgressStore = defineStore('progress', () => {
  const preferencesStore = usePreferencesStore();
  const metadataStore = useMetadataStore();
  const { teammateStores } = useTeammateStores();
  const teamStore = useTeamStore();
  // Get the tarkov store to source "self" data directly from it
  const tarkovStore = useTarkovStore();
  const selfStore = tarkovStore as Store<string, UserState>;
  const teamStores = computed<TeamStoresMap>(() => {
    const stores = {
      self: selfStore,
      ...teammateStores.value,
    };
    if (import.meta.env.DEV) logger.debug('[ProgressStore] All team stores:', Object.keys(stores));
    return stores;
  });
  const visibleTeamStores = computed(() => {
    const visibleStores: TeamStoresMap = {};
    Object.entries(teamStores.value).forEach(([teamId, store]) => {
      const isHidden = preferencesStore.teamIsHidden(teamId);
      if (!isHidden) {
        visibleStores[teamId] = store;
      }
      logger.debug('[ProgressStore] Team visibility check:', {
        teamId,
        isHidden,
        taskTeamHideAll: preferencesStore.taskTeamAllHidden,
      });
    });
    logger.debug('[ProgressStore] Visible team stores:', Object.keys(visibleStores));
    return visibleStores;
  });
  const taskStatusFlags = computed(() => {
    const perfTimer = perfStart('[Progress] taskStatusFlags', {
      tasks: metadataStore.tasks.length,
    });
    const completions: CompletionsMap = {};
    const failures: FailedTasksMap = {};
    if (!metadataStore.tasks.length || !visibleTeamStores.value) {
      perfEnd(perfTimer, { skipped: true });
      return { completions: {}, failures: {} };
    }
    const teamIds = Object.keys(visibleTeamStores.value);
    const teamDataCache = new Map<string, UserProgressData>();
    for (const teamId of teamIds) {
      const store = visibleTeamStores.value[teamId];
      teamDataCache.set(teamId, getGameModeData(store));
    }
    for (const task of metadataStore.tasks as Task[]) {
      completions[task.id] = {};
      failures[task.id] = {};
      for (const teamId of teamIds) {
        const currentData = teamDataCache.get(teamId)!;
        const completionFlags = getCompletionFlags(currentData?.taskCompletions?.[task.id]);
        completions[task.id]![teamId] = completionFlags.complete;
        failures[task.id]![teamId] = completionFlags.failed;
      }
    }
    perfEnd(perfTimer, { tasks: metadataStore.tasks.length, teams: teamIds.length });
    return { completions, failures };
  });
  const tasksCompletions = computed(() => taskStatusFlags.value.completions);
  const tasksFailed = computed(() => taskStatusFlags.value.failures);
  const gameEditionData = computed<GameEdition[]>(() => metadataStore.editions);
  const traderLevelsAchieved = computed(() => {
    const perfTimer = perfStart('[Progress] traderLevelsAchieved', {
      traders: metadataStore.traders.length,
    });
    const levels: TraderLevelsMap = {};
    if (!metadataStore.traders.length || Object.keys(visibleTeamStores.value).length === 0) {
      perfEnd(perfTimer, { skipped: true });
      return {};
    }
    for (const teamId of Object.keys(visibleTeamStores.value)) {
      levels[teamId] = {};
      const store = visibleTeamStores.value[teamId];
      for (const trader of metadataStore.traders) {
        const currentData = getGameModeData(store);
        levels[teamId]![trader.id] = currentData.traders?.[trader.id]?.level ?? 0;
      }
    }
    perfEnd(perfTimer, { traders: metadataStore.traders.length });
    return levels;
  });
  const playerFaction = computed(() => {
    const perfTimer = perfStart('[Progress] playerFaction');
    const faction: FactionMap = {};
    if (Object.keys(visibleTeamStores.value).length === 0) {
      perfEnd(perfTimer, { skipped: true });
      return {};
    }
    for (const teamId of Object.keys(visibleTeamStores.value)) {
      const store = visibleTeamStores.value[teamId];
      const currentData = getGameModeData(store);
      faction[teamId] = currentData?.pmcFaction ?? 'USEC';
    }
    perfEnd(perfTimer);
    return faction;
  });
  /**
   * Optimized unlockedTasks computation.
   * Pre-collects team data once, then iterates tasks with early exits.
   * This reduces redundant store lookups that were happening per-task-per-team.
   */
  const unlockedTasks = computed(() => {
    const perfTimer = perfStart('[Progress] unlockedTasks', {
      tasks: metadataStore.tasks.length,
    });
    const available: TaskAvailabilityMap = {};
    const tasks = metadataStore.tasks as Task[];
    const teamIds = Object.keys(visibleTeamStores.value);
    if (tasks.length === 0 || teamIds.length === 0) {
      perfEnd(perfTimer, { skipped: true });
      return {};
    }
    // Pre-collect all team data once (avoid repeated getGameModeData calls)
    // Use getLevel() to respect automatic level calculation preference for 'self'
    const teamDataCache = new Map<
      string,
      {
        mode: GameMode;
        level: number;
        faction: string;
        completions: Record<string, RawTaskCompletion>;
        traders: Record<string, { level?: number; reputation?: number }>;
      }
    >();
    for (const teamId of teamIds) {
      const store = visibleTeamStores.value[teamId];
      if (!store) continue;
      const currentData = getGameModeData(store);
      teamDataCache.set(teamId, {
        mode: store.$state.currentGameMode === GAME_MODES.PVE ? GAME_MODES.PVE : GAME_MODES.PVP,
        level: getLevel(teamId),
        faction: currentData?.pmcFaction ?? 'USEC',
        completions: currentData?.taskCompletions ?? {},
        traders: currentData?.traders ?? {},
      });
    }
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const normalizeStatuses = (statuses?: string[]) =>
      (statuses ?? []).map((status) => status.toLowerCase());
    const hasAnyStatus = (statuses: string[], values: string[]) =>
      values.some((value) => statuses.includes(value));
    const fenceTrader = metadataStore.traders.find((t) => t.normalizedName === 'fence');
    // Initialize availability map
    for (const task of tasks) {
      available[task.id] = {};
    }
    // Compute availability per team with memoization to keep status-aware chains consistent
    for (const teamId of teamIds) {
      const teamData = teamDataCache.get(teamId);
      if (!teamData) continue;
      const availabilityMemo = new Map<string, boolean>();
      const unlockableMemo = new Map<string, boolean>();
      const visitingAvailable = new Set<string>();
      const visitingUnlockable = new Set<string>();
      const isRequirementSatisfied = (requirement: TaskRequirement): boolean => {
        const reqTaskId = requirement?.task?.id;
        if (!reqTaskId) return true;
        const requirementStatus = normalizeStatuses(requirement.status);
        const requiresComplete =
          requirementStatus.length === 0 ||
          hasAnyStatus(requirementStatus, ['complete', 'completed']);
        const requiresActive = hasAnyStatus(requirementStatus, ['active', 'accept', 'accepted']);
        const requiresFailed = hasAnyStatus(requirementStatus, ['failed']);
        const completion = teamData.completions[reqTaskId];
        const isComplete = isTaskComplete(completion);
        const isFailed = isTaskFailed(completion);
        const isActive = isTaskActive(completion);
        if (requiresComplete && isComplete) return true;
        if (requiresFailed && isFailed) return true;
        if (requiresActive) {
          if (isActive || isComplete) return true;
          // Treat "available" as "accepted" when no explicit active state is stored.
          if (isTaskUnlockable(reqTaskId)) return true;
        }
        return false;
      };
      const computeTaskAvailability = (
        taskId: string,
        allowCompleted: boolean,
        memo: Map<string, boolean>,
        visiting: Set<string>
      ): boolean => {
        if (memo.has(taskId)) return memo.get(taskId)!;
        if (visiting.has(taskId)) return false;
        const task = tasksById.get(taskId);
        if (!task) return false;
        visiting.add(taskId);
        // Early exit: already complete (unless we allow completed tasks)
        if (!allowCompleted && isTaskComplete(teamData.completions[taskId])) {
          memo.set(taskId, false);
          visiting.delete(taskId);
          return false;
        }
        // Check failed requirements
        if (task.failedRequirements) {
          for (const req of task.failedRequirements) {
            if (req?.task?.id && isTaskFailed(teamData.completions[req.task.id])) {
              memo.set(taskId, false);
              visiting.delete(taskId);
              return false;
            }
          }
        }
        // Level check
        if (task.minPlayerLevel && teamData.level < task.minPlayerLevel) {
          memo.set(taskId, false);
          visiting.delete(taskId);
          return false;
        }
        // Fence reputation check - only Fence trader requirements gate availability
        // Other trader level/rep requirements are display-only, not gating
        if (task.traderRequirements?.length && fenceTrader) {
          const fenceReq = task.traderRequirements.find((req) => req.trader.id === fenceTrader.id);
          if (fenceReq) {
            const userFenceRep = teamData.traders?.[fenceTrader.id]?.reputation ?? 0;
            // Positive requirement: user needs at least this much karma
            // Negative requirement: user needs at most this much (or worse) karma
            if (fenceReq.value >= 0) {
              if (userFenceRep < fenceReq.value) {
                memo.set(taskId, false);
                visiting.delete(taskId);
                return false;
              }
            } else {
              if (userFenceRep > fenceReq.value) {
                memo.set(taskId, false);
                visiting.delete(taskId);
                return false;
              }
            }
          }
        }
        // Prerequisites check
        if (task.taskRequirements) {
          for (const req of task.taskRequirements) {
            if (!isRequirementSatisfied(req)) {
              memo.set(taskId, false);
              visiting.delete(taskId);
              return false;
            }
          }
        }
        // Faction check
        if (
          task.factionName &&
          task.factionName !== 'Any' &&
          task.factionName !== teamData.faction
        ) {
          memo.set(taskId, false);
          visiting.delete(taskId);
          return false;
        }
        // Trader unlock check - some traders require completing a specific task to unlock
        const traderName = task.trader?.normalizedName || task.trader?.name?.toLowerCase();
        if (traderName) {
          const modeUnlockTaskIds = resolveTraderUnlockTaskIds(traderName, teamData.mode).filter(
            (unlockTaskId) => unlockTaskId !== taskId && tasksById.has(unlockTaskId)
          );
          if (
            modeUnlockTaskIds.length > 0 &&
            !modeUnlockTaskIds.some((unlockTaskId) =>
              isTaskComplete(teamData.completions[unlockTaskId])
            )
          ) {
            memo.set(taskId, false);
            visiting.delete(taskId);
            return false;
          }
        }
        memo.set(taskId, true);
        visiting.delete(taskId);
        return true;
      };
      const isTaskUnlockable = (taskId: string): boolean =>
        computeTaskAvailability(taskId, true, unlockableMemo, visitingUnlockable);
      const isTaskAvailable = (taskId: string): boolean =>
        computeTaskAvailability(taskId, false, availabilityMemo, visitingAvailable);
      for (const task of tasks) {
        available[task.id]![teamId] = isTaskAvailable(task.id);
      }
    }
    perfEnd(perfTimer, { tasks: tasks.length, teams: teamIds.length });
    return available;
  });
  const objectiveCompletions = computed(() => {
    const perfTimer = perfStart('[Progress] objectiveCompletions', {
      objectives: metadataStore.objectives.length,
    });
    const completions: ObjectiveCompletionsMap = {};
    if (
      metadataStore.objectives.length === 0 ||
      Object.keys(visibleTeamStores.value).length === 0
    ) {
      perfEnd(perfTimer, { skipped: true });
      return {};
    }
    const teamCount = Object.keys(visibleTeamStores.value).length;
    for (const objective of metadataStore.objectives) {
      completions[objective.id] = {};
      for (const teamId of Object.keys(visibleTeamStores.value)) {
        const store = visibleTeamStores.value[teamId];
        const currentData = getGameModeData(store);
        completions[objective.id]![teamId] =
          currentData?.taskObjectives?.[objective.id]?.complete ?? false;
      }
    }
    perfEnd(perfTimer, { objectives: metadataStore.objectives.length, teams: teamCount });
    return completions;
  });
  const invalidProgressByTeam = computed(() => {
    const perfTimer = perfStart('[Progress] invalidProgressByTeam', {
      tasks: metadataStore.tasks.length,
    });
    const invalidByTeam: Record<
      string,
      { invalidTasks: Record<string, boolean>; invalidObjectives: Record<string, boolean> }
    > = {};
    const tasks = metadataStore.tasks as Task[];
    const teamIds = Object.keys(visibleTeamStores.value);
    if (tasks.length === 0 || teamIds.length === 0) {
      perfEnd(perfTimer, { skipped: true });
      return {};
    }
    for (const teamId of teamIds) {
      const store = visibleTeamStores.value[teamId];
      const currentData = getGameModeData(store);
      invalidByTeam[teamId] = computeInvalidProgress({
        tasks,
        taskCompletions: currentData?.taskCompletions ?? {},
        pmcFaction: currentData?.pmcFaction ?? 'USEC',
      });
    }
    perfEnd(perfTimer, { tasks: tasks.length, teams: teamIds.length });
    return invalidByTeam;
  });
  const invalidTasks = computed(() => {
    const perfTimer = perfStart('[Progress] invalidTasks', {
      tasks: metadataStore.tasks.length,
    });
    const invalids: InvalidTasksMap = {};
    const teamIds = Object.keys(visibleTeamStores.value);
    if (metadataStore.tasks.length === 0 || teamIds.length === 0) {
      perfEnd(perfTimer, { skipped: true });
      return {};
    }
    const invalidByTeam = invalidProgressByTeam.value;
    for (const task of metadataStore.tasks as Task[]) {
      invalids[task.id] = {};
      for (const teamId of teamIds) {
        invalids[task.id]![teamId] = invalidByTeam[teamId]?.invalidTasks?.[task.id] ?? false;
      }
    }
    perfEnd(perfTimer, { tasks: metadataStore.tasks.length, teams: teamIds.length });
    return invalids;
  });
  const invalidObjectives = computed(() => {
    const perfTimer = perfStart('[Progress] invalidObjectives', {
      objectives: metadataStore.objectives.length,
    });
    const invalids: InvalidObjectivesMap = {};
    const teamIds = Object.keys(visibleTeamStores.value);
    if (metadataStore.objectives.length === 0 || teamIds.length === 0) {
      perfEnd(perfTimer, { skipped: true });
      return {};
    }
    const invalidByTeam = invalidProgressByTeam.value;
    for (const objective of metadataStore.objectives) {
      invalids[objective.id] = {};
      for (const teamId of teamIds) {
        invalids[objective.id]![teamId] =
          invalidByTeam[teamId]?.invalidObjectives?.[objective.id] ?? false;
      }
    }
    perfEnd(perfTimer, { objectives: metadataStore.objectives.length, teams: teamIds.length });
    return invalids;
  });
  const hideoutLevels = computed(() => {
    const perfTimer = perfStart('[Progress] hideoutLevels', {
      stations: metadataStore.hideoutStations.length,
    });
    const levels: HideoutLevelMap = {};
    if (
      !metadataStore.hideoutStations.length ||
      Object.keys(visibleTeamStores.value).length === 0
    ) {
      perfEnd(perfTimer, { skipped: true });
      return {};
    }
    const teamIds = Object.keys(visibleTeamStores.value);
    // Performance optimization: Pre-cache team data and edition info once
    const teamDataCache = new Map<
      string,
      {
        data: UserProgressData;
        edition: GameEdition | undefined;
        gameEditionVersion: number;
      }
    >();
    for (const teamId of teamIds) {
      const store = visibleTeamStores.value[teamId];
      const currentData = getGameModeData(store);
      const gameEditionVersion = store?.$state.gameEdition ?? 0;
      const edition = gameEditionData.value.find((e) => e.value === gameEditionVersion);
      teamDataCache.set(teamId, {
        data: currentData,
        edition,
        gameEditionVersion,
      });
    }
    // Iterate with cached data
    for (const station of metadataStore.hideoutStations) {
      if (!station || !station.id) continue;
      levels[station.id] = {};
      const isStash = station.normalizedName === SPECIAL_STATIONS.STASH;
      const isCultist = station.normalizedName === SPECIAL_STATIONS.CULTIST_CIRCLE;
      const maxLevel = station.levels?.length || 0;
      for (const teamId of teamIds) {
        const cached = teamDataCache.get(teamId)!;
        const modulesState = cached.data?.hideoutModules ?? {};
        let maxManuallyCompletedLevel = 0;
        if (station.levels && Array.isArray(station.levels)) {
          for (const lvl of station.levels) {
            if (lvl && lvl.id && modulesState[lvl.id]?.complete && typeof lvl.level === 'number') {
              maxManuallyCompletedLevel = Math.max(maxManuallyCompletedLevel, lvl.level);
            }
          }
        }
        let currentStationDisplayLevel;
        if (isStash) {
          const defaultStashFromEdition = cached.edition?.defaultStashLevel ?? 0;
          const effectiveStashLevel = Math.min(defaultStashFromEdition, maxLevel);
          if (effectiveStashLevel === maxLevel) {
            currentStationDisplayLevel = maxLevel;
          } else {
            currentStationDisplayLevel = Math.max(effectiveStashLevel, maxManuallyCompletedLevel);
          }
        } else if (isCultist) {
          const defaultCultistCircleFromEdition = cached.edition?.defaultCultistCircleLevel ?? 0;
          const effectiveCultistCircleLevel = Math.min(defaultCultistCircleFromEdition, maxLevel);
          if (effectiveCultistCircleLevel === maxLevel) {
            currentStationDisplayLevel = maxLevel;
          } else {
            currentStationDisplayLevel = Math.max(
              effectiveCultistCircleLevel,
              maxManuallyCompletedLevel
            );
          }
        } else {
          currentStationDisplayLevel = maxManuallyCompletedLevel;
        }
        levels[station.id]![teamId] = currentStationDisplayLevel;
      }
    }
    perfEnd(perfTimer, { stations: metadataStore.hideoutStations.length });
    return levels;
  });
  const moduleCompletions = computed(() => {
    const perfTimer = perfStart('[Progress] moduleCompletions', {
      stations: metadataStore.hideoutStations.length,
    });
    const completions: CompletionsMap = {};
    if (
      !metadataStore.hideoutStations.length ||
      Object.keys(visibleTeamStores.value).length === 0
    ) {
      perfEnd(perfTimer, { skipped: true });
      return {};
    }
    const teamIds = Object.keys(visibleTeamStores.value);
    // Performance optimization: Pre-cache team edition data
    const teamEditionCache = new Map<
      string,
      {
        data: UserProgressData;
        edition: GameEdition | undefined;
      }
    >();
    for (const teamId of teamIds) {
      const store = visibleTeamStores.value[teamId];
      const currentData = getGameModeData(store);
      const gameEditionVersion = store?.$state.gameEdition ?? 0;
      const edition = gameEditionData.value.find((e) => e.value === gameEditionVersion);
      teamEditionCache.set(teamId, { data: currentData, edition });
    }
    for (const station of metadataStore.hideoutStations) {
      if (!station || !station.id || !station.levels) continue;
      const isStash = station.normalizedName === SPECIAL_STATIONS.STASH;
      const isCultist = station.normalizedName === SPECIAL_STATIONS.CULTIST_CIRCLE;
      for (const level of station.levels) {
        if (!level || !level.id) continue;
        completions[level.id] = {};
        for (const teamId of teamIds) {
          const cached = teamEditionCache.get(teamId)!;
          // Check if manually completed
          const isManuallyComplete = cached.data?.hideoutModules?.[level.id]?.complete ?? false;
          if (isManuallyComplete) {
            completions[level.id]![teamId] = true;
            continue;
          }
          // Check if auto-completed by game edition for special stations
          if (isStash) {
            const defaultStashLevel = cached.edition?.defaultStashLevel ?? 0;
            // Module is complete if its level is <= default stash level from edition
            if (level.level <= defaultStashLevel) {
              completions[level.id]![teamId] = true;
              continue;
            }
          } else if (isCultist) {
            const defaultCultistCircleLevel = cached.edition?.defaultCultistCircleLevel ?? 0;
            // Module is complete if its level is <= default cultist circle level from edition
            if (level.level <= defaultCultistCircleLevel) {
              completions[level.id]![teamId] = true;
              continue;
            }
          }
          completions[level.id]![teamId] = false;
        }
      }
    }
    perfEnd(perfTimer, { stations: metadataStore.hideoutStations.length });
    return completions;
  });
  const modulePartCompletions = computed(() => {
    const perfTimer = perfStart('[Progress] modulePartCompletions', {
      stations: metadataStore.hideoutStations.length,
    });
    const completions: CompletionsMap = {};
    if (
      !metadataStore.hideoutStations.length ||
      Object.keys(visibleTeamStores.value).length === 0
    ) {
      perfEnd(perfTimer, { skipped: true });
      return {};
    }
    const teamIds = Object.keys(visibleTeamStores.value);
    // Performance optimization: Pre-cache team data once
    const teamDataCache = new Map<string, UserProgressData>();
    for (const teamId of teamIds) {
      const store = visibleTeamStores.value[teamId];
      teamDataCache.set(teamId, getGameModeData(store));
    }
    // Performance optimization: Use Set for deduplication instead of flatMap
    const allPartIds = new Set<string>();
    for (const station of metadataStore.hideoutStations) {
      if (!station.levels) continue;
      for (const level of station.levels) {
        if (!level.itemRequirements) continue;
        for (const req of level.itemRequirements) {
          if (req.id) allPartIds.add(req.id);
        }
      }
    }
    for (const partId of allPartIds) {
      completions[partId] = {};
      for (const teamId of teamIds) {
        const currentData = teamDataCache.get(teamId)!;
        completions[partId]![teamId] = currentData?.hideoutParts?.[partId]?.complete ?? false;
      }
    }
    perfEnd(perfTimer, { parts: allPartIds.size });
    return completions;
  });
  const getTeamIndex = (teamId: string): string => {
    const { $supabase } = useNuxtApp();
    return teamId === $supabase.user?.id ? 'self' : teamId;
  };
  const getDisplayName = (teamId: string): string => {
    const storeKey = getTeamIndex(teamId);
    // If it's the current user, get from tarkov store
    if (storeKey === 'self') {
      const store = teamStores.value[storeKey];
      const currentData = getGameModeData(store);
      return currentData?.displayName || 'You';
    }
    // For teammates, try to get from memberProfiles first (server-side source of truth)
    const profile = teamStore.memberProfiles?.[teamId];
    if (profile?.displayName) {
      return profile.displayName;
    }
    // Fallback to store data if available
    const store = teamStores.value[storeKey];
    if (store) {
      const currentData = getGameModeData(store);
      if (currentData?.displayName) {
        return currentData.displayName;
      }
    }
    // Final fallback
    return teamId.substring(0, 6);
  };
  // Only compute derived level for 'self' since automatic calculation is never applied to teammates
  const derivedLevelForSelf = computed(() => {
    const tasks = metadataStore.tasks;
    if (!Array.isArray(tasks) || tasks.length === 0) return 1;
    const levels = metadataStore.playerLevels;
    if (!levels || levels.length === 0) return 1;
    const store = teamStores.value['self'];
    if (!store) return 1;
    const currentData = getGameModeData(store);
    const completions = currentData?.taskCompletions ?? {};
    const xpOffset = currentData?.xpOffset ?? 0;
    let calculatedQuestXP = 0;
    for (const task of tasks) {
      const completion = completions[task.id];
      const flags = getCompletionFlags(completion);
      if (flags.complete && !flags.failed) {
        calculatedQuestXP += task.experience || 0;
      }
    }
    const totalXP = calculatedQuestXP + xpOffset;
    let derivedLevel = 1;
    for (let i = levels.length - 1; i >= 0; i--) {
      const level = levels[i];
      if (level && totalXP >= level.exp) {
        derivedLevel = level.level;
        break;
      }
    }
    return derivedLevel;
  });
  /**
   * Calculate derived level from XP (only applies to 'self')
   */
  const calculateDerivedLevel = (): number => {
    return derivedLevelForSelf.value;
  };
  const getLevel = (teamId: string): number => {
    const storeKey = getTeamIndex(teamId);
    const store = teamStores.value[storeKey];
    const currentData = getGameModeData(store);
    // For the current user (self), check if automatic level calculation is enabled
    if (storeKey === 'self' && preferencesStore.getUseAutomaticLevelCalculation) {
      return calculateDerivedLevel();
    }
    // For teammates or when manual mode, use stored level
    return currentData?.level ?? 1;
  };
  const getFaction = (teamId: string): string => {
    const store = visibleTeamStores.value[teamId];
    const currentData = getGameModeData(store);
    return currentData?.pmcFaction ?? 'USEC';
  };
  const getTeammateStore = (teamId: string): Store<string, UserState> | null => {
    return teammateStores.value[teamId] || null;
  };
  const hasCompletedTask = (teamId: string, taskId: string): boolean => {
    const storeKey = getTeamIndex(teamId);
    const store = teamStores.value[storeKey];
    const currentData = getGameModeData(store);
    const taskCompletion = currentData?.taskCompletions?.[taskId];
    const flags = getCompletionFlags(taskCompletion);
    return flags.complete && !flags.failed;
  };
  const getTaskStatus = (teamId: string, taskId: string): 'completed' | 'failed' | 'incomplete' => {
    const storeKey = getTeamIndex(teamId);
    const store = teamStores.value[storeKey];
    const currentData = getGameModeData(store);
    const taskCompletion = currentData?.taskCompletions?.[taskId];
    return getTaskStatusFromFlags(taskCompletion);
  };
  const getProgressPercentage = (teamId: string, category: string): number => {
    const storeKey = getTeamIndex(teamId);
    const store = teamStores.value[storeKey];
    if (!store?.$state) return 0;
    // Get current gamemode data, with fallback to legacy structure
    const currentGameMode = store.$state.currentGameMode || GAME_MODES.PVP;
    const currentData = store.$state[currentGameMode] || store.$state;
    switch (category) {
      case 'tasks': {
        const totalTasks = Object.keys(currentData.taskCompletions || {}).length;
        const completedTasks = Object.values(currentData.taskCompletions || {}).filter(
          (completion) => getCompletionFlags(completion).complete
        ).length;
        return totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
      }
      case 'hideout': {
        const totalModules = Object.keys(currentData.hideoutModules || {}).length;
        const completedModules = Object.values(currentData.hideoutModules || {}).filter(
          (module) => module?.complete === true
        ).length;
        return totalModules > 0 ? (completedModules / totalModules) * 100 : 0;
      }
      default:
        return 0;
    }
  };
  const tasksState = computed<Record<string, TaskState>>(() => {
    const state: Record<string, TaskState> = {};
    const tasks = metadataStore.tasks as Task[];
    if (!tasks.length) return {};
    const store = teamStores.value['self'];
    const currentData = getGameModeData(store);
    const completions = currentData?.taskCompletions ?? {};
    for (const task of tasks) {
      const taskId = task.id;
      const completion = completions[taskId];
      if (isTaskComplete(completion)) {
        state[taskId] = TASK_STATE.COMPLETE;
      } else if (isTaskFailed(completion)) {
        state[taskId] = TASK_STATE.FAILED;
      } else if (isTaskActive(completion)) {
        state[taskId] = TASK_STATE.ACTIVE;
      } else if (unlockedTasks.value[taskId]?.['self']) {
        state[taskId] = TASK_STATE.AVAILABLE;
      } else {
        state[taskId] = TASK_STATE.LOCKED;
      }
    }
    return state;
  });
  const migrateDuplicateObjectiveProgress = (duplicateObjectiveIds: Map<string, string[]>) => {
    if (!duplicateObjectiveIds.size) return;
    const migrateObjectiveMap = (
      objectiveMap?: Record<string, { complete?: boolean; count?: number; timestamp?: number }>
    ) => {
      if (!objectiveMap) return objectiveMap;
      let updated = objectiveMap;
      duplicateObjectiveIds.forEach((newIds, originalId) => {
        const existing = updated[originalId];
        if (!existing) return;
        const merged = { ...updated };
        newIds.forEach((newId) => {
          if (!merged[newId]) {
            merged[newId] = { ...existing };
          }
        });
        const { [originalId]: _removed, ...rest } = merged;
        updated = rest;
      });
      return updated;
    };
    Object.values(teamStores.value).forEach((store) => {
      const pvpObjectives = store?.$state?.pvp?.taskObjectives;
      const pveObjectives = store?.$state?.pve?.taskObjectives;
      const nextPvpObjectives = migrateObjectiveMap(pvpObjectives);
      const nextPveObjectives = migrateObjectiveMap(pveObjectives);
      if (pvpObjectives && nextPvpObjectives && nextPvpObjectives !== pvpObjectives) {
        store.$state.pvp.taskObjectives = nextPvpObjectives;
      }
      if (pveObjectives && nextPveObjectives && nextPveObjectives !== pveObjectives) {
        store.$state.pve.taskObjectives = nextPveObjectives;
      }
    });
  };
  return {
    teamStores,
    visibleTeamStores,
    tasksCompletions,
    tasksFailed,
    tasksState,
    gameEditionData,
    traderLevelsAchieved,
    playerFaction,
    unlockedTasks,
    objectiveCompletions,
    invalidTasks,
    invalidObjectives,
    hideoutLevels,
    moduleCompletions,
    modulePartCompletions,
    getTeamIndex,
    getDisplayName,
    getLevel,
    getFaction,
    getTeammateStore,
    hasCompletedTask,
    getTaskStatus,
    getProgressPercentage,
    migrateDuplicateObjectiveProgress,
  };
});
