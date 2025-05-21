import { useLiveData } from '@/composables/livedata';
import { fireuser } from '@/plugins/firebase';
import { useUserStore } from '@/stores/user';
import { defineStore } from 'pinia';
import { useTarkovStore } from '@/stores/tarkov';
import type { Task } from '@/composables/tarkovdata';
import { tasks, traders, objectives, hideoutStations } from '@/composables/tarkovdata';
import { StoreGeneric } from 'pinia';
export const STASH_STATION_ID = '5d484fc0654e76006657e0ab';
export const CULTIST_CIRCLE_STATION_ID = '667298e75ea6b4493c08f266';
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
  { version: 5, value: 0.2, defaultStashLevel: 5 },
];
type TeamStoresMap = Record<string, StoreGeneric>;
type CompletionsMap = Record<string, Record<string, boolean>>;
type TraderLevelsMap = Record<string, Record<string, number>>;
type FactionMap = Record<string, string>;
type TaskAvailabilityMap = Record<string, Record<string, boolean>>;
type ObjectiveCompletionsMap = Record<string, Record<string, boolean>>;
type HideoutLevelMap = Record<string, Record<string, number>>;
type ProgressState = object;
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
// Define the Fireswap configuration type expected by the plugin
interface FireswapConfig {
  path: string;
  document: string;
  debouncems: number;
  localKey: string;
}
export const useProgressStore = defineStore('progress', {
  state: (): ProgressState => ({}),
  getters: {
    teamStores(_state: ProgressState): TeamStoresMap {
      const { teammateStores } = useLiveData();
      const stores: TeamStoresMap = {};
      stores['self'] = useTarkovStore();
      for (const teammateId of Object.keys(teammateStores.value)) {
        try {
          stores[teammateId] = teammateStores.value[teammateId];
        } catch (error) {
          console.error(`Failed to get store for teammate ${teammateId}:`, error);
        }
      }
      return stores;
    },
    visibleTeamStores(_state: ProgressState): TeamStoresMap {
      const userStore = useUserStore();
      const visibleStores: TeamStoresMap = {};
      Object.entries(this.teamStores).forEach(([teamId, store]) => {
        if (teamId === 'self' || !userStore.teamIsHidden(teamId)) {
          visibleStores[teamId] = store;
        }
      });
      return visibleStores;
    },
    tasksCompletions(_state: ProgressState): CompletionsMap {
      const completions: CompletionsMap = {};
      if (!tasks.value) return {};
      for (const task of tasks.value as Task[]) {
        completions[task.id] = {};
        for (const teamId of Object.keys(this.visibleTeamStores)) {
          const store = this.visibleTeamStores[teamId];
          completions[task.id][teamId] =
            store?.$state.taskCompletions?.[task.id]?.complete ?? false;
        }
      }
      return completions;
    },
    gameEditionData: () => gameEditions,
    traderLevelsAchieved(_state: ProgressState): TraderLevelsMap {
      const levels: TraderLevelsMap = {};
      if (!traders.value) return {};
      for (const teamId of Object.keys(this.visibleTeamStores)) {
        levels[teamId] = {};
        const store = this.visibleTeamStores[teamId];
        for (const trader of traders.value) {
          // TODO: Verify how trader level should be determined.
          // Using player level as a placeholder proxy for now as getTraderLevel is missing.
          levels[teamId][trader.id] = store?.$state.level ?? 0;
        }
      }
      return levels;
    },
    playerFaction(_state: ProgressState): FactionMap {
      const faction: FactionMap = {};
      for (const teamId of Object.keys(this.visibleTeamStores)) {
        const store = this.visibleTeamStores[teamId];
        faction[teamId] = store?.$state.pmcFaction ?? 'Unknown';
      }
      return faction;
    },
    unlockedTasks(
      this: ProgressState & ProgressGetters,
      _state: ProgressState
    ): TaskAvailabilityMap {
      const available: TaskAvailabilityMap = {};
      if (!tasks.value) return {};
      for (const task of tasks.value as Task[]) {
        available[task.id] = {};
        for (const teamId of Object.keys(this.visibleTeamStores)) {
          const store = this.visibleTeamStores[teamId];
          const playerLevel = store?.$state.level ?? 0;
          const playerFaction = this.playerFaction[teamId];
          const isTaskComplete = this.tasksCompletions[task.id]?.[teamId] ?? false;
          if (isTaskComplete) {
            available[task.id][teamId] = false;
            continue;
          }
          let failedReqsMet = true;
          if (task.failedRequirements) {
            for (const req of task.failedRequirements) {
              const failed = store?.$state.taskCompletions?.[req.task.id]?.failed ?? false;
              if (failed) {
                failedReqsMet = false;
                break;
              }
            }
          }
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
              const currentTraderLevel = this.traderLevelsAchieved[teamId]?.[req.trader.id] ?? 0;
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
          let prereqsMet = true;
          if (task.taskRequirements) {
            for (const req of task.taskRequirements) {
              const isPrereqComplete = this.tasksCompletions[req.task.id]?.[teamId] ?? false;
              if (!isPrereqComplete) {
                prereqsMet = false;
                break;
              }
            }
          }
          if (!prereqsMet) {
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
    },
    objectiveCompletions(_state: ProgressState): ObjectiveCompletionsMap {
      const completions: ObjectiveCompletionsMap = {};
      if (!objectives.value) return {};
      for (const objective of objectives.value) {
        completions[objective.id] = {};
        for (const teamId of Object.keys(this.visibleTeamStores)) {
          const store = this.visibleTeamStores[teamId];
          completions[objective.id][teamId] =
            store?.$state.taskObjectives?.[objective.id]?.complete ?? false;
        }
      }
      return completions;
    },
    hideoutLevels(_state: ProgressState): HideoutLevelMap {
      const levels: HideoutLevelMap = {};
      if (!hideoutStations.value) return {};
      for (const station of hideoutStations.value) {
        if (!station || !station.id) continue;
        levels[station.id] = {};
        for (const teamId of Object.keys(this.visibleTeamStores)) {
          const store = this.visibleTeamStores[teamId];
          const modulesState = store?.$state.hideoutModules ?? {};
          let maxManuallyCompletedLevel = 0;
          if (station.levels && Array.isArray(station.levels)) {
            for (const lvl of station.levels) {
              if (
                lvl &&
                lvl.id &&
                modulesState[lvl.id]?.complete &&
                typeof lvl.level === 'number'
              ) {
                maxManuallyCompletedLevel = Math.max(maxManuallyCompletedLevel, lvl.level);
              }
            }
          }
          let currentStationDisplayLevel;
          if (station.id === STASH_STATION_ID) {
            const gameEditionVersion = store?.$state.gameEdition ?? 0;
            const edition = this.gameEditionData.find(
              (e: GameEdition) => e.version === gameEditionVersion
            );
            const defaultStashFromEdition = edition?.defaultStashLevel ?? 0;
            const maxLevel = station.levels?.length || 0;
            // Set to min(defaultStashFromEdition, maxLevel)
            const effectiveStashLevel = Math.min(defaultStashFromEdition, maxLevel);
            if (effectiveStashLevel === maxLevel) {
              currentStationDisplayLevel = maxLevel;
            } else {
              currentStationDisplayLevel = Math.max(effectiveStashLevel, maxManuallyCompletedLevel);
            }
          } else if (station.id === CULTIST_CIRCLE_STATION_ID) {
            const gameEditionVersion = store?.$state.gameEdition ?? 0;
            // If Unheard Edition (5), always max this station
            if (gameEditionVersion === 5 && station.levels && station.levels.length > 0) {
              currentStationDisplayLevel = station.levels.length;
            } else {
              currentStationDisplayLevel = maxManuallyCompletedLevel;
            }
          } else {
            currentStationDisplayLevel = maxManuallyCompletedLevel;
          }
          levels[station.id][teamId] = currentStationDisplayLevel;
        }
      }
      return levels;
    },
    getTeamIndex(_state: ProgressState) {
      return (teamId: string): number => {
        const index = Object.keys(this.visibleTeamStores).indexOf(teamId);
        return index > -1 ? index : 0;
      };
    },
    getDisplayName(_state: ProgressState) {
      return (teamId: string): string => {
        if (teamId === fireuser.uid || teamId === 'self') {
          const selfStore = this.teamStores['self'];
          const storedDisplayName = selfStore?.$state.displayName;
          if (storedDisplayName) {
            return storedDisplayName;
          } else {
            // If the stored display name is null (e.g., after being cleared),
            // fall back to a shortened UID, then the full teamId (UID or 'self') as a last resort.
            // This ensures the card shows a UID-based name when cleared, not fireuser.displayName.
            return fireuser.uid?.substring(0, 6) ?? teamId;
          }
        }
        const store = this.teamStores[teamId];
        return store?.$state.displayName ?? teamId.substring(0, 6) ?? teamId;
      };
    },
    getLevel(_state: ProgressState) {
      return (teamId: string): number => {
        if (teamId === fireuser.uid || teamId === 'self') {
          const selfStore = this.teamStores['self'];
          return selfStore?.$state.level ?? 1;
        }
        const store = this.visibleTeamStores[teamId];
        return store?.$state.level ?? 1;
      };
    },
    getFaction(_state: ProgressState) {
      return (teamId: string): string => {
        const store = this.visibleTeamStores[teamId];
        return store?.$state.pmcFaction ?? 'Unknown';
      };
    },
  },
  actions: {},
  fireswap: [
    {
      path: '.',
      document: 'userProgress/{uid}',
      debouncems: 500,
      localKey: 'userProgress',
    },
  ] as FireswapConfig[],
});
