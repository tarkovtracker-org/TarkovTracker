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
import {
  isTaskComplete as isTaskCompletionComplete,
  isTaskFailed as isTaskCompletionFailed,
  type RawTaskCompletion,
} from '@/utils/taskStatus';
import type { TaskCompletion, UserProgressData } from '@/types/progress';
import type { _GettersTree } from 'pinia';
export type { ApiTaskUpdate, ApiUpdateMeta, UserProgressData } from '@/types/progress';
export interface UserState {
  currentGameMode: GameMode;
  gameEdition: number;
  tarkovUid: number | null;
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
  storyChapters: {},
};
export const defaultState: UserState = {
  currentGameMode: GAME_MODES.PVP,
  gameEdition: 1,
  tarkovUid: null,
  pvp: structuredClone(defaultProgressData),
  pve: structuredClone(defaultProgressData),
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
      tarkovUid: (data.tarkovUid as number | null) ?? null,
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
      storyChapters: (data.storyChapters as UserProgressData['storyChapters']) || {},
    };
    return {
      currentGameMode: data.currentGameMode as GameMode,
      gameEdition: (data.gameEdition as number) || defaultState.gameEdition,
      tarkovUid: (data.tarkovUid as number | null) ?? null,
      pvp: migratedProgressData,
      pve: structuredClone(defaultProgressData),
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
    storyChapters: (data.storyChapters as UserProgressData['storyChapters']) || {},
  };
  return {
    currentGameMode: GAME_MODES.PVP, // Default to PvP for existing users
    gameEdition: (data.gameEdition as number) || defaultState.gameEdition,
    tarkovUid: null,
    pvp: migratedProgressData,
    pve: structuredClone(defaultProgressData),
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
      storyChapters: {},
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
    isTaskCompletionComplete(getCurrentData(state)?.taskCompletions?.[taskId] as RawTaskCompletion),
  isTaskFailed: (state: UserState) => (taskId: string) =>
    isTaskCompletionFailed(getCurrentData(state)?.taskCompletions?.[taskId] as RawTaskCompletion),
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
  getTarkovUid: (state: UserState) => () => state.tarkovUid ?? null,
  getTarkovDevProfile: (state: UserState) => () => getCurrentData(state)?.tarkovDevProfile ?? null,
  isStoryChapterComplete: (state: UserState) => (chapterId: string) =>
    getCurrentData(state)?.storyChapters?.[chapterId]?.complete ?? false,
  isStoryObjectiveComplete: (state: UserState) => (chapterId: string, objectiveId: string) =>
    getCurrentData(state)?.storyChapters?.[chapterId]?.objectives?.[objectiveId]?.complete ?? false,
} as const satisfies _GettersTree<UserState>;
// Helper functions for common operations
const createCompletion = (complete: boolean, failed = false, manual?: boolean) => {
  const completion: TaskCompletion = {
    complete,
    failed,
    timestamp: Date.now(),
  };
  if (typeof manual === 'boolean') {
    completion.manual = manual;
  }
  return completion;
};
type ProgressObjectKey = {
  [Key in keyof UserProgressData]-?: UserProgressData[Key] extends Record<string, infer Value>
    ? Value extends object
      ? Key
      : never
    : never;
}[keyof UserProgressData];
type ProgressObjectEntry<Key extends ProgressObjectKey> =
  UserProgressData[Key] extends Record<string, infer Value> ? Value : never;
const updateObjective = <Key extends ProgressObjectKey>(
  state: UserState,
  key: Key,
  objectiveId: string,
  updates: Partial<ProgressObjectEntry<Key>>
) => {
  const currentData = getCurrentData(state);
  const stateObj = currentData[key] as Record<string, ProgressObjectEntry<Key>>;
  const existing = stateObj[objectiveId];
  stateObj[objectiveId] = {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...updates,
  } as ProgressObjectEntry<Key>;
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
    updateObjective(this, 'taskCompletions', taskId, createCompletion(true, false, false));
  },
  setTaskFailed(this: UserState, taskId: string, options?: { manual?: boolean }) {
    updateObjective(this, 'taskCompletions', taskId, createCompletion(true, true, options?.manual));
  },
  setTaskUncompleted(this: UserState, taskId: string) {
    updateObjective(this, 'taskCompletions', taskId, createCompletion(false, false, false));
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
    const currentData = getCurrentData(this);
    if (!currentData.skills) {
      currentData.skills = {};
    }
    currentData.skills[skillName] = Number.isFinite(level) ? level : 0;
  },
  setTarkovUid(this: UserState, uid: number | null) {
    this.tarkovUid = uid;
  },
  setTarkovDevProfile(this: UserState, profile: UserProgressData['tarkovDevProfile']) {
    const currentData = getCurrentData(this);
    currentData.tarkovDevProfile = profile;
  },
  setStoryChapterComplete(this: UserState, chapterId: string) {
    updateObjective(this, 'storyChapters', chapterId, {
      complete: true,
      timestamp: Date.now(),
    });
  },
  setStoryChapterUncomplete(this: UserState, chapterId: string) {
    updateObjective(this, 'storyChapters', chapterId, { complete: false });
  },
  toggleStoryChapterComplete(this: UserState, chapterId: string) {
    const isComplete = getters.isStoryChapterComplete(this)(chapterId);
    if (isComplete) {
      actions.setStoryChapterUncomplete.call(this, chapterId);
    } else {
      actions.setStoryChapterComplete.call(this, chapterId);
    }
  },
  setStoryObjectiveComplete(this: UserState, chapterId: string, objectiveId: string) {
    const data = getCurrentData(this);
    if (!data.storyChapters[chapterId]) {
      data.storyChapters[chapterId] = {};
    }
    if (!data.storyChapters[chapterId].objectives) {
      data.storyChapters[chapterId].objectives = {};
    }
    data.storyChapters[chapterId].objectives![objectiveId] = {
      complete: true,
      timestamp: Date.now(),
    };
  },
  setStoryObjectiveUncomplete(this: UserState, chapterId: string, objectiveId: string) {
    const data = getCurrentData(this);
    if (!data.storyChapters[chapterId]) {
      data.storyChapters[chapterId] = {};
    }
    if (!data.storyChapters[chapterId].objectives) {
      data.storyChapters[chapterId].objectives = {};
    }
    data.storyChapters[chapterId].objectives![objectiveId] = {
      complete: false,
    };
  },
  toggleStoryObjectiveComplete(this: UserState, chapterId: string, objectiveId: string) {
    const isComplete = getters.isStoryObjectiveComplete(this)(chapterId, objectiveId);
    if (isComplete) {
      actions.setStoryObjectiveUncomplete.call(this, chapterId, objectiveId);
    } else {
      actions.setStoryObjectiveComplete.call(this, chapterId, objectiveId);
    }
  },
} as const;
export type UserActions = typeof actions;
