import { type _GettersTree, defineStore, type StateTree } from 'pinia';
import { useSupabaseSync, type SupabaseSyncReturn } from '@/composables/supabase/useSupabaseSync';
import {
  type LocalIgnoredReason,
  type ToastTranslate,
  useToastI18n,
} from '@/composables/useToastI18n';
import {
  actions,
  defaultState,
  getters,
  migrateToGameModeStructure,
  type ApiTaskUpdate,
  type ApiUpdateMeta,
  type UserActions,
  type UserProgressData,
  type UserState,
} from '@/stores/progressState';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import {
  enforceHideoutPrereqs,
  notifyHideoutPrereqEnforcement,
} from '@/stores/tarkov/hideoutPrereqs';
import {
  backupProgressStorageValue,
  clearActiveProgressStorage,
  clearProgressStorageSafely,
  cloneStateSnapshot,
  getPreservedProgressStorageValue,
  patchStoreState,
  readPersistedProgressState,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
  type PersistedProgressSnapshot,
} from '@/stores/tarkov/localStorage';
import {
  buildPrestigeResetData,
  buildPrestigeRunSummary,
  clampPrestigeLevel,
  parsePrestigeRunRows,
  type PrestigeRunRecord,
  type UserPrestigeRunRow,
} from '@/stores/tarkov/prestige';
import {
  buildUpsertPayload,
  coerceGameMode,
  getNextProgressEpoch,
  hasProgress,
  mergeProgressData,
  mergeStoryChapterProgress,
  normalizeApiTaskUpdates,
  normalizeApiUpdateMetaEntry,
  normalizeTaskCompletionsMap,
  toProgressEpoch,
} from '@/stores/tarkov/progressMerge';
import { useMetadataStore } from '@/stores/useMetadata';
import { delay } from '@/utils/async';
import { GAME_MODES, MANUAL_FAIL_TASK_IDS, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  hasDeprecatedTarkovDevProfileData,
  sanitizeOwnedProgressData,
  sanitizeOwnedUserState,
} from '@/utils/progressSanitizers';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { getCompletionFlags, type RawTaskCompletion } from '@/utils/taskStatus';
import {
  getCurrentSupabaseUserId,
  parseUserScopedStorage,
  serializeUserScopedStorage,
} from '@/utils/userScopedStorage';
import type { Task } from '@/types/tarkov';
// ============================================================================
// Constants
// ============================================================================
const QUOTA_CHECK_INTERVAL_MS = 60000;
const ESTIMATED_QUOTA_BYTES = 5 * 1024 * 1024;
const QUOTA_SAFETY_BUFFER_BYTES = 512 * 1024;
const SYNC_DEBOUNCE_MS = 5000;
const SELF_ORIGIN_THRESHOLD_MS = 3000;
const RECENT_LOCAL_SYNC_HISTORY_SIZE = 20;
const DEPRECATED_REMOTE_CLEANUP_FAST_RETRY_LIMIT = 3;
const DEPRECATED_REMOTE_CLEANUP_FAILURE_BACKOFF_MS = 30000;
const SYNC_RESUME_DELAY_MS = 1000;
const RESET_SETTLE_DELAY_MS = 100;
const API_UPDATE_FRESHNESS_MS = 30000;
const ISSUE_71_ACCOUNT_AGE_THRESHOLD_MS = 5000;
const LOAD_RETRY_COUNT = 3;
const LOAD_RETRY_DELAY_MS = 500;
// ============================================================================
// Module State
// ============================================================================
let lastQuotaCheckTime = 0;
type UserProgressRow = {
  user_id: string;
  current_game_mode: string | null;
  game_edition: number | null;
  tarkov_uid: number | null;
  pvp_data: UserProgressData | null;
  pve_data: UserProgressData | null;
  created_at: string | null;
  updated_at: string | null;
};
type UserProgressSyncPayload = {
  user_id: string | null;
  current_game_mode: GameMode;
  game_edition: number;
  tarkov_uid: number | null;
  pvp_data: UserProgressData;
  pve_data: UserProgressData;
};
export type { PrestigeRunSummary, PrestigeRunRecord } from '@/stores/tarkov/prestige';
export type { PersistedProgressSnapshot } from '@/stores/tarkov/localStorage';
// Create a type that extends UserState with Pinia store methods
type TarkovStoreInstance = UserState & {
  $state: UserState;
  $patch(partialOrMutator: Partial<UserState> | ((state: UserState) => void)): void;
  migrateTaskCompletionSchema(): { pvpMigrated: number; pveMigrated: number };
  repairGameModeFailedTasks(gameModeData: UserProgressData, tasksMap: Map<string, Task>): number;
  repairGameModeCompletedObjectives(
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
  setTasksAndObjectivesUncompleted(taskIds: string[], objectiveIds: string[]): void;
  enforceHideoutPrereqsNow(): number;
  markTaskAsUncompleted(
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
  markTaskAsFailed(
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
};
// ============================================================================
// Utility Functions
// ============================================================================
const shouldPreferLocalStartupMetadata = (
  localTimestamp: number | null,
  remoteUpdatedAt: number | null,
  localScore: number,
  remoteScore: number
): boolean => {
  if (localTimestamp && remoteUpdatedAt) {
    return localTimestamp > remoteUpdatedAt;
  }
  if (localTimestamp && !remoteUpdatedAt) {
    return localScore > remoteScore;
  }
  if (!localTimestamp && !remoteUpdatedAt) {
    return localScore > remoteScore;
  }
  return false;
};
const getStoryProgressScore = (mode: UserProgressData | undefined): number => {
  if (!mode?.storyChapters) {
    return 0;
  }
  let score = 0;
  for (const chapter of Object.values(mode.storyChapters)) {
    score += 1;
    score += Object.keys(chapter?.objectives || {}).length;
  }
  return score;
};
const resolveInitialSyncState = (
  localState: UserState,
  remoteState: UserState,
  localTimestamp: number | null,
  remoteUpdatedAt: number | null,
  localScore: number,
  remoteScore: number
): UserState => {
  const preferLocalMetadata = shouldPreferLocalStartupMetadata(
    localTimestamp,
    remoteUpdatedAt,
    localScore,
    remoteScore
  );
  const resolveModeData = (
    localModeData: UserProgressData,
    remoteModeData: UserProgressData
  ): UserProgressData => {
    const localEpoch = toProgressEpoch(localModeData);
    const remoteEpoch = toProgressEpoch(remoteModeData);
    if (localEpoch !== remoteEpoch) {
      return mergeProgressData(localModeData, remoteModeData);
    }
    const preferredModeData = preferLocalMetadata ? localModeData : remoteModeData;
    return {
      ...preferredModeData,
      storyChapters: mergeStoryChapterProgress(
        localModeData.storyChapters,
        remoteModeData.storyChapters
      ),
    };
  };
  return {
    currentGameMode: preferLocalMetadata ? localState.currentGameMode : remoteState.currentGameMode,
    gameEdition: preferLocalMetadata
      ? localState.gameEdition || defaultState.gameEdition
      : remoteState.gameEdition || defaultState.gameEdition,
    tarkovUid: preferLocalMetadata
      ? (localState.tarkovUid ?? null)
      : (remoteState.tarkovUid ?? null),
    pvp: resolveModeData(localState.pvp, remoteState.pvp),
    pve: resolveModeData(localState.pve, remoteState.pve),
  };
};
type ResetMode = 'pvp' | 'pve' | 'all';
const executeWithSyncPause = async <T>(operation: () => Promise<T>): Promise<T> => {
  const controller = getSyncController();
  controller?.pause();
  try {
    const result = await operation();
    await delay(RESET_SETTLE_DELAY_MS);
    controller?.resume();
    return result;
  } catch (error) {
    logger.error('[TarkovStore] Reset operation failed:', error);
    getSyncController()?.resume();
    throw error;
  }
};
const performReset = async (
  mode: ResetMode,
  store: { $patch: (fn: (state: UserState) => void) => void; $state: UserState }
): Promise<void> => {
  const { $supabase } = useNuxtApp();
  const freshState = structuredClone(defaultState);
  if (mode === 'all' || mode === 'pvp') {
    freshState.pvp.progressEpoch = getNextProgressEpoch(store.$state.pvp);
  }
  if (mode === 'all' || mode === 'pve') {
    freshState.pve.progressEpoch = getNextProgressEpoch(store.$state.pve);
  }
  if ($supabase.user.loggedIn && $supabase.user.id) {
    const payload =
      mode === 'all'
        ? buildUpsertPayload($supabase.user.id, freshState)
        : mode === 'pvp'
          ? { user_id: $supabase.user.id, pvp_data: freshState.pvp }
          : { user_id: $supabase.user.id, pve_data: freshState.pve };
    const { error } = await $supabase.client.from('user_progress').upsert(payload);
    if (error) {
      throw new Error(`Failed to reset remote progress: ${error.message}`);
    }
  }
  clearProgressStorage();
  store.$patch((state) => {
    if (mode === 'all' || mode === 'pvp') state.pvp = freshState.pvp;
    if (mode === 'all' || mode === 'pve') state.pve = freshState.pve;
    if (mode === 'all') {
      state.currentGameMode = freshState.currentGameMode;
      state.gameEdition = freshState.gameEdition;
      state.tarkovUid = freshState.tarkovUid;
    }
  });
};
// ============================================================================
// Store Definition
// ============================================================================
const tarkovGetters = {
  ...getters,
  // Removed side-effect causing getters. Migration should be handled in actions or initialization.
} satisfies _GettersTree<UserState>;
// Create typed actions object with the additional store-specific actions
const tarkovActions = {
  ...(actions as UserActions),
  setHideoutModuleUncomplete(this: TarkovStoreInstance, hideoutId: string) {
    actions.setHideoutModuleUncomplete.call(this, hideoutId);
    const removedModules = enforceHideoutPrereqs(this);
    notifyHideoutPrereqEnforcement(removedModules.length);
  },
  setSkillLevel(this: TarkovStoreInstance, skillName: string, level: number) {
    actions.setSkillLevel.call(this, skillName, level);
    const removedModules = enforceHideoutPrereqs(this);
    notifyHideoutPrereqEnforcement(removedModules.length);
  },
  setTraderLevel(this: TarkovStoreInstance, traderId: string, level: number) {
    actions.setTraderLevel.call(this, traderId, level);
    const removedModules = enforceHideoutPrereqs(this);
    notifyHideoutPrereqEnforcement(removedModules.length);
  },
  setTasksAndObjectivesUncompleted(
    this: TarkovStoreInstance,
    taskIds: string[],
    objectiveIds: string[]
  ) {
    const validTaskIds = taskIds
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim());
    const validObjectiveIds = objectiveIds
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim());
    if (!validTaskIds.length && !validObjectiveIds.length) return;
    for (const taskId of validTaskIds) {
      actions.setTaskUncompleted.call(this, taskId);
    }
    for (const objectiveId of validObjectiveIds) {
      actions.setTaskObjectiveUncomplete.call(this, objectiveId);
    }
  },
  enforceHideoutPrereqsNow(this: TarkovStoreInstance) {
    const removedModules = enforceHideoutPrereqs(this);
    notifyHideoutPrereqEnforcement(removedModules.length);
    return removedModules.length;
  },
  async switchGameMode(this: TarkovStoreInstance, mode: GameMode) {
    actions.switchGameMode.call(this, mode);
    const { $supabase } = useNuxtApp();
    if ($supabase.user.loggedIn && $supabase.user.id) {
      try {
        recordLocalSyncTime(); // Track for self-origin filtering
        await $supabase.client
          .from('user_progress')
          .upsert(buildUpsertPayload($supabase.user.id, this.$state));
      } catch (error) {
        logger.error('Error syncing gamemode to backend:', error);
      }
    }
  },
  async migrateDataIfNeeded(this: TarkovStoreInstance) {
    const needsMigration =
      !this.currentGameMode ||
      !this.pvp ||
      !this.pve ||
      ((this as unknown as Record<string, unknown>).level !== undefined && !this.pvp?.level);
    const taskCompletionMigration = this.migrateTaskCompletionSchema();
    const hasTaskCompletionMigration =
      taskCompletionMigration.pvpMigrated > 0 || taskCompletionMigration.pveMigrated > 0;
    if (needsMigration) {
      logger.debug('Migrating legacy data structure to gamemode-aware structure');
      const migratedData = migrateToGameModeStructure(cloneStateSnapshot(this.$state));
      this.$patch(migratedData);
      this.migrateTaskCompletionSchema();
      const { $supabase } = useNuxtApp();
      if ($supabase.user.loggedIn && $supabase.user.id) {
        try {
          recordLocalSyncTime(); // Track for self-origin filtering
          await $supabase.client
            .from('user_progress')
            .upsert(buildUpsertPayload($supabase.user.id, this.$state));
        } catch (error) {
          logger.error('Error saving migrated data to Supabase:', error);
        }
      }
    } else if (hasTaskCompletionMigration) {
      const { $supabase } = useNuxtApp();
      if ($supabase.user.loggedIn && $supabase.user.id) {
        try {
          recordLocalSyncTime();
          await $supabase.client
            .from('user_progress')
            .upsert(buildUpsertPayload($supabase.user.id, this.$state));
        } catch (error) {
          logger.error('Error saving task completion migration to Supabase:', error);
        }
      }
    }
  },
  migrateTaskCompletionSchema(this: TarkovStoreInstance) {
    const pvpMigrated = normalizeTaskCompletionsMap(this.pvp?.taskCompletions);
    const pveMigrated = normalizeTaskCompletionsMap(this.pve?.taskCompletions);
    if (pvpMigrated > 0 || pveMigrated > 0) {
      logger.debug(
        `[TarkovStore] Migrated legacy task completion schema - PvP: ${pvpMigrated}, PvE: ${pveMigrated}`
      );
    }
    return { pvpMigrated, pveMigrated };
  },
  async resetOnlineProfile(this: TarkovStoreInstance) {
    const { $supabase } = useNuxtApp();
    if (!$supabase.user.loggedIn || !$supabase.user.id) {
      logger.error('User not logged in. Cannot reset online profile.');
      return;
    }
    try {
      const freshState = structuredClone(defaultState);
      freshState.pvp.progressEpoch = getNextProgressEpoch(this.pvp);
      freshState.pve.progressEpoch = getNextProgressEpoch(this.pve);
      await $supabase.client
        .from('user_progress')
        .upsert(buildUpsertPayload($supabase.user.id, freshState));
      clearProgressStorage();
      this.$patch((state) => {
        state.currentGameMode = freshState.currentGameMode;
        state.gameEdition = freshState.gameEdition;
        state.tarkovUid = freshState.tarkovUid;
        state.pvp = freshState.pvp;
        state.pve = freshState.pve;
      });
    } catch (error) {
      logger.error('Error resetting online profile:', error);
    }
  },
  async resetCurrentGameModeData(this: TarkovStoreInstance) {
    const tarkovStore = useTarkovStore();
    const currentMode = tarkovStore.getCurrentGameMode();
    if (currentMode === GAME_MODES.PVP) {
      // Use the actions object directly to avoid type issues
      await tarkovActions.resetPvPData.call(this);
    } else {
      // Use the actions object directly to avoid type issues
      await tarkovActions.resetPvEData.call(this);
    }
  },
  async resetPvPData(this: TarkovStoreInstance) {
    logger.debug('[TarkovStore] Resetting PvP data...');
    await executeWithSyncPause(() => performReset('pvp', this));
    logger.debug('[TarkovStore] PvP data reset complete');
  },
  async resetPvEData(this: TarkovStoreInstance) {
    logger.debug('[TarkovStore] Resetting PvE data...');
    await executeWithSyncPause(() => performReset('pve', this));
    logger.debug('[TarkovStore] PvE data reset complete');
  },
  async resetAllData(this: TarkovStoreInstance) {
    logger.debug('[TarkovStore] Resetting all data (both PvP and PvE)...');
    await executeWithSyncPause(() => performReset('all', this));
    logger.debug('[TarkovStore] All data reset complete');
  },
  async syncPvpPrestigeLevel(this: TarkovStoreInstance, level: number) {
    const nextPrestigeLevel = clampPrestigeLevel(level);
    const currentPrestigeLevel = clampPrestigeLevel(this.pvp.prestigeLevel || 0);
    if (nextPrestigeLevel === currentPrestigeLevel) {
      return;
    }
    const nextPvpData = cloneStateSnapshot(this.pvp);
    nextPvpData.prestigeLevel = nextPrestigeLevel;
    nextPvpData.progressEpoch = getNextProgressEpoch(this.pvp);
    const { $supabase } = useNuxtApp();
    if ($supabase.user.loggedIn && $supabase.user.id) {
      const nextState = cloneStateSnapshot(this.$state);
      nextState.pvp = nextPvpData;
      const { error } = await $supabase.client
        .from('user_progress')
        .upsert(buildUpsertPayload($supabase.user.id, nextState));
      if (error) {
        throw new Error(`Failed to sync PvP prestige level: ${error.message}`);
      }
      recordLocalSyncTime();
    }
    this.$patch((state) => {
      state.pvp = nextPvpData;
    });
  },
  async prestigePvP(this: TarkovStoreInstance) {
    const { $supabase } = useNuxtApp();
    const userId = $supabase.user.id;
    if (!$supabase.user.loggedIn || !userId) {
      throw new Error('User not logged in. Cannot prestige PvP profile.');
    }
    const currentPrestige = clampPrestigeLevel(this.pvp.prestigeLevel || 0);
    if (currentPrestige >= 6) {
      throw new Error('Maximum prestige level reached.');
    }
    const nextPrestige = currentPrestige + 1;
    const archivedProgress = cloneStateSnapshot(this.pvp);
    const archivedAt = Date.now();
    const summary = buildPrestigeRunSummary(archivedProgress);
    const resetPvpData = buildPrestigeResetData(archivedProgress, nextPrestige);
    await executeWithSyncPause(async () => {
      const { error: prestigeError } = await $supabase.client.rpc(
        'archive_prestige_run_and_reset_progress',
        {
          p_archived_progress: archivedProgress,
          p_created_at: new Date(archivedAt).toISOString(),
          p_current_game_mode: this.$state.currentGameMode || GAME_MODES.PVP,
          p_game_edition: this.$state.gameEdition || defaultState.gameEdition,
          p_mode: 'pvp',
          p_prestige_from: currentPrestige,
          p_prestige_to: nextPrestige,
          p_pve_data: this.$state.pve ?? defaultState.pve,
          p_pvp_data: resetPvpData,
          p_summary: summary,
          p_tarkov_uid: this.$state.tarkovUid ?? null,
        }
      );
      if (prestigeError) {
        throw new Error(`Failed to update prestige progress: ${prestigeError.message}`);
      }
      recordLocalSyncTime();
      this.$patch((state) => {
        state.pvp = resetPvpData;
      });
    });
  },
  async fetchPrestigeRuns(
    this: TarkovStoreInstance,
    mode: 'pvp' | 'pve' = 'pvp',
    limit = 20
  ): Promise<PrestigeRunRecord[]> {
    const { $supabase } = useNuxtApp();
    if (!$supabase.user.loggedIn || !$supabase.user.id) {
      return [];
    }
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const { data, error } = await $supabase.client
      .from('user_prestige_runs')
      .select('id, mode, prestige_from, prestige_to, summary, created_at')
      .eq('user_id', $supabase.user.id)
      .eq('mode', mode)
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (error) {
      throw new Error(`Failed to load prestige history: ${error.message}`);
    }
    return parsePrestigeRunRows((data as UserPrestigeRunRow[]) || []);
  },
  async deletePrestigeRun(this: TarkovStoreInstance, runId: string, mode: 'pvp' | 'pve' = 'pvp') {
    const { $supabase } = useNuxtApp();
    const userId = $supabase.user.id;
    if (!$supabase.user.loggedIn || !userId) {
      throw new Error('User not logged in. Cannot delete prestige history.');
    }
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) {
      throw new Error('Prestige history entry id is required.');
    }
    const { data, error } = await $supabase.client
      .from('user_prestige_runs')
      .delete()
      .eq('id', normalizedRunId)
      .eq('user_id', userId)
      .eq('mode', mode)
      .select('id')
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to delete prestige history: ${error.message}`);
    }
    if (!data?.id) {
      throw new Error(
        'Failed to delete prestige history: no archived run was removed. Apply the delete policy migration to Supabase.'
      );
    }
  },
  /**
   * Repair failed task states for existing users.
   * Re-applies legitimate branch failures and clears stale failed flags.
   */
  repairFailedTaskStates(this: TarkovStoreInstance) {
    const metadataStore = useMetadataStore();
    const tasks = metadataStore.tasks;
    if (!tasks || tasks.length === 0) {
      logger.debug('[TarkovStore] No tasks available for repair, skipping');
      return { pvpRepaired: 0, pveRepaired: 0 };
    }
    // Create a map for O(1) task lookup
    const tasksMap = new Map<string, Task>();
    tasks.forEach((task) => tasksMap.set(task.id, task));
    const clearFailedTaskObjectives = (
      gameModeData: UserProgressData,
      tasksLookup: Map<string, Task>
    ) => {
      if (!gameModeData.taskObjectives) return 0;
      let clearedTasks = 0;
      const completions = gameModeData.taskCompletions ?? {};
      for (const [taskId, completion] of Object.entries(completions)) {
        if (!completion?.failed) continue;
        const task = tasksLookup.get(taskId);
        if (!task?.objectives?.length) continue;
        let cleared = false;
        for (const obj of task.objectives) {
          if (!obj?.id) continue;
          const existing = gameModeData.taskObjectives[obj.id];
          if (!existing) continue;
          if (existing.complete || (existing.count ?? 0) > 0) {
            existing.complete = false;
            if (existing.count !== undefined || (obj.count ?? 0) > 0) {
              existing.count = 0;
            }
            cleared = true;
          }
        }
        if (cleared) {
          clearedTasks += 1;
        }
      }
      return clearedTasks;
    };
    let pvpRepaired = 0;
    let pveRepaired = 0;
    let pvpCleared = 0;
    let pveCleared = 0;
    // Repair PvP data
    if (this.pvp?.taskCompletions) {
      pvpRepaired = this.repairGameModeFailedTasks(this.pvp, tasksMap);
      pvpCleared = clearFailedTaskObjectives(this.pvp, tasksMap);
    }
    // Repair PvE data
    if (this.pve?.taskCompletions) {
      pveRepaired = this.repairGameModeFailedTasks(this.pve, tasksMap);
      pveCleared = clearFailedTaskObjectives(this.pve, tasksMap);
    }
    if (pvpRepaired > 0 || pveRepaired > 0) {
      logger.debug(
        `[TarkovStore] Repaired task failed flags - PvP: ${pvpRepaired}, PvE: ${pveRepaired}`
      );
    }
    if (pvpCleared > 0 || pveCleared > 0) {
      logger.debug(
        `[TarkovStore] Cleared objectives for failed tasks - PvP: ${pvpCleared}, PvE: ${pveCleared}`
      );
    }
    return { pvpRepaired, pveRepaired };
  },
  /**
   * Repair objective states for completed tasks.
   * Ensures that any completed task has all its objectives marked complete.
   */
  repairCompletedTaskObjectives(this: TarkovStoreInstance) {
    const metadataStore = useMetadataStore();
    const tasks = metadataStore.tasks;
    if (!tasks || tasks.length === 0) {
      logger.debug('[TarkovStore] No tasks available for objective repair, skipping');
      return { pvpRepaired: 0, pveRepaired: 0 };
    }
    const tasksMap = new Map<string, Task>();
    tasks.forEach((task) => tasksMap.set(task.id, task));
    let pvpRepaired = 0;
    let pveRepaired = 0;
    if (this.pvp?.taskCompletions) {
      pvpRepaired = this.repairGameModeCompletedObjectives(this.pvp, tasksMap);
    }
    if (this.pve?.taskCompletions) {
      pveRepaired = this.repairGameModeCompletedObjectives(this.pve, tasksMap);
    }
    if (pvpRepaired > 0 || pveRepaired > 0) {
      logger.debug(
        `[TarkovStore] Repaired completed task objectives - PvP: ${pvpRepaired}, PvE: ${pveRepaired}`
      );
    }
    return { pvpRepaired, pveRepaired };
  },
  /**
   * Helper to repair objectives for completed tasks in a specific game mode.
   */
  repairGameModeCompletedObjectives(
    this: TarkovStoreInstance,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number {
    let repairedCount = 0;
    const completions = gameModeData.taskCompletions ?? {};
    if (!gameModeData.taskObjectives) {
      gameModeData.taskObjectives = {};
    }
    for (const [taskId, completion] of Object.entries(completions)) {
      if (!completion?.complete || completion?.failed) continue;
      const task = tasksMap.get(taskId);
      if (!task?.objectives?.length) continue;
      for (const objective of task.objectives) {
        if (!objective?.id) continue;
        const existing = gameModeData.taskObjectives[objective.id] ?? {};
        let changed = false;
        if (existing.complete !== true) {
          existing.complete = true;
          changed = true;
        }
        if (objective.count !== undefined && objective.count > 0) {
          const requiredCount = objective.count;
          const existingCount = existing.count ?? 0;
          if (existingCount < requiredCount) {
            existing.count = requiredCount;
            changed = true;
          }
        }
        if (changed) {
          if (!existing.timestamp) {
            existing.timestamp = completion.timestamp ?? Date.now();
          }
          gameModeData.taskObjectives[objective.id] = existing;
          repairedCount += 1;
        }
      }
    }
    return repairedCount;
  },
  /**
   * Helper to repair failed tasks for a specific game mode's data.
   */
  repairGameModeFailedTasks(
    this: TarkovStoreInstance,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number {
    let repairedCount = 0;
    const completions = gameModeData.taskCompletions ?? {};
    if (!gameModeData.taskCompletions) {
      gameModeData.taskCompletions = completions;
    }
    const processedPairs = new Set<string>();
    const normalizeStatuses = (statuses?: string[]) =>
      (statuses ?? []).map((status) => status.toLowerCase());
    const hasAnyStatus = (statuses: string[], values: string[]) =>
      values.some((value) => statuses.includes(value));
    const hasCompleteStatus = (statuses?: string[]) =>
      hasAnyStatus(normalizeStatuses(statuses), ['complete', 'completed']);
    const shouldFailWhenOtherCompleted = (task: Task | undefined, otherTaskId: string) => {
      if (!task) return false;
      return (task.failConditions ?? []).some(
        (objective) => objective?.task?.id === otherTaskId && hasCompleteStatus(objective.status)
      );
    };
    // First, enforce branch-failure consistency for completed alternatives.
    for (const [taskId, completion] of Object.entries(completions)) {
      if (!completion?.complete || completion?.failed) continue;
      const task = tasksMap.get(taskId);
      if (!task?.alternatives?.length) continue;
      for (const altTaskId of task.alternatives) {
        const pairKey = [taskId, altTaskId].sort().join('|');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);
        const altCompletion = completions[altTaskId];
        if (altCompletion?.failed) continue;
        if (!altCompletion?.complete) {
          repairedCount += this.markTaskAsFailed(altTaskId, gameModeData, tasksMap);
          continue;
        }
        const altTask = tasksMap.get(altTaskId);
        const shouldFailAlt = shouldFailWhenOtherCompleted(altTask, taskId);
        const shouldFailTask = shouldFailWhenOtherCompleted(task, altTaskId);
        if (!shouldFailAlt || !shouldFailTask) {
          continue;
        }
        const taskTimestamp = completion.timestamp ?? 0;
        const altTimestamp = altCompletion.timestamp ?? 0;
        if (taskTimestamp === altTimestamp) {
          const deterministicFail = taskId > altTaskId ? taskId : altTaskId;
          logger.warn(
            `[TarkovStore] Both "${taskId}" and alternative "${altTaskId}" are complete ` +
              `${taskTimestamp === 0 ? 'with no timestamps' : 'with identical timestamps'} - ` +
              `applying deterministic fallback (failing "${deterministicFail}").`
          );
          repairedCount += this.markTaskAsFailed(deterministicFail, gameModeData, tasksMap);
          continue;
        }
        if (taskTimestamp > altTimestamp) {
          repairedCount += this.markTaskAsFailed(altTaskId, gameModeData, tasksMap);
        } else {
          repairedCount += this.markTaskAsFailed(taskId, gameModeData, tasksMap);
        }
      }
    }
    // Then clear stale failed flags that no longer have a valid cause.
    const isTaskSuccessful = (taskId: string) => {
      const completion = completions[taskId];
      return completion?.complete === true && completion?.failed !== true;
    };
    const alternativeSourcesByTask = new Map<string, string[]>();
    for (const [taskId, task] of tasksMap.entries()) {
      (task.alternatives ?? []).forEach((alternativeId) => {
        if (!alternativeSourcesByTask.has(alternativeId)) {
          alternativeSourcesByTask.set(alternativeId, []);
        }
        alternativeSourcesByTask.get(alternativeId)!.push(taskId);
      });
    }
    const wasCompletedBeforeTrigger = (
      task: Task | undefined,
      taskTimestamp: number | undefined,
      triggerTaskId: string,
      taskWasCompleted?: boolean
    ) => {
      if (shouldFailWhenOtherCompleted(tasksMap.get(triggerTaskId), task?.id ?? '')) return false;
      const ts = taskTimestamp ?? 0;
      const triggerTs = completions[triggerTaskId]?.timestamp ?? 0;
      if (ts > 0 && triggerTs > 0) return ts < triggerTs;
      if (taskWasCompleted) return true;
      return false;
    };
    const shouldRemainFailed = (
      task: Task | undefined,
      completion:
        | { complete?: boolean; failed?: boolean; manual?: boolean; timestamp?: number }
        | undefined
    ) => {
      if (completion?.manual === true) return true;
      if (!task) return true;
      if (MANUAL_FAIL_TASK_IDS.includes(task.id)) return true;
      if (
        (task.failConditions ?? []).some(
          (objective) =>
            objective?.task?.id &&
            hasCompleteStatus(objective.status) &&
            isTaskSuccessful(objective.task.id) &&
            !wasCompletedBeforeTrigger(
              task,
              completion?.timestamp,
              objective.task.id,
              completion?.complete === true
            )
        )
      ) {
        return true;
      }
      const alternativeSources = alternativeSourcesByTask.get(task.id) ?? [];
      const failedByAlternative = alternativeSources.some(
        (sourceId) =>
          isTaskSuccessful(sourceId) &&
          !wasCompletedBeforeTrigger(
            task,
            completion?.timestamp,
            sourceId,
            completion?.complete === true
          )
      );
      if (failedByAlternative) {
        return true;
      }
      return false;
    };
    for (const [taskId, completion] of Object.entries(completions)) {
      if (!completion?.failed) continue;
      const task = tasksMap.get(taskId);
      const remainsFailed = shouldRemainFailed(task, completion);
      if (remainsFailed) continue;
      const alternativeSources = alternativeSourcesByTask.get(taskId) ?? [];
      const successfulAlternativeSources = alternativeSources.filter((sourceId) =>
        isTaskSuccessful(sourceId)
      );
      const failConditionMatches =
        task?.failConditions
          ?.filter(
            (objective) =>
              objective?.task?.id &&
              hasCompleteStatus(objective.status) &&
              isTaskSuccessful(objective.task.id)
          )
          .map((objective) => objective?.task?.id)
          .filter((sourceId): sourceId is string => typeof sourceId === 'string') ?? [];
      const manualFailTask = task ? MANUAL_FAIL_TASK_IDS.includes(task.id) : false;
      logger.debug(
        `[TarkovStore] Clearing stale failed flag for "${taskId}" via markTaskAsUncompleted ` +
          '(shouldRemainFailed=false: no manual/sticky fail condition is active).',
        {
          taskId,
          shouldRemainFailed: remainsFailed,
          reason: 'no manual fail, no matched failConditions, no successful alternative source',
          manualFlag: completion.manual === true,
          manualFailTaskIdsIncludesTask: manualFailTask,
          alternativeSourcesByTask: alternativeSources,
          successfulAlternativeSources,
          failConditionMatches,
        }
      );
      repairedCount += this.markTaskAsUncompleted(taskId, gameModeData, tasksMap);
    }
    return repairedCount;
  },
  markTaskAsUncompleted(
    this: TarkovStoreInstance,
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number {
    const completions = gameModeData.taskCompletions ?? {};
    if (!gameModeData.taskCompletions) {
      gameModeData.taskCompletions = completions;
    }
    if (!completions[taskId]) {
      completions[taskId] = {};
    }
    const now = Date.now();
    completions[taskId]!.complete = false;
    completions[taskId]!.failed = false;
    completions[taskId]!.manual = false;
    completions[taskId]!.timestamp = now;
    const task = tasksMap.get(taskId);
    if (task?.objectives) {
      if (!gameModeData.taskObjectives) {
        gameModeData.taskObjectives = {};
      }
      for (const obj of task.objectives) {
        if (!obj?.id) continue;
        const existing = gameModeData.taskObjectives[obj.id] ?? {};
        existing.complete = false;
        if (existing.count !== undefined || (obj.count ?? 0) > 0) {
          existing.count = 0;
        }
        existing.timestamp = now;
        gameModeData.taskObjectives[obj.id] = existing;
      }
    }
    return 1;
  },
  /**
   * Helper to mark a single task as failed and complete its objectives
   */
  markTaskAsFailed(
    this: TarkovStoreInstance,
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number {
    const completions = gameModeData.taskCompletions ?? {};
    if (!gameModeData.taskCompletions) {
      gameModeData.taskCompletions = completions;
    }
    if (!completions[taskId]) {
      completions[taskId] = {};
    }
    completions[taskId]!.complete = true;
    completions[taskId]!.failed = true;
    if (completions[taskId]!.manual !== true) {
      completions[taskId]!.manual = false;
    }
    completions[taskId]!.timestamp = completions[taskId]!.timestamp ?? Date.now();
    // Clear the task's objectives when failed
    const task = tasksMap.get(taskId);
    if (task?.objectives) {
      if (!gameModeData.taskObjectives) {
        gameModeData.taskObjectives = {};
      }
      for (const obj of task.objectives) {
        if (!obj?.id) continue;
        const existing = gameModeData.taskObjectives[obj.id] ?? {};
        existing.complete = false;
        if (existing.count !== undefined || (obj.count ?? 0) > 0) {
          existing.count = 0;
        }
        gameModeData.taskObjectives[obj.id] = existing;
      }
    }
    return 1;
  },
} satisfies UserActions & {
  switchGameMode(mode: GameMode): Promise<void>;
  migrateDataIfNeeded(): Promise<void>;
  migrateTaskCompletionSchema(): { pvpMigrated: number; pveMigrated: number };
  resetOnlineProfile(): Promise<void>;
  resetCurrentGameModeData(): Promise<void>;
  resetPvPData(): Promise<void>;
  resetPvEData(): Promise<void>;
  resetAllData(): Promise<void>;
  syncPvpPrestigeLevel(level: number): Promise<void>;
  prestigePvP(): Promise<void>;
  fetchPrestigeRuns(mode?: 'pvp' | 'pve', limit?: number): Promise<PrestigeRunRecord[]>;
  deletePrestigeRun(runId: string, mode?: 'pvp' | 'pve'): Promise<void>;
  repairFailedTaskStates(): { pvpRepaired: number; pveRepaired: number };
  repairCompletedTaskObjectives(): { pvpRepaired: number; pveRepaired: number };
  repairGameModeFailedTasks(gameModeData: UserProgressData, tasksMap: Map<string, Task>): number;
  repairGameModeCompletedObjectives(
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
  markTaskAsUncompleted(
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
  setTasksAndObjectivesUncompleted(taskIds: string[], objectiveIds: string[]): void;
  enforceHideoutPrereqsNow(): number;
  markTaskAsFailed(
    taskId: string,
    gameModeData: UserProgressData,
    tasksMap: Map<string, Task>
  ): number;
};
// Export type for external usage
export type TarkovStoreActions = typeof tarkovActions;
export const useTarkovStore = defineStore('swapTarkov', {
  state: () => structuredClone(defaultState),
  getters: tarkovGetters,
  actions: tarkovActions,
  // Enable automatic localStorage persistence with user scoping
  persist: {
    key: STORAGE_KEYS.progress, // LocalStorage key for user progress data
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    // Add userId to serialized data to prevent cross-user contamination
    serializer: {
      serialize: (state: StateTree) => {
        const now = Date.now();
        const currentUserId = getCurrentSupabaseUserId();
        const sanitizedState = sanitizeOwnedUserState(state as UserState);
        const serialized = serializeUserScopedStorage(
          cloneStateSnapshot(sanitizedState),
          currentUserId,
          now
        );
        // QUOTA MANAGEMENT: Check if localStorage has enough space
        // Throttled to avoid performance impact - only check every 60 seconds
        const shouldCheckQuota = now - lastQuotaCheckTime > QUOTA_CHECK_INTERVAL_MS;
        if (shouldCheckQuota && typeof window !== 'undefined') {
          lastQuotaCheckTime = now;
          try {
            // Estimate current localStorage usage
            let currentUsage = 0;
            for (const key in localStorage) {
              if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
                currentUsage += localStorage[key].length + key.length;
              }
            }
            const neededSpace = serialized.length;
            const estimatedQuota = ESTIMATED_QUOTA_BYTES;
            const safetyBuffer = QUOTA_SAFETY_BUFFER_BYTES;
            // If we're close to quota, clean up old backups
            if (currentUsage + neededSpace > estimatedQuota - safetyBuffer) {
              logger.warn('[TarkovStore] localStorage quota low, cleaning up old backups', {
                currentUsage: Math.round(currentUsage / 1024) + 'KB',
                needed: Math.round(neededSpace / 1024) + 'KB',
                quota: Math.round(estimatedQuota / 1024) + 'KB',
              });
              // Get all backup keys sorted by timestamp (oldest first)
              const backupKeys = Object.keys(localStorage)
                .filter((k) => k.startsWith(STORAGE_KEYS.progressBackupPrefix))
                .sort((a, b) => {
                  // Extract timestamp from key (format: prefix_userId_timestamp or prefix_isoString)
                  const extractTimestamp = (key: string): number => {
                    const suffix = key.substring(STORAGE_KEYS.progressBackupPrefix.length);
                    // Try parsing as ISO string first
                    const isoDate = Date.parse(suffix);
                    if (!isNaN(isoDate)) return isoDate;
                    // Try extracting numeric timestamp from userId_timestamp format
                    const parts = suffix.split('_');
                    const lastPart = parts[parts.length - 1] ?? '';
                    const numericTimestamp = parseInt(lastPart, 10);
                    return isNaN(numericTimestamp) ? 0 : numericTimestamp;
                  };
                  return extractTimestamp(a) - extractTimestamp(b);
                });
              // Remove old backups until we have enough space
              let removedCount = 0;
              for (const key of backupKeys) {
                if (currentUsage + neededSpace <= estimatedQuota - safetyBuffer) break;
                const keySize = localStorage[key].length + key.length;
                if (safeRemoveItem(key)) {
                  currentUsage -= keySize;
                  removedCount++;
                  logger.debug(`[TarkovStore] Removed old backup: ${key}`);
                }
              }
              if (removedCount > 0) {
                logger.info(`[TarkovStore] Cleaned up ${removedCount} old backups to free space`);
              }
            }
          } catch (quotaError) {
            logger.error('[TarkovStore] Error managing localStorage quota:', quotaError);
            // If we can't manage quota, try to at least warn the user
            // The persist plugin will handle the actual save error
          }
        }
        return serialized;
      },
      deserialize: (value: string) => {
        try {
          const wrapped = parseUserScopedStorage<UserState>(value);
          const currentUserId = getCurrentSupabaseUserId();
          if (!wrapped) {
            if (import.meta.dev) {
              logger.debug('[TarkovStore] Restoring legacy localStorage format', {
                currentUserId,
              });
            }
            return sanitizeOwnedUserState(
              migrateToGameModeStructure(JSON.parse(value) as UserState)
            );
          }
          const storedUserId = wrapped._userId;
          if (storedUserId === currentUserId) {
            return sanitizeOwnedUserState(migrateToGameModeStructure(wrapped.data));
          }
          if (storedUserId && currentUserId && storedUserId !== currentUserId) {
            logger.warn(
              `[TarkovStore] localStorage userId mismatch! ` +
                `Stored: ${storedUserId}, Current: ${currentUserId}. ` +
                `Backing up and clearing localStorage to prevent data corruption.`
            );
            backupProgressStorageValue(value, storedUserId);
            clearActiveProgressStorage();
            return structuredClone(defaultState);
          }
          logger.debug('[TarkovStore] Ignoring scoped progress until matching auth state loads', {
            currentUserId,
            storedUserId,
          });
          return structuredClone(defaultState);
        } catch (e) {
          logger.error('[TarkovStore] Error deserializing localStorage:', e);
          return structuredClone(defaultState);
        }
      },
    },
  },
});
// Export type for future typing
export type TarkovStore = ReturnType<typeof useTarkovStore>;
// Store reference to sync controller for pause/resume during resets
let syncController: SupabaseSyncReturn<UserState, UserProgressSyncPayload> | null = null;
let syncUserId: string | null = null;
let pendingSyncWatchStop: (() => void) | null = null;
let pendingResetProgressSnapshot: {
  snapshot: PersistedProgressSnapshot | null;
  userId: string | null;
} | null = null;
const shownLocalIgnoreReasons = new Set<LocalIgnoredReason>();
const METADATA_REFRESH_FAILURE_EVENT = 'metadata.refresh.failure';
export function getSyncController() {
  return syncController;
}
const syncMetadataAfterStartup = (tarkovStore: TarkovStore) => {
  const metadataStore = useMetadataStore();
  if (metadataStore.currentGameMode === tarkovStore.getCurrentGameMode()) {
    return;
  }
  void (async () => {
    try {
      await metadataStore.initialize();
      if (metadataStore.currentGameMode === tarkovStore.getCurrentGameMode()) {
        return;
      }
      await metadataStore.refresh();
    } catch (error) {
      const metadataGameMode = metadataStore.currentGameMode;
      const tarkovGameMode = tarkovStore.getCurrentGameMode();
      logger.error(
        '[TarkovStore] Failed to refresh metadata after startup sync',
        {
          event: METADATA_REFRESH_FAILURE_EVENT,
          metadataGameMode,
          tarkovGameMode,
        },
        error
      );
      if (import.meta.client) {
        window.dispatchEvent(
          new CustomEvent(METADATA_REFRESH_FAILURE_EVENT, {
            detail: {
              error,
              metadataGameMode,
              tarkovGameMode,
            },
          })
        );
      }
    }
  })();
};
/**
 * Reset `resetTarkovSync` state and optionally preserve scoped progress across auth transitions.
 * @param reason Optional log context for the reset.
 * @param options Optional reset behavior.
 * @param options.preservePersistedStateForUserId When provided as `string | null`, saves
 * `pendingResetProgressSnapshot` with `readPersistedProgressState(userId)` so user-scoped
 * progress can survive auth handoffs. Passing no `options` clears `pendingResetProgressSnapshot`.
 */
export function resetTarkovSync(
  reason?: string,
  options?: { preservePersistedStateForUserId?: string | null }
) {
  if (options) {
    const userId = options.preservePersistedStateForUserId ?? null;
    pendingResetProgressSnapshot = {
      snapshot: readPersistedProgressState(userId),
      userId,
    };
  } else {
    pendingResetProgressSnapshot = null;
  }
  if (syncController) {
    logger.debug(`[TarkovStore] Clearing Supabase sync${reason ? ` (${reason})` : ''}`);
    syncController.cleanup();
    syncController = null;
  }
  if (pendingSyncWatchStop) {
    pendingSyncWatchStop();
    pendingSyncWatchStop = null;
  }
  cleanupRealtimeListener();
  syncUserId = null;
  shownLocalIgnoreReasons.clear();
  lastLocalSyncTime = 0;
  deprecatedRemoteCleanupInFlight = false;
  lastDeprecatedRemoteCleanupAttemptAt = 0;
  deprecatedRemoteCleanupFailureCount = 0;
  recentLocalSyncTimes.length = 0;
  lastApiUpdateIds.pvp = null;
  lastApiUpdateIds.pve = null;
}
export function resetTarkovStoreForSessionTransition(
  previousUserId: string | null = null,
  reason?: string
) {
  const preservedState = getPreservedProgressStorageValue(previousUserId);
  const currentUserId = getCurrentSupabaseUserId();
  resetTarkovSync(reason, {
    preservePersistedStateForUserId: previousUserId,
  });
  useTarkovStore().$reset();
  if (!import.meta.client) {
    return;
  }
  if (preservedState && currentUserId === null) {
    if (safeSetItem(STORAGE_KEYS.progress, preservedState)) {
      return;
    }
  }
  clearProgressStorageSafely();
}
export async function initializeTarkovSync() {
  const tarkovStore = useTarkovStore();
  const { $supabase } = useNuxtApp();
  if (import.meta.client && $supabase.user.loggedIn) {
    const toastI18n = useToastI18n();
    const currentUserId = $supabase.user.id;
    if (!currentUserId) {
      logger.warn('[TarkovStore] Skipping sync initialization without an authenticated user id');
      return;
    }
    if (syncController) {
      if (syncUserId === currentUserId) {
        logger.debug('[TarkovStore] Supabase sync already initialized, skipping');
        return;
      }
      logger.warn('[TarkovStore] Supabase sync user changed; resetting');
      resetTarkovSync('user changed');
    }
    logger.debug('[TarkovStore] Setting up Supabase sync and listener');
    const preservedLocalSnapshot =
      pendingResetProgressSnapshot?.userId === currentUserId
        ? pendingResetProgressSnapshot.snapshot
        : null;
    const getLocalStorageMeta = () => {
      if (preservedLocalSnapshot) {
        return {
          storedUserId: preservedLocalSnapshot.storedUserId,
          timestamp: preservedLocalSnapshot.timestamp,
        };
      }
      if (typeof window === 'undefined') return null;
      const raw = safeGetItem(STORAGE_KEYS.progress);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as
          | { _userId?: string | null; _timestamp?: number; data?: unknown }
          | Record<string, unknown>;
        if (parsed && typeof parsed === 'object' && 'data' in parsed) {
          return {
            storedUserId: (parsed as { _userId?: string | null })._userId ?? null,
            timestamp:
              typeof (parsed as { _timestamp?: number })._timestamp === 'number'
                ? (parsed as { _timestamp?: number })._timestamp
                : null,
          };
        }
        return { storedUserId: null, timestamp: null };
      } catch {
        return null;
      }
    };
    const notifyLocalIgnored = (reason: LocalIgnoredReason) => {
      if (!import.meta.client || shownLocalIgnoreReasons.has(reason)) return;
      try {
        toastI18n.showLocalIgnored(reason);
        shownLocalIgnoreReasons.add(reason);
      } catch (e) {
        logger.warn('[TarkovStore] Could not show toast notification:', e);
      }
    };
    const persistLocalOwnership = (
      userId: string,
      state: UserState,
      timestamp: number | null = null
    ) => {
      if (typeof window === 'undefined') return;
      const sanitizedState = sanitizeOwnedUserState(state);
      if (
        !safeSetItem(
          STORAGE_KEYS.progress,
          serializeUserScopedStorage(
            cloneStateSnapshot(sanitizedState),
            userId,
            timestamp ?? Date.now()
          )
        )
      ) {
        logger.warn('[TarkovStore] Could not persist local ownership metadata');
      }
    };
    const resetStoreToDefault = () => {
      const freshState = structuredClone(defaultState);
      tarkovStore.$patch((state) => {
        state.currentGameMode = freshState.currentGameMode;
        state.gameEdition = freshState.gameEdition;
        state.tarkovUid = freshState.tarkovUid;
        state.pvp = freshState.pvp;
        state.pve = freshState.pve;
      });
    };
    const loadData = async (): Promise<{
      hadRemoteData: boolean;
      needsRemoteCleanup: boolean;
      ok: boolean;
    }> => {
      const localMeta = getLocalStorageMeta();
      const storedUserId = localMeta?.storedUserId ?? null;
      const localTimestamp = localMeta?.timestamp ?? null;
      const hasLocalPersistence = Boolean(localMeta);
      let resolvedLocalState: UserState | null = null;
      let shouldPersistSanitizedLocalState = hasDeprecatedTarkovDevProfileData(tarkovStore.$state);
      let needsRemoteCleanup = false;
      if (storedUserId && storedUserId !== currentUserId) {
        logger.warn('[TarkovStore] Local progress belongs to a different user; clearing');
        clearActiveProgressStorage();
        resetStoreToDefault();
        notifyLocalIgnored('other_account');
      }
      // Get current localStorage state (loaded by persist plugin)
      let localState = sanitizeOwnedUserState(tarkovStore.$state);
      let hasLocalProgress = hasProgress(localState);
      if (!deepEqual(localState, tarkovStore.$state)) {
        patchStoreState(tarkovStore, localState);
      }
      if (preservedLocalSnapshot) {
        shouldPersistSanitizedLocalState ||= preservedLocalSnapshot.hadDeprecatedProgressData;
        localState = sanitizeOwnedUserState(preservedLocalSnapshot.state);
        hasLocalProgress = hasProgress(localState);
        if (!deepEqual(localState, tarkovStore.$state)) {
          patchStoreState(tarkovStore, localState);
        }
      } else if (!hasLocalProgress && (storedUserId === currentUserId || storedUserId === null)) {
        const persistedLocalState =
          readPersistedProgressState(currentUserId) ??
          (storedUserId !== currentUserId ? readPersistedProgressState(storedUserId) : null);
        if (persistedLocalState) {
          shouldPersistSanitizedLocalState ||= persistedLocalState.hadDeprecatedProgressData;
          localState = persistedLocalState.state;
          hasLocalProgress = hasProgress(localState);
          if (hasLocalProgress) {
            patchStoreState(tarkovStore, localState);
          }
        }
      }
      if (hasLocalProgress && !hasLocalPersistence) {
        logger.warn('[TarkovStore] Local progress exists in memory without persistence; resetting');
        resetStoreToDefault();
        localState = tarkovStore.$state;
        hasLocalProgress = hasProgress(localState);
        notifyLocalIgnored('unsaved');
      }
      const progressScore = (state: UserState): number => {
        const scoreMode = (mode: UserProgressData | undefined) => {
          if (!mode) return 0;
          return (
            Object.keys(mode.taskCompletions || {}).length +
            Object.keys(mode.taskObjectives || {}).length +
            Object.keys(mode.hideoutModules || {}).length +
            Object.keys(mode.hideoutParts || {}).length +
            getStoryProgressScore(mode) +
            (mode.level > 1 ? 1 : 0) +
            (mode.prestigeLevel || 0)
          );
        };
        return scoreMode(state.pvp) + scoreMode(state.pve);
      };
      logger.debug('[TarkovStore] Initial load starting...', {
        userId: $supabase.user.id,
        hasLocalProgress,
      });
      // Try to load from Supabase with retry logic to prevent race conditions
      let data: UserProgressRow | null = null;
      let error: { code?: string; message?: string } | null = null;
      for (let attempt = 0; attempt < LOAD_RETRY_COUNT; attempt++) {
        if (attempt > 0) {
          logger.debug(`[TarkovStore] Retry attempt ${attempt + 1}/${LOAD_RETRY_COUNT}`);
          await delay(LOAD_RETRY_DELAY_MS);
        }
        const result = await $supabase.client
          .from('user_progress')
          .select('*')
          .eq('user_id', $supabase.user.id)
          .single();
        data = result.data as UserProgressRow | null;
        error = result.error as { code?: string; message?: string } | null;
        // Break if we got data or a real error (not "no rows")
        if (data || (error && error.code !== 'PGRST116')) {
          break;
        }
      }
      logger.debug('[TarkovStore] Supabase query result:', {
        hasData: !!data,
        error: error?.code ?? null,
        errorMessage: error?.message ?? null,
      });
      const hadRemoteData = Boolean(data);
      // Handle query errors (but not "no rows" which is expected for new users)
      if (error && error.code !== 'PGRST116') {
        logger.error('[TarkovStore] Error loading data from Supabase:', error);
        return { hadRemoteData, needsRemoteCleanup, ok: false };
      }
      // Normalize Supabase data with defaults for safety
      const normalizedRemote = data
        ? sanitizeOwnedUserState({
            currentGameMode: coerceGameMode(data.current_game_mode),
            gameEdition: data.game_edition || defaultState.gameEdition,
            tarkovUid: data.tarkov_uid ?? null,
            pvp: data.pvp_data,
            pve: data.pve_data,
          })
        : null;
      const remoteScore = normalizedRemote ? progressScore(normalizedRemote) : 0;
      const localScore = progressScore(localState);
      if (data) {
        const remoteUpdatedAt = data.updated_at ? Date.parse(data.updated_at) : null;
        const localOwnedByUser = storedUserId === currentUserId;
        const remoteHadDeprecatedProgressData = hasDeprecatedTarkovDevProfileData({
          pvp: data.pvp_data,
          pve: data.pve_data,
        });
        if (hasLocalProgress && !localOwnedByUser && storedUserId === null) {
          notifyLocalIgnored('guest');
        }
        if (hasLocalProgress && localOwnedByUser) {
          const resolvedState = resolveInitialSyncState(
            localState,
            normalizedRemote!,
            localTimestamp,
            remoteUpdatedAt,
            localScore,
            remoteScore
          );
          const remoteMatchesResolved = deepEqual(resolvedState, normalizedRemote);
          if (!remoteMatchesResolved) {
            logger.warn('[TarkovStore] Startup sync merged local and remote progress', {
              localPveEpoch: toProgressEpoch(localState.pve),
              localPvpEpoch: toProgressEpoch(localState.pvp),
              localScore,
              remotePveEpoch: toProgressEpoch(normalizedRemote?.pve),
              remotePvpEpoch: toProgressEpoch(normalizedRemote?.pvp),
              remoteScore,
            });
            recordLocalSyncTime();
            const { error: upsertError } = await $supabase.client
              .from('user_progress')
              .upsert(buildUpsertPayload(currentUserId, resolvedState));
            if (upsertError) {
              logger.error('[TarkovStore] Error syncing merged progress to Supabase:', upsertError);
              return { hadRemoteData, needsRemoteCleanup, ok: false };
            }
            needsRemoteCleanup = false;
          } else {
            logger.debug('[TarkovStore] Startup sync resolved to existing remote state');
            needsRemoteCleanup = remoteHadDeprecatedProgressData;
          }
          if (!deepEqual(resolvedState, localState)) {
            tarkovStore.$patch((state) => {
              state.currentGameMode = resolvedState.currentGameMode;
              state.gameEdition = resolvedState.gameEdition;
              state.tarkovUid = resolvedState.tarkovUid;
              state.pvp = resolvedState.pvp;
              state.pve = resolvedState.pve;
            });
          }
          resolvedLocalState = resolvedState;
        } else {
          needsRemoteCleanup = remoteHadDeprecatedProgressData;
          logger.debug('[TarkovStore] Loading data from Supabase (user exists in DB)');
          tarkovStore.$patch((state) => {
            state.currentGameMode = normalizedRemote?.currentGameMode ?? state.currentGameMode;
            state.gameEdition = normalizedRemote?.gameEdition ?? state.gameEdition;
            if (
              normalizedRemote &&
              Object.prototype.hasOwnProperty.call(normalizedRemote, 'tarkovUid')
            ) {
              state.tarkovUid = normalizedRemote.tarkovUid;
            }
            state.pvp = normalizedRemote?.pvp ?? state.pvp;
            state.pve = normalizedRemote?.pve ?? state.pve;
          });
          resolvedLocalState = normalizedRemote!;
        }
      } else if (hasLocalProgress && hasLocalPersistence) {
        // No Supabase record at all, but localStorage has progress - migrate it
        logger.debug('[TarkovStore] Migrating localStorage data to Supabase');
        recordLocalSyncTime(); // Track for self-origin filtering
        const { error: upsertError } = await $supabase.client
          .from('user_progress')
          .upsert(buildUpsertPayload(currentUserId, localState));
        if (upsertError) {
          logger.error('[TarkovStore] Error migrating local data to Supabase:', upsertError);
          return { hadRemoteData, needsRemoteCleanup, ok: false };
        }
        logger.debug('[TarkovStore] Migration complete');
        resolvedLocalState = localState;
      } else {
        // SAFETY CHECKS: Before treating as "new user", verify this isn't Issue #71 scenario
        // Issue #71: User links a second OAuth provider → race condition → false "no data" → overwrites
        // Check 1: Account age
        const accountCreatedAt = $supabase.user.createdAt;
        const accountAgeMs = accountCreatedAt ? Date.now() - Date.parse(accountCreatedAt) : 0;
        const isRecentlyCreated = accountAgeMs < ISSUE_71_ACCOUNT_AGE_THRESHOLD_MS;
        // Check 2: Multiple OAuth providers - strongest signal of Issue #71
        const linkedProviders = $supabase.user.providers || [];
        const hasMultipleProviders = linkedProviders.length > 1;
        // ONLY block if hasMultipleProviders (Issue #71 scenario)
        // OLD accounts with single provider are legitimate first-time users who waited to log in
        if (hasMultipleProviders) {
          // Multiple providers + no data = Issue #71 race condition
          logger.error(
            '[TarkovStore] SAFETY ABORT: Multi-provider account with no progress data (Issue #71)',
            {
              accountAgeMs,
              isRecentlyCreated,
              linkedProviders,
              hasMultipleProviders,
              userId: $supabase.user.id,
            }
          );
          // Reset to default state but DO NOT sync to Supabase
          // This prevents overwriting potentially existing data
          resetStoreToDefault();
          // Notify user of the issue
          toastI18n.showLoadFailed();
          return { hadRemoteData: false, needsRemoteCleanup, ok: false };
        }
        // All safety checks passed - truly new user (or old account, first login)
        logger.debug('[TarkovStore] New user - no existing progress found', {
          accountAgeMs,
          linkedProviders,
        });
      }
      if (
        currentUserId &&
        hasLocalPersistence &&
        (shouldPersistSanitizedLocalState || (storedUserId === null && resolvedLocalState))
      ) {
        persistLocalOwnership(currentUserId, resolvedLocalState ?? localState, localTimestamp);
      }
      logger.debug('[TarkovStore] Initial load complete');
      return { hadRemoteData, needsRemoteCleanup, ok: true };
    };
    // Wait for data load to complete BEFORE enabling sync
    // This prevents race conditions and overwriting server data with empty local state
    const loadResult = await loadData();
    if (!loadResult.ok) {
      logger.error('[TarkovStore] Initial load failed; sync not started');
      throw new Error('Supabase initial load failed');
    }
    syncMetadataAfterStartup(tarkovStore);
    if (preservedLocalSnapshot) {
      pendingResetProgressSnapshot = null;
    }
    // Repair failed task states for existing users (runs once after data load)
    // This reapplies valid branch failures and clears stale failed flags
    const completionSchemaMigration = tarkovStore.migrateTaskCompletionSchema();
    const failedRepairResult = tarkovStore.repairFailedTaskStates();
    const completedObjectivesRepairResult = tarkovStore.repairCompletedTaskObjectives();
    const hasCompletionSchemaMigration =
      completionSchemaMigration.pvpMigrated > 0 || completionSchemaMigration.pveMigrated > 0;
    const hasRepairChanges =
      failedRepairResult.pvpRepaired > 0 ||
      failedRepairResult.pveRepaired > 0 ||
      completedObjectivesRepairResult.pvpRepaired > 0 ||
      completedObjectivesRepairResult.pveRepaired > 0;
    if (hasCompletionSchemaMigration || hasRepairChanges || loadResult.needsRemoteCleanup) {
      try {
        recordLocalSyncTime();
        const { error: upsertError } = await $supabase.client
          .from('user_progress')
          .upsert(buildUpsertPayload(currentUserId, tarkovStore.$state));
        if (upsertError) {
          throw upsertError;
        }
      } catch (error) {
        logger.error('[TarkovStore] Failed to persist post-load data migration/repair:', error);
        throw error;
      }
    }
    const startSync = () => {
      if (syncController) return;
      if (pendingSyncWatchStop) {
        pendingSyncWatchStop();
        pendingSyncWatchStop = null;
      }
      syncUserId = currentUserId ?? null;
      syncController = useSupabaseSync({
        store: tarkovStore,
        table: 'user_progress',
        debounceMs: SYNC_DEBOUNCE_MS,
        onSynced: () => {
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel(`tarkov-progress:${$supabase.user.id}`);
            bc.postMessage('updated');
            bc.close();
          }
        },
        transform: (userState: UserState) => {
          // SAFETY CHECK: Prevent syncing completely empty state for existing accounts
          // This protects against accidental data overwrites during edge cases
          const stateHasProgress = hasProgress(userState);
          if (!stateHasProgress && loadResult.hadRemoteData) {
            logger.warn(
              '[TarkovStore] Blocking sync of empty state - account had remote data on load'
            );
            return null; // Returning null prevents the sync
          }
          // Track sync time for self-origin filtering in realtime listener
          recordLocalSyncTime();
          const sanitizedUserState = sanitizeOwnedUserState(userState);
          return {
            user_id: $supabase.user.id,
            current_game_mode: sanitizedUserState.currentGameMode || GAME_MODES.PVP,
            game_edition:
              typeof sanitizedUserState.gameEdition === 'string'
                ? parseInt(sanitizedUserState.gameEdition)
                : sanitizedUserState.gameEdition,
            tarkov_uid: sanitizedUserState.tarkovUid ?? null,
            pvp_data: sanitizedUserState.pvp,
            pve_data: sanitizedUserState.pve,
          };
        },
      });
    };
    const shouldStartSyncNow = loadResult.hadRemoteData || hasProgress(tarkovStore.$state);
    if (shouldStartSyncNow) {
      startSync();
    } else {
      logger.debug('[TarkovStore] Delaying sync until progress exists');
      const stopWatch = watch(
        () => hasProgress(tarkovStore.$state),
        (hasTrackedProgress) => {
          if (hasTrackedProgress) {
            startSync();
          }
        },
        { flush: 'post' }
      );
      pendingSyncWatchStop = stopWatch;
    }
    // MULTI-DEVICE CONFLICT RESOLUTION
    // Setup realtime listener for remote changes from other devices
    setupRealtimeListener();
  }
}
// Realtime channel for multi-device sync
let realtimeChannel: unknown = null;
let lastLocalSyncTime = 0; // Track when we last synced locally to filter self-origin updates
let deprecatedRemoteCleanupInFlight = false;
let lastDeprecatedRemoteCleanupAttemptAt = 0;
let deprecatedRemoteCleanupFailureCount = 0;
const recentLocalSyncTimes: number[] = [];
const recordLocalSyncTime = () => {
  const now = Date.now();
  lastLocalSyncTime = now;
  recentLocalSyncTimes.push(now);
  if (recentLocalSyncTimes.length > RECENT_LOCAL_SYNC_HISTORY_SIZE) {
    recentLocalSyncTimes.shift();
  }
};
const isLikelySelfOriginUpdate = (updateTime: number) => {
  if (!Number.isFinite(updateTime)) return false;
  return recentLocalSyncTimes.some((syncTime) => {
    return Math.abs(updateTime - syncTime) < SELF_ORIGIN_THRESHOLD_MS;
  });
};
const getDeprecatedRemoteCleanupCooldownMs = () =>
  deprecatedRemoteCleanupFailureCount >= DEPRECATED_REMOTE_CLEANUP_FAST_RETRY_LIMIT
    ? DEPRECATED_REMOTE_CLEANUP_FAILURE_BACKOFF_MS
    : SELF_ORIGIN_THRESHOLD_MS;
const lastApiUpdateIds: { pvp: string | null; pve: string | null } = { pvp: null, pve: null };
const getToastTranslator = (): ToastTranslate => {
  try {
    const { $i18n } = useNuxtApp();
    if (typeof $i18n?.t === 'function') {
      return $i18n.t.bind($i18n) as ToastTranslate;
    }
  } catch (e) {
    logger.warn('[TarkovStore] Could not resolve i18n translator for API update toast:', e);
  }
  return (key: string, params?: Record<string, unknown>) => {
    if (key === 'toast.api_updated.label.single') return 'Task updated';
    if (key === 'toast.api_updated.label.plural') return 'Tasks updated';
    if (key === 'toast.api_updated.state.completed') return 'completed';
    if (key === 'toast.api_updated.state.failed') return 'failed';
    if (key === 'toast.api_updated.state.uncompleted') return 'uncompleted';
    if (key === 'toast.api_updated.more' && typeof params?.count === 'number') {
      return `, +${params.count} more`;
    }
    if (key === 'toast.api_updated.description_fallback')
      return 'Your progress was updated via API.';
    return key;
  };
};
const formatApiUpdateDescription = (
  updates: ApiTaskUpdate[],
  metadataStore: ReturnType<typeof useMetadataStore>,
  translate: ToastTranslate
): string => {
  if (!updates.length) return translate('toast.api_updated.description_fallback');
  const previewLimit = 3;
  const label = translate(
    updates.length === 1 ? 'toast.api_updated.label.single' : 'toast.api_updated.label.plural'
  );
  const formatted = updates.slice(0, previewLimit).map((update) => {
    const taskName = metadataStore.getTaskById(update.id)?.name ?? update.id;
    const state = translate(`toast.api_updated.state.${update.state}`);
    return `${taskName} -> ${state}`;
  });
  const remaining = updates.length - previewLimit;
  const suffix = remaining > 0 ? translate('toast.api_updated.more', { count: remaining }) : '';
  return `${label}: ${formatted.join(', ')}${suffix}.`;
};
const getApiUpdateMeta = (data: UserProgressData | undefined): ApiUpdateMeta | null => {
  return normalizeApiUpdateMetaEntry(data?.lastApiUpdate);
};
const maybeNotifyApiUpdate = (
  mode: 'pvp' | 'pve',
  data: UserProgressData | undefined,
  metadataStore: ReturnType<typeof useMetadataStore>,
  updateTime: number,
  toastI18n: ReturnType<typeof useToastI18n>
): boolean => {
  const meta = getApiUpdateMeta(data);
  if (!meta || lastApiUpdateIds[mode] === meta.id) return false;
  if (Math.abs(updateTime - meta.at) > API_UPDATE_FRESHNESS_MS) return false;
  lastApiUpdateIds[mode] = meta.id;
  const translate = getToastTranslator();
  const description = formatApiUpdateDescription(
    normalizeApiTaskUpdates(meta.tasks),
    metadataStore,
    translate
  );
  toastI18n.showApiUpdated(description);
  return true;
};
export const runApiUpdateHandlers = (handlers: Array<() => boolean>): boolean => {
  let handled = false;
  for (const handler of handlers) {
    handled = handler() || handled;
  }
  return handled;
};
/**
 * Detect if there are actual data conflicts between local and remote state.
 * A conflict occurs when both local and remote have different values for the same field,
 * not just when remote has new data that local doesn't have.
 * Returns { hasConflict, conflictCount } to determine notification behavior.
 */
function detectDataConflicts(
  local: UserProgressData | undefined,
  remote: UserProgressData | undefined
): { hasConflict: boolean; conflictCount: number } {
  if (!local || !remote) return { hasConflict: false, conflictCount: 0 };
  let conflictCount = 0;
  // Check task completion conflicts (different complete/failed status for same task)
  const localTasks = local.taskCompletions || {};
  const remoteTasks = remote.taskCompletions || {};
  for (const taskId of Object.keys(remoteTasks)) {
    const localTask = localTasks[taskId] as RawTaskCompletion;
    const remoteTask = remoteTasks[taskId] as RawTaskCompletion;
    if (
      localTask !== undefined &&
      localTask !== null &&
      remoteTask !== undefined &&
      remoteTask !== null
    ) {
      const localFlags = getCompletionFlags(localTask);
      const remoteFlags = getCompletionFlags(remoteTask);
      if (
        localFlags.complete !== remoteFlags.complete ||
        localFlags.failed !== remoteFlags.failed
      ) {
        conflictCount++;
      }
    }
    // Remote has task that local doesn't = not a conflict, just new data
  }
  // Check task objective conflicts (different counts for same objective)
  const localObjectives = local.taskObjectives || {};
  const remoteObjectives = remote.taskObjectives || {};
  for (const objId of Object.keys(remoteObjectives)) {
    const localObj = localObjectives[objId];
    const remoteObj = remoteObjectives[objId];
    if (localObj && remoteObj) {
      // Normalize counts to 0 and booleans to false when undefined
      if (
        (localObj.count ?? 0) !== (remoteObj.count ?? 0) ||
        (localObj.complete ?? false) !== (remoteObj.complete ?? false)
      ) {
        conflictCount++;
      }
    }
  }
  // Check hideout module conflicts
  const localModules = local.hideoutModules || {};
  const remoteModules = remote.hideoutModules || {};
  for (const modId of Object.keys(remoteModules)) {
    const localMod = localModules[modId];
    const remoteMod = remoteModules[modId];
    // Normalize booleans to false when undefined
    if (localMod && remoteMod && (localMod.complete ?? false) !== (remoteMod.complete ?? false)) {
      conflictCount++;
    }
  }
  // Check hideout part conflicts
  const localParts = local.hideoutParts || {};
  const remoteParts = remote.hideoutParts || {};
  for (const partId of Object.keys(remoteParts)) {
    const localPart = localParts[partId];
    const remotePart = remoteParts[partId];
    if (localPart && remotePart) {
      // Normalize counts to 0 and booleans to false when undefined
      if (
        (localPart.count ?? 0) !== (remotePart.count ?? 0) ||
        (localPart.complete ?? false) !== (remotePart.complete ?? false)
      ) {
        conflictCount++;
      }
    }
  }
  return { hasConflict: conflictCount > 0, conflictCount };
}
/**
 * Setup realtime listener for user_progress changes from other devices
 * This prevents silent data overwrites when using multiple devices simultaneously
 */
function setupRealtimeListener() {
  const { $supabase } = useNuxtApp();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const toastI18n = useToastI18n();
  const currentUserId = $supabase.user.id;
  if (!$supabase.user.loggedIn || !currentUserId) return;
  // Clean up existing channel if any
  if (realtimeChannel) {
    $supabase.client.removeChannel(
      realtimeChannel as Parameters<typeof $supabase.client.removeChannel>[0]
    );
    realtimeChannel = null;
  }
  logger.debug('[TarkovStore] Setting up realtime listener for multi-device sync');
  realtimeChannel = $supabase.client
    .channel(`user_progress_${currentUserId}`)
    .on(
      'postgres_changes' as const,
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_progress',
        filter: `user_id=eq.${currentUserId}`,
      },
      (payload: { new: unknown; old: unknown }) => {
        const remoteData = payload.new as {
          current_game_mode?: string;
          game_edition?: number;
          tarkov_uid?: number | null;
          pvp_data?: UserProgressData;
          pve_data?: UserProgressData;
          updated_at?: string;
        };
        const parsedUpdateTime = remoteData.updated_at ? Date.parse(remoteData.updated_at) : NaN;
        const updateTime = Number.isNaN(parsedUpdateTime) ? Date.now() : parsedUpdateTime;
        const timeSinceLastSync = updateTime - lastLocalSyncTime;
        const remoteHadDeprecatedProgressData = hasDeprecatedTarkovDevProfileData({
          pvp: remoteData.pvp_data,
          pve: remoteData.pve_data,
        });
        // Get current local state
        const localState = sanitizeOwnedUserState(tarkovStore.$state);
        // Merge remote changes with local state
        const merged: Partial<UserState> = {
          currentGameMode: remoteData.current_game_mode
            ? coerceGameMode(remoteData.current_game_mode)
            : localState.currentGameMode,
          gameEdition: remoteData.game_edition || localState.gameEdition,
          pvp: mergeProgressData(localState.pvp, sanitizeOwnedProgressData(remoteData.pvp_data)),
          pve: mergeProgressData(localState.pve, sanitizeOwnedProgressData(remoteData.pve_data)),
        };
        const nextState: UserState = {
          currentGameMode: merged.currentGameMode ?? localState.currentGameMode,
          gameEdition: merged.gameEdition ?? localState.gameEdition,
          tarkovUid: Object.prototype.hasOwnProperty.call(remoteData, 'tarkov_uid')
            ? (remoteData.tarkov_uid ?? null)
            : (localState.tarkovUid ?? null),
          pvp: merged.pvp ?? localState.pvp,
          pve: merged.pve ?? localState.pve,
        };
        const cleanupDeprecatedRemoteProgress = async () => {
          if (deprecatedRemoteCleanupInFlight) {
            return;
          }
          if (!$supabase.user.loggedIn || $supabase.user.id !== currentUserId) {
            return;
          }
          const now = Date.now();
          const cleanupCooldownMs = getDeprecatedRemoteCleanupCooldownMs();
          if (
            lastDeprecatedRemoteCleanupAttemptAt > 0 &&
            now - lastDeprecatedRemoteCleanupAttemptAt < cleanupCooldownMs
          ) {
            return;
          }
          deprecatedRemoteCleanupInFlight = true;
          lastDeprecatedRemoteCleanupAttemptAt = now;
          recordLocalSyncTime();
          try {
            const { error } = await $supabase.client
              .from('user_progress')
              .upsert(buildUpsertPayload(currentUserId, nextState));
            if (error) {
              deprecatedRemoteCleanupFailureCount += 1;
              logger.error(
                '[TarkovStore] Failed to clean deprecated remote progress payload:',
                {
                  cooldownMs: getDeprecatedRemoteCleanupCooldownMs(),
                  failureCount: deprecatedRemoteCleanupFailureCount,
                },
                error
              );
              return;
            }
            deprecatedRemoteCleanupFailureCount = 0;
            lastDeprecatedRemoteCleanupAttemptAt = 0;
            logger.debug('[TarkovStore] Cleaned deprecated remote progress payload');
          } finally {
            deprecatedRemoteCleanupInFlight = false;
          }
        };
        const stateUnchanged = deepEqual(nextState, localState);
        const isLikelySelfOrigin = isLikelySelfOriginUpdate(updateTime);
        if (remoteHadDeprecatedProgressData) {
          void cleanupDeprecatedRemoteProgress();
        }
        if (isLikelySelfOrigin && stateUnchanged) {
          logger.debug('[TarkovStore] Ignoring realtime update - likely self-origin', {
            timeSinceLastSync,
            threshold: SELF_ORIGIN_THRESHOLD_MS,
          });
          return;
        }
        if (stateUnchanged) {
          logger.debug('[TarkovStore] Realtime update matches local state; skipping patch');
          return;
        }
        // Detect actual data conflicts (not just new data from API/other sources)
        const pvpConflicts = detectDataConflicts(localState.pvp, remoteData.pvp_data);
        const pveConflicts = detectDataConflicts(localState.pve, remoteData.pve_data);
        const hasRealConflict = pvpConflicts.hasConflict || pveConflicts.hasConflict;
        const totalConflicts = pvpConflicts.conflictCount + pveConflicts.conflictCount;
        const apiUpdateHandled = runApiUpdateHandlers([
          () =>
            maybeNotifyApiUpdate('pvp', remoteData.pvp_data, metadataStore, updateTime, toastI18n),
          () =>
            maybeNotifyApiUpdate('pve', remoteData.pve_data, metadataStore, updateTime, toastI18n),
        ]);
        logger.debug('[TarkovStore] Remote update detected, applying changes', {
          hasRealConflict,
          totalConflicts,
          isLikelySelfOrigin,
        });
        // Pause local sync to prevent update loop
        const controller = getSyncController();
        if (controller) {
          controller.pause();
        }
        // Apply merged state
        tarkovStore.$patch((state) => {
          state.currentGameMode = nextState.currentGameMode;
          state.gameEdition = nextState.gameEdition;
          state.tarkovUid = nextState.tarkovUid;
          state.pvp = nextState.pvp;
          state.pve = nextState.pve;
        });
        setTimeout(() => {
          const currentController = getSyncController();
          if (currentController && currentController === controller) {
            currentController.resume();
          }
        }, SYNC_RESUME_DELAY_MS);
        // Only notify user if there was an actual data conflict that required merging
        // Silent sync for API updates or other-device updates that don't conflict
        if (hasRealConflict && !apiUpdateHandled && !isLikelySelfOrigin) {
          toastI18n.showProgressMerged(totalConflicts);
        }
      }
    )
    .subscribe((status: string) => {
      logger.debug(`[TarkovStore] Realtime subscription status: ${status}`);
    });
}
// Re-export mergeProgressData for external consumers
export { mergeProgressData } from '@/stores/tarkov/progressMerge';
/**
 * Cleanup realtime listener on disconnect
 */
function cleanupRealtimeListener() {
  if (realtimeChannel) {
    const { $supabase } = useNuxtApp();
    $supabase.client.removeChannel(
      realtimeChannel as Parameters<typeof $supabase.client.removeChannel>[0]
    );
    realtimeChannel = null;
    logger.debug('[TarkovStore] Cleaned up realtime listener');
  }
}
