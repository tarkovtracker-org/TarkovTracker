import { useLiveData } from '@/composables/livedata';
import { useTarkovData } from '@/composables/tarkovdata';
import { fireuser } from '@/plugins/firebase';
import { useUserStore } from '@/stores/user';
import { defineStore, type Store } from 'pinia';
import { computed, type Ref } from 'vue';
import { useTarkovStore } from '@/stores/tarkov';
// import type { Task, Trader, HideoutStation, Objective } from '@/types/tarkov'; // Removed
// Import UserState for correct typing
import { UserState } from '@/shared_state';

// Remove incorrect local definition - useLiveData provides the correctly typed Ref
// interface TeammateStores {
//   [teammateId: string]: () => Store; // Function returning a store instance
// }

// Correctly destructure teammateStores from useLiveData() result
const { teammateStores } = useLiveData();
const userStore = useUserStore();

// Define type for game edition data
interface GameEdition {
  version: number;
  value: number;
  defaultStashLevel: number;
}

const gameEditions: GameEdition[] = [
  { version: 1, value: 0.0, defaultStashLevel: 1 },
  { version: 2, value: 0.0, defaultStashLevel: 2 },
  { version: 3, value: 0.2, defaultStashLevel: 3 },
  { version: 4, value: 0.2, defaultStashLevel: 4 },
];

// Define types for computed properties return values
// Use imported UserState for Store type
type TeamStoresMap = Record<string, Store<string, UserState>>;
type CompletionsMap = Record<string, Record<string, boolean>>;
type TraderRepMap = Record<string, Record<string, number>>;
type TraderLevelsMap = Record<string, Record<string, any>>;
type FactionMap = Record<string, string>;
type TaskAvailabilityMap = Record<string, Record<string, boolean>>;
type ObjectiveCompletionsMap = Record<string, Record<string, boolean>>;
type HideoutLevelMap = Record<string, Record<string, number>>;

export const useProgressStore = defineStore('progress', () => {
  // Use 'any' for destructured types
  const { tasks, traders, hideoutStations, objectives } = useTarkovData() as {
    tasks: Ref<any[]>;
    traders: Ref<any[]>;
    hideoutStations: Ref<any[]>;
    objectives: Ref<any[]>;
  };

  // Replace top-level const with a function
  const getTarkovStoreSelf = () => useTarkovStore();

  const teamStores = computed((): TeamStoresMap => {
    const stores: TeamStoresMap = {};
    // Use the function to get the store instance
    stores['self'] = getTarkovStoreSelf() as Store<string, UserState>;
    for (const teammateId of Object.keys(teammateStores.value)) {
      try {
        stores[teammateId] = teammateStores.value[teammateId];
      } catch (error) {
        console.error(`Failed to get store for teammate ${teammateId}:`, error);
      }
    }
    return stores;
  });

  const visibleTeamStores = computed((): TeamStoresMap => {
    const visibleStores: TeamStoresMap = {};
    Object.entries(teamStores.value).forEach(([teamId, store]) => {
      if (teamId === 'self' || !userStore.teamIsHidden(teamId)) {
        visibleStores[teamId] = store;
      }
    });
    return visibleStores;
  });

  const tasksCompletions = computed((): CompletionsMap => {
    const completions: CompletionsMap = {};
    if (!tasks.value) return {};
    for (const task of tasks.value) {
      completions[task.id] = {};
      for (const teamId of Object.keys(visibleTeamStores.value)) {
        const store = visibleTeamStores.value[teamId];
        completions[task.id][teamId] =
          typeof (store as any)?.isTaskComplete === 'function'
            ? (store as any).isTaskComplete(task.id)
            : false;
      }
    }
    return completions;
  });

  const traderRep = computed((): TraderRepMap => {
    const rep: TraderRepMap = {};
    if (!traders.value) return {};
    for (const teamId of Object.keys(visibleTeamStores.value)) {
      rep[teamId] = {};
      const store = visibleTeamStores.value[teamId] as any;
      const gameEditionVersion = store?.gameEdition ?? 0;
      const bonus =
        gameEditions.find((e) => e.version === gameEditionVersion)?.value ??
        0.0;
      for (const trader of traders.value) {
        rep[teamId][trader.id] = bonus;
      }
      if (!tasks.value) continue;
      for (const task of tasks.value) {
        if (tasksCompletions.value[task.id]?.[teamId]) {
          // Add 'any' type
          task.finishRewards?.traderStanding?.forEach((standing: any) => {
            if (standing.trader?.id) {
              rep[teamId][standing.trader.id] =
                (rep[teamId][standing.trader.id] ?? 0) +
                (standing.standing ?? 0);
            }
          });
        }
      }
    }
    return rep;
  });
  const gameEditionData = computed((): GameEdition[] => {
    return gameEditions;
  });
  const traderLevelsAchieved = computed((): TraderLevelsMap => {
    const levels: TraderLevelsMap = {};
    if (!traders.value) return {};
    for (const teamId of Object.keys(visibleTeamStores.value)) {
      levels[teamId] = {};
      const store = visibleTeamStores.value[teamId] as any;
      const playerLevel = store?.playerLevel ?? 0;
      for (const trader of traders.value) {
        levels[teamId][trader.id] = 1;
        const currentRep = traderRep.value[teamId]?.[trader.id] ?? -Infinity;
        // Add 'any' type
        trader.levels?.forEach((level: any) => {
          if (
            currentRep >= level.requiredReputation &&
            playerLevel >= level.requiredPlayerLevel &&
            level.level > levels[teamId][trader.id]
          ) {
            levels[teamId][trader.id] = level.level;
          }
        });
      }
    }
    return levels;
  });
  const playerFaction = computed((): FactionMap => {
    const faction: FactionMap = {};
    for (const teamId of Object.keys(visibleTeamStores.value)) {
      const store = visibleTeamStores.value[teamId] as any;
      faction[teamId] =
        typeof store?.getPMCFaction === 'string'
          ? store.getPMCFaction
          : 'Unknown';
    }
    return faction;
  });
  const unlockedTasks = computed((): TaskAvailabilityMap => {
    const available: TaskAvailabilityMap = {};
    if (!tasks.value) return {};
    for (const task of tasks.value) {
      available[task.id] = {};
      for (const teamId of Object.keys(visibleTeamStores.value)) {
        const store = visibleTeamStores.value[teamId] as any;
        const playerLevel = store?.playerLevel ?? 0;
        const playerFaction = store?.getPMCFaction ?? 'Unknown';
        const isTaskComplete =
          tasksCompletions.value[task.id]?.[teamId] ?? false;
        if (isTaskComplete) {
          available[task.id][teamId] = false;
          continue;
        }
        let parentsComplete = true;
        if (task.parents) {
          for (const parentId of task.parents) {
            if (!tasksCompletions.value[parentId]?.[teamId]) {
              parentsComplete = false;
              break;
            }
          }
        }
        if (!parentsComplete) {
          available[task.id][teamId] = false;
          continue;
        }
        let failedReqsMet = true;
        // Add 'any' type
        task.taskRequirements?.forEach((req: any) => {
          if (req.status.includes('failed') && req.status.length === 1) {
            const isFailed =
              typeof store?.isTaskFailed === 'function'
                ? store.isTaskFailed(req.task.id)
                : false;
            if (!isFailed) {
              failedReqsMet = false;
            }
          }
        });
        if (!failedReqsMet) {
          available[task.id][teamId] = false;
          continue;
        }
        if (task.minPlayerLevel && playerLevel < task.minPlayerLevel) {
          available[task.id][teamId] = false;
          continue;
        }
        let traderLevelsMet = true;
        if (task.traderLevelRequirements) {
          for (const req of task.traderLevelRequirements) {
            // Assuming req here has trader.id and level
            const currentTraderLevel =
              traderLevelsAchieved.value[teamId]?.[req.trader.id] ?? 0;
            if (currentTraderLevel < req.level) {
              traderLevelsMet = false;
              break;
            }
          }
        }
        if (!traderLevelsMet) {
          available[task.id][teamId] = false;
          continue;
        }
        if (
          task.factionName &&
          task.factionName !== 'Any' &&
          task.factionName !== playerFaction
        ) {
          available[task.id][teamId] = false;
          continue;
        }

        available[task.id][teamId] = true;
      }
    }
    return available;
  });

  const objectiveCompletions = computed((): ObjectiveCompletionsMap => {
    const completions: ObjectiveCompletionsMap = {};
    if (!objectives.value) return {};

    for (const objective of objectives.value) {
      completions[objective.id] = {};
      for (const teamId of Object.keys(visibleTeamStores.value)) {
        const store = visibleTeamStores.value[teamId] as any;
        completions[objective.id][teamId] =
          typeof store?.isObjectiveComplete === 'function'
            ? store.isObjectiveComplete(objective.id)
            : false;
      }
    }
    return completions;
  });

  const hideoutLevels = computed((): HideoutLevelMap => {
    const levels: HideoutLevelMap = {};
    if (!hideoutStations.value) return {};
    for (const station of hideoutStations.value) {
      levels[station.id] = {};
      for (const teamId of Object.keys(visibleTeamStores.value)) {
        const store = visibleTeamStores.value[teamId] as any;
        const modulesState = store.hideoutModules || {};
        const baseCount = station.levels.filter(
          (lvl: any) => modulesState[lvl.id]?.complete
        ).length;
        let levelCount = baseCount;
        if (station.id === '5d484fc0654e76006657e0ab') {
          const gameEditionVersion = store?.gameEdition ?? 0;
          const edition = gameEditionData.value.find(
            (e) => e.version === gameEditionVersion
          );
          levelCount = edition?.defaultStashLevel ?? baseCount;
        }
        levels[station.id][teamId] = levelCount;
      }
    }
    return levels;
  });

  const getTeamIndex = function (teamId: string): number {
    const index = Object.keys(visibleTeamStores.value).indexOf(teamId);
    return index > -1 ? index : 0;
  };

  const getDisplayName = function (teamId: string): string {
    if (teamId === 'self') {
      // Corrected: access displayName directly
      return fireuser.displayName ?? 'You';
    }
    const store = visibleTeamStores.value[teamId] as any;
    return store?.displayName ?? teamId;
  };

  const getLevel = function (teamId: string): number {
    const store = visibleTeamStores.value[teamId] as any;
    return store?.playerLevel ?? 0;
  };

  const getFaction = function (teamId: string): string {
    const store = visibleTeamStores.value[teamId] as any;
    return typeof store?.getPMCFaction === 'string'
      ? store.getPMCFaction
      : 'Unknown';
  };

  return {
    teamStores,
    visibleTeamStores,
    tasksCompletions,
    traderRep,
    gameEditionData,
    traderLevelsAchieved,
    playerFaction,
    unlockedTasks,
    objectiveCompletions,
    hideoutLevels,
    getTeamIndex,
    getDisplayName,
    getLevel,
    getFaction,
  };
});

// Add fireswap config after definition for localStorage persistence
useProgressStore.fireswap = [
  {
    path: '.',
    document: 'progress/{uid}',
    debouncems: 250,
    localKey: 'progress',
  },
];
