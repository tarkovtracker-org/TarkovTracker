/**
 * User Progress State Definition
 *
 * Defines the core state structure, getters, and actions for tracking
 * user progress in Escape from Tarkov (tasks, hideout, levels, traders).
 *
 * This module is shared between:
 * - Main tarkov store (user's own progress)
 * - Teammate stores (dynamically created for each team member)
 *
 * Supports dual game mode tracking (PVP and PVE) with separate progress data.
 * Each game mode maintains its own independent progress: level, faction, tasks,
 * hideout modules, and trader relationships.
 *
 * @module stores/userProgressState
 */
import { GAME_MODES, type GameMode } from '@/utils/constants';
import type { _GettersTree } from 'pinia';
// State interfaces
interface TaskObjective {
  count?: number;
  complete?: boolean;
  timestamp?: number;
}
interface TaskCompletion {
  complete?: boolean;
  failed?: boolean;
  timestamp?: number;
}
interface HideoutPart {
  count?: number;
  complete?: boolean;
  timestamp?: number;
}
interface HideoutModule {
  complete?: boolean;
  timestamp?: number;
}
export interface ApiTaskUpdate {
  id: string;
  state: 'completed' | 'failed' | 'uncompleted';
}
export interface ApiUpdateMeta {
  id: string;
  at: number;
  source: 'api';
  tasks?: ApiTaskUpdate[];
}
export interface TraderProgress {
  level: number;
  reputation: number;
}
export interface UserProgressData {
  level: number;
  pmcFaction: 'USEC' | 'BEAR';
  displayName: string | null;
  xpOffset: number;
  taskObjectives: { [objectiveId: string]: TaskObjective };
  taskCompletions: { [taskId: string]: TaskCompletion };
  hideoutParts: { [objectiveId: string]: HideoutPart };
  hideoutModules: { [hideoutId: string]: HideoutModule };
  traders: { [traderId: string]: TraderProgress };
  skills: { [skillName: string]: number };
  prestigeLevel: number; // 0-6, default 0
  skillOffsets: { [skillName: string]: number }; // manual adjustments per skill
  lastApiUpdate?: ApiUpdateMeta;
}
export interface UserState {
  currentGameMode: GameMode;
  gameEdition: number;
  pvp: UserProgressData;
  pve: UserProgressData;
}
const defaultProgressData: UserProgressData = {
  level: 1,
  pmcFaction: 'USEC',
  displayName: null,
  xpOffset: 0,
  taskObjectives: {},
  taskCompletions: {},
  hideoutParts: {},
  hideoutModules: {},
  traders: {},
  skills: {},
  prestigeLevel: 0,
  skillOffsets: {},
};
export const defaultState: UserState = {
  currentGameMode: GAME_MODES.PVP,
  gameEdition: 1,
  pvp: JSON.parse(JSON.stringify(defaultProgressData)),
  pve: JSON.parse(JSON.stringify(defaultProgressData)),
};
// Migration function to convert legacy data structure to new gamemode-aware structure
export function migrateToGameModeStructure(legacyData: unknown): UserState {
  // If already in new format and properly structured, return as-is
  if (
    legacyData &&
    typeof legacyData === 'object' &&
    'currentGameMode' in legacyData &&
    'pvp' in legacyData &&
    'pve' in legacyData
  ) {
    const data = legacyData as Record<string, unknown>;
    // Ensure the structure is complete
    const pvpData = {
      ...defaultProgressData,
      ...(data.pvp as Record<string, unknown>),
    };
    const pveData = {
      ...defaultProgressData,
      ...(data.pve as Record<string, unknown>),
    };
    return {
      currentGameMode: (data.currentGameMode as GameMode) || GAME_MODES.PVP,
      gameEdition: (data.gameEdition as number) || defaultState.gameEdition,
      pvp: pvpData,
      pve: pveData,
    };
  }
  // Handle partial migration case - has currentGameMode but missing pvp/pve structure
  if (
    legacyData &&
    typeof legacyData === 'object' &&
    'currentGameMode' in legacyData &&
    !('pvp' in legacyData && !('pve' in legacyData))
  ) {
    const data = legacyData as Record<string, unknown>;
    // This is a partially migrated state, use the existing data as legacy format
    const migratedProgressData: UserProgressData = {
      level: (data.level as number) || defaultProgressData.level,
      pmcFaction: (data.pmcFaction as 'USEC' | 'BEAR') || defaultProgressData.pmcFaction,
      displayName: (data.displayName as string) || defaultProgressData.displayName,
      xpOffset: (data.xpOffset as number) || defaultProgressData.xpOffset,
      taskCompletions: (data.taskCompletions as UserProgressData['taskCompletions']) || {},
      taskObjectives: (data.taskObjectives as UserProgressData['taskObjectives']) || {},
      hideoutParts: (data.hideoutParts as UserProgressData['hideoutParts']) || {},
      hideoutModules: (data.hideoutModules as UserProgressData['hideoutModules']) || {},
      traders: (data.traders as UserProgressData['traders']) || {},
      skills: (data.skills as UserProgressData['skills']) || {},
      prestigeLevel: (data.prestigeLevel as number) || defaultProgressData.prestigeLevel,
      skillOffsets: (data.skillOffsets as UserProgressData['skillOffsets']) || {},
    };
    return {
      currentGameMode: data.currentGameMode as GameMode,
      gameEdition: (data.gameEdition as number) || defaultState.gameEdition,
      pvp: migratedProgressData,
      pve: JSON.parse(JSON.stringify(defaultProgressData)),
    };
  }
  // Create new structure with migrated data from legacy format
  const data = (legacyData as Record<string, unknown>) || {};
  const migratedProgressData: UserProgressData = {
    level: (data.level as number) || defaultProgressData.level,
    pmcFaction: (data.pmcFaction as 'USEC' | 'BEAR') || defaultProgressData.pmcFaction,
    displayName: (data.displayName as string) || defaultProgressData.displayName,
    xpOffset: (data.xpOffset as number) || defaultProgressData.xpOffset,
    taskCompletions: (data.taskCompletions as UserProgressData['taskCompletions']) || {},
    taskObjectives: (data.taskObjectives as UserProgressData['taskObjectives']) || {},
    hideoutParts: (data.hideoutParts as UserProgressData['hideoutParts']) || {},
    hideoutModules: (data.hideoutModules as UserProgressData['hideoutModules']) || {},
    traders: (data.traders as UserProgressData['traders']) || {},
    skills: (data.skills as UserProgressData['skills']) || {},
    prestigeLevel: (data.prestigeLevel as number) || defaultProgressData.prestigeLevel,
    skillOffsets: (data.skillOffsets as UserProgressData['skillOffsets']) || {},
  };
  return {
    currentGameMode: GAME_MODES.PVP, // Default to PvP for existing users
    gameEdition: (data.gameEdition as number) || defaultState.gameEdition,
    pvp: migratedProgressData,
    pve: JSON.parse(JSON.stringify(defaultProgressData)), // Fresh PvE data
  };
}
// Helper to get current gamemode data
const getCurrentData = (state: UserState): UserProgressData => {
  // Handle case where state might not be fully migrated yet
  if (!state.currentGameMode || !state[state.currentGameMode]) {
    // If we don't have gamemode structure, try to return legacy data
    const legacyState = state as unknown as Record<string, unknown>;
    if (
      legacyState.level !== undefined ||
      legacyState.taskCompletions ||
      legacyState.taskObjectives
    ) {
      return legacyState as unknown as UserProgressData; // Cast to UserProgressData for legacy compatibility
    }
    // Otherwise return default structure
    return {
      level: 1,
      pmcFaction: 'USEC',
      displayName: null,
      xpOffset: 0,
      taskCompletions: {},
      taskObjectives: {},
      hideoutParts: {},
      hideoutModules: {},
      traders: {},
      skills: {},
      prestigeLevel: 0,
      skillOffsets: {},
    };
  }
  return state[state.currentGameMode];
};
// Simplified getters using arrow functions
export const getters = {
  getCurrentGameMode: (state: UserState) => () => state.currentGameMode || GAME_MODES.PVP,
  playerLevel: (state: UserState) => () => getCurrentData(state).level ?? 1,
  getGameEdition: (state: UserState) => () => state.gameEdition ?? 1,
  getPMCFaction: (state: UserState) => () => getCurrentData(state).pmcFaction ?? 'USEC',
  getDisplayName: (state: UserState) => () => {
    const currentData = getCurrentData(state);
    return currentData.displayName === '' ? null : (currentData.displayName ?? null);
  },
  getObjectiveCount: (state: UserState) => (objectiveId: string) =>
    getCurrentData(state)?.taskObjectives?.[objectiveId]?.count ?? 0,
  getHideoutPartCount: (state: UserState) => (objectiveId: string) =>
    getCurrentData(state)?.hideoutParts?.[objectiveId]?.count ?? 0,
  isTaskComplete: (state: UserState) => (taskId: string) =>
    getCurrentData(state)?.taskCompletions?.[taskId]?.complete ?? false,
  isTaskFailed: (state: UserState) => (taskId: string) =>
    getCurrentData(state)?.taskCompletions?.[taskId]?.failed ?? false,
  isTaskObjectiveComplete: (state: UserState) => (objectiveId: string) =>
    getCurrentData(state)?.taskObjectives?.[objectiveId]?.complete ?? false,
  isHideoutPartComplete: (state: UserState) => (objectiveId: string) =>
    getCurrentData(state)?.hideoutParts?.[objectiveId]?.complete ?? false,
  isHideoutModuleComplete: (state: UserState) => (hideoutId: string) =>
    getCurrentData(state)?.hideoutModules?.[hideoutId]?.complete ?? false,
  getCurrentProgressData: (state: UserState) => () => getCurrentData(state),
  getPvPProgressData: (state: UserState) => () => state.pvp,
  getPvEProgressData: (state: UserState) => () => state.pve,
  getTraderLevel: (state: UserState) => (traderId: string) =>
    getCurrentData(state)?.traders?.[traderId]?.level ?? 1,
  getTraderReputation: (state: UserState) => (traderId: string) =>
    getCurrentData(state)?.traders?.[traderId]?.reputation ?? 0,
  getSkillLevel: (state: UserState) => (skillName: string) =>
    getCurrentData(state)?.skills?.[skillName] ?? 0,
  getXpOffset: (state: UserState) => () => getCurrentData(state)?.xpOffset ?? 0,
  getPrestigeLevel: (state: UserState) => () => getCurrentData(state)?.prestigeLevel ?? 0,
  getSkillOffset: (state: UserState) => (skillName: string) =>
    getCurrentData(state)?.skillOffsets?.[skillName] ?? 0,
  getAllSkillOffsets: (state: UserState) => () => getCurrentData(state)?.skillOffsets ?? {},
} as const satisfies _GettersTree<UserState>;
// Helper functions for common operations
const createCompletion = (complete: boolean, failed = false) => ({
  complete,
  failed,
  timestamp: Date.now(),
});
const updateObjective = (
  state: UserState,
  key: keyof UserProgressData,
  objectiveId: string,
  updates: Record<string, unknown>
) => {
  const currentData = getCurrentData(state);
  const stateValue = currentData[key];
  if (!stateValue || typeof stateValue !== 'object') {
    (currentData[key] as Record<string, unknown>) = {};
  }
  const stateObj = currentData[key] as Record<string, unknown>;
  const existing = stateObj[objectiveId];
  stateObj[objectiveId] = {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...updates,
  };
};
// Simplified actions
export const actions = {
  switchGameMode(this: UserState, mode: GameMode) {
    this.currentGameMode = mode;
  },
  incrementLevel(this: UserState) {
    const currentData = getCurrentData(this);
    currentData.level = currentData.level ? currentData.level + 1 : 2;
  },
  decrementLevel(this: UserState) {
    const currentData = getCurrentData(this);
    currentData.level = Math.max(1, (currentData.level || 1) - 1);
  },
  setLevel(this: UserState, level: number) {
    const currentData = getCurrentData(this);
    currentData.level = Math.max(1, level);
  },
  setGameEdition(this: UserState, edition: number) {
    this.gameEdition = edition;
  },
  setPMCFaction(this: UserState, faction: 'USEC' | 'BEAR') {
    const currentData = getCurrentData(this);
    currentData.pmcFaction = faction;
  },
  setDisplayName(this: UserState, name: string | null) {
    const currentData = getCurrentData(this);
    currentData.displayName = typeof name === 'string' ? name : null;
  },
  setXpOffset(this: UserState, offset: number) {
    const currentData = getCurrentData(this);
    currentData.xpOffset = Number.isFinite(offset) ? Math.trunc(offset) : 0;
  },
  setPrestigeLevel(this: UserState, level: number) {
    const currentData = getCurrentData(this);
    currentData.prestigeLevel = Math.max(0, Math.min(6, level)); // Clamp 0-6
  },
  setSkillOffset(this: UserState, skillName: string, offset: number) {
    const currentData = getCurrentData(this);
    if (!currentData.skillOffsets) {
      currentData.skillOffsets = {};
    }
    currentData.skillOffsets[skillName] = Number.isFinite(offset) ? offset : 0;
  },
  resetSkillOffset(this: UserState, skillName: string) {
    const currentData = getCurrentData(this);
    if (currentData.skillOffsets) {
      const { [skillName]: _, ...rest } = currentData.skillOffsets;
      currentData.skillOffsets = rest;
    }
  },
  setObjectiveCount(this: UserState, objectiveId: string, count: number) {
    updateObjective(this, 'taskObjectives', objectiveId, {
      count: Math.max(0, count),
    });
  },
  setTaskObjectiveCountWithStatus(
    this: UserState,
    objectiveId: string,
    count: number,
    isComplete: boolean
  ) {
    const updates: Record<string, unknown> = {
      count: Math.max(0, count),
      complete: isComplete,
    };
    if (isComplete) {
      updates.timestamp = Date.now();
    }
    updateObjective(this, 'taskObjectives', objectiveId, updates);
  },
  setHideoutPartCount(this: UserState, objectiveId: string, count: number) {
    updateObjective(this, 'hideoutParts', objectiveId, {
      count: Math.max(0, count),
    });
  },
  setTaskComplete(this: UserState, taskId: string) {
    updateObjective(this, 'taskCompletions', taskId, createCompletion(true, false));
  },
  setTaskFailed(this: UserState, taskId: string) {
    updateObjective(this, 'taskCompletions', taskId, createCompletion(true, true));
  },
  setTaskUncompleted(this: UserState, taskId: string) {
    updateObjective(this, 'taskCompletions', taskId, createCompletion(false, false));
  },
  setTaskObjectiveComplete(this: UserState, objectiveId: string) {
    updateObjective(this, 'taskObjectives', objectiveId, {
      complete: true,
      timestamp: Date.now(),
    });
  },
  setTaskObjectiveUncomplete(this: UserState, objectiveId: string) {
    updateObjective(this, 'taskObjectives', objectiveId, { complete: false });
  },
  toggleTaskObjectiveComplete(this: UserState, objectiveId: string) {
    const isComplete = getters.isTaskObjectiveComplete(this)(objectiveId);
    if (isComplete) {
      actions.setTaskObjectiveUncomplete.call(this, objectiveId);
    } else {
      actions.setTaskObjectiveComplete.call(this, objectiveId);
    }
  },
  setHideoutPartComplete(this: UserState, objectiveId: string) {
    updateObjective(this, 'hideoutParts', objectiveId, {
      complete: true,
      timestamp: Date.now(),
    });
  },
  setHideoutPartUncomplete(this: UserState, objectiveId: string) {
    updateObjective(this, 'hideoutParts', objectiveId, { complete: false });
  },
  toggleHideoutPartComplete(this: UserState, objectiveId: string) {
    const isComplete = getters.isHideoutPartComplete(this)(objectiveId);
    if (isComplete) {
      actions.setHideoutPartUncomplete.call(this, objectiveId);
    } else {
      actions.setHideoutPartComplete.call(this, objectiveId);
    }
  },
  setHideoutModuleComplete(this: UserState, hideoutId: string) {
    updateObjective(this, 'hideoutModules', hideoutId, {
      complete: true,
      timestamp: Date.now(),
    });
  },
  setHideoutModuleUncomplete(this: UserState, hideoutId: string) {
    updateObjective(this, 'hideoutModules', hideoutId, { complete: false });
  },
  toggleHideoutModuleComplete(this: UserState, hideoutId: string) {
    const isComplete = getters.isHideoutModuleComplete(this)(hideoutId);
    if (isComplete) {
      actions.setHideoutModuleUncomplete.call(this, hideoutId);
    } else {
      actions.setHideoutModuleComplete.call(this, hideoutId);
    }
  },
  setTraderLevel(this: UserState, traderId: string, level: number) {
    updateObjective(this, 'traders', traderId, { level: Math.max(1, level) });
  },
  setTraderReputation(this: UserState, traderId: string, reputation: number) {
    updateObjective(this, 'traders', traderId, { reputation: reputation });
  },
  setSkillLevel(this: UserState, skillName: string, level: number) {
    updateObjective(this, 'skills', skillName, { level: level });
  },
} as const;
export type UserActions = typeof actions;
