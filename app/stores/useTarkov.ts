import { type _GettersTree, defineStore } from 'pinia';
import { useToastI18n, type LocalIgnoredReason } from '@/composables/useToastI18n';
import {
  actions,
  defaultState,
  getters,
  migrateToGameModeStructure,
  type UserActions,
  type UserProgressData,
  type UserState,
} from '@/stores/progressState';
import {
  enforceHideoutPrereqs,
  notifyHideoutPrereqEnforcement,
} from '@/stores/tarkov/hideoutPrereqs';
import {
  clearProgressStorageSafely,
  cloneStateSnapshot,
  getPreservedProgressStorageValue,
  safeSetItem,
} from '@/stores/tarkov/localStorage';
import {
  markProgressMetadataHydrated,
  registerTarkovMetadataHooks,
  resetProgressMetadataHydration,
} from '@/stores/tarkov/metadataStoreBridge';
import {
  buildPrestigeResetData,
  buildPrestigeRunSummary,
  clampPrestigeLevel,
  parsePrestigeRunRows,
  type PrestigeRunRecord,
  type UserPrestigeRunRow,
} from '@/stores/tarkov/prestige';
import { getNextProgressEpoch, hasProgress } from '@/stores/tarkov/progressMerge';
import {
  countStoryIdChanges,
  migrateTaskCompletionSchemas,
  needsGameModeMigration,
  reconcileStoryObjectiveIds,
  type StoryIdChanges,
} from '@/stores/tarkov/progressMigration';
import { syncProgressState } from '@/stores/tarkov/progressPersistence';
import { repairCompletedProgress, repairFailedProgress } from '@/stores/tarkov/progressRepair';
import { progressStorePersist } from '@/stores/tarkov/progressStorePersist';
import {
  registerSyncControllerGetter,
  setupRealtimeListener,
} from '@/stores/tarkov/realtimeListener';
import { executeWithSyncPause, performReset } from '@/stores/tarkov/resetEngine';
import { loadInitialProgress } from '@/stores/tarkov/startupLoad';
import {
  beginStartupOwnership,
  invalidateStartupOwnership,
  type StartupOwnershipGuard,
} from '@/stores/tarkov/startupOwnership';
import { ProgressSyncSession } from '@/stores/tarkov/syncSession';
import { recordLocalSyncTime } from '@/stores/tarkov/syncTimeline';
import { useMetadataStore } from '@/stores/useMetadata';
import { GAME_MODES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { getCurrentSupabaseUserId } from '@/utils/userScopedStorage';
export type { PrestigeRunRecord } from '@/stores/tarkov/prestige';
type TarkovStoreInstance = UserState & {
  $state: UserState;
  $patch(partialOrMutator: Partial<UserState> | ((state: UserState) => void)): void;
  migrateTaskCompletionSchema(): number;
};
const assertPrestigeMode = (mode: GameMode) => {
  if (mode === GAME_MODES.SEASONAL) throw new Error('Prestige is not supported for Seasonal PvP.');
  if (mode === GAME_MODES.PVE) throw new Error('Prestige is not supported for PvE.');
};
const requirePrestigeSession = () => {
  const { $supabase } = useNuxtApp();
  const userId = $supabase.user.id;
  if (!$supabase.user.loggedIn || !userId) {
    throw new Error('User not logged in. Cannot prestige profile.');
  }
  return { $supabase, userId };
};
const patchProgressState = (store: TarkovStoreInstance, nextState: UserState) => {
  store.$patch((state) => {
    state.currentGameMode = nextState.currentGameMode;
    state.gameEdition = nextState.gameEdition;
    state.tarkovUid = nextState.tarkovUid;
    state.pvp = nextState.pvp;
    state.pve = nextState.pve;
    state.seasonal = nextState.seasonal;
  });
};
const throwSyncError = (error: { message: string } | null, message: string) => {
  if (error) throw new Error(`${message}: ${error.message}`);
};
const buildOnlineResetState = (store: TarkovStoreInstance): UserState => {
  const freshState = structuredClone(defaultState);
  freshState.pvp.progressEpoch = getNextProgressEpoch(store.pvp);
  freshState.pve.progressEpoch = getNextProgressEpoch(store.pve);
  freshState.seasonal.progressEpoch = getNextProgressEpoch(store.seasonal);
  return freshState;
};
const persistOnlineReset = async (
  store: TarkovStoreInstance,
  client: ReturnType<typeof useNuxtApp>['$supabase']['client'],
  userId: string
) => {
  const freshState = buildOnlineResetState(store);
  const { error } = await syncProgressState(client, userId, freshState);
  throwSyncError(error, 'Failed to reset online profile');
  clearProgressStorage();
  patchProgressState(store, freshState);
};
const persistPrestigeLevel = async (
  store: TarkovStoreInstance,
  mode: GameMode,
  nextModeData: UserProgressData
) => {
  const { $supabase } = useNuxtApp();
  if (!$supabase.user.loggedIn || !$supabase.user.id) return;
  const nextState = cloneStateSnapshot(store.$state);
  nextState[mode] = nextModeData;
  const { error } = await syncProgressState($supabase.client, $supabase.user.id, nextState);
  if (error) throw new Error(`Failed to sync prestige level: ${error.message}`);
  recordLocalSyncTime();
};
const syncProgressIfLoggedIn = async (store: TarkovStoreInstance, errorMessage: string) => {
  const { $supabase } = useNuxtApp();
  const userId = $supabase.user.id;
  if (!$supabase.user.loggedIn || !userId) return;
  try {
    recordLocalSyncTime();
    const { error } = await syncProgressState($supabase.client, userId, store.$state);
    throwSyncError(error, errorMessage);
  } catch (error) {
    logger.error(errorMessage, error);
  }
};
const archivePrestigeRun = async (store: TarkovStoreInstance, mode: GameMode) => {
  const { $supabase } = useNuxtApp();
  const currentPrestige = clampPrestigeLevel(store[mode].prestigeLevel ?? 0);
  if (currentPrestige >= 6) throw new Error('Maximum prestige level reached.');
  const nextPrestige = currentPrestige + 1;
  const archivedProgress = cloneStateSnapshot(store[mode]);
  const resetModeData = buildPrestigeResetData(archivedProgress, nextPrestige);
  const nextState = cloneStateSnapshot(store.$state);
  nextState[mode] = resetModeData;
  const currentGameMode = store.$state.currentGameMode;
  const gameEdition = store.$state.gameEdition;
  const tarkovUid = store.$state.tarkovUid;
  const { error } = await $supabase.client.rpc('archive_prestige_run_and_reset_progress', {
    p_archived_progress: archivedProgress,
    p_created_at: new Date().toISOString(),
    p_current_game_mode: currentGameMode,
    p_game_edition: gameEdition,
    p_mode: mode,
    p_prestige_from: currentPrestige,
    p_prestige_to: nextPrestige,
    p_pve_data: nextState.pve,
    p_pvp_data: nextState.pvp,
    p_summary: buildPrestigeRunSummary(archivedProgress),
    p_tarkov_uid: tarkovUid,
  });
  throwSyncError(error, 'Failed to update prestige progress');
  recordLocalSyncTime();
  store.$patch((state) => {
    state[mode] = resetModeData;
  });
};
// ============================================================================
// Store Definition
// ============================================================================
const tarkovGetters = {
  ...getters,
} satisfies _GettersTree<UserState>;
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
    await syncProgressIfLoggedIn(this, 'Error syncing gamemode to backend:');
  },
  async migrateDataIfNeeded(this: TarkovStoreInstance) {
    const needsMigration = needsGameModeMigration(this.$state);
    const schemaChanges = this.migrateTaskCompletionSchema();
    if (needsMigration) {
      logger.debug('Migrating legacy data structure to gamemode-aware structure');
      this.$patch(migrateToGameModeStructure(cloneStateSnapshot(this.$state)));
      this.migrateTaskCompletionSchema();
    }
    if (!needsMigration && schemaChanges === 0) return;
    await syncProgressIfLoggedIn(
      this,
      needsMigration
        ? 'Error saving migrated data to Supabase:'
        : 'Error saving task completion migration to Supabase:'
    );
  },
  /** Reconcile story objective marks with the chapter catalog; runs on every catalog load. */
  migrateStoryObjectiveIds(this: TarkovStoreInstance, mode?: GameMode) {
    const metadataStore = useMetadataStore();
    // The catalog records its own mode. `currentGameMode` changes when a switch starts, before the
    // new catalog replaces the old one, so reading it here could label stale chapters as the new mode.
    return reconcileStoryObjectiveIds(
      this,
      { chapters: metadataStore.storyChapters ?? [], mode: metadataStore.storyChaptersGameMode },
      mode
    );
  },
  migrateTaskCompletionSchema(this: TarkovStoreInstance) {
    return migrateTaskCompletionSchemas(this);
  },
  /** Re-apply legitimate branch failures and clear stale failed flags. Returns changes made. */
  repairFailedTaskStates(this: TarkovStoreInstance) {
    return repairFailedProgress(this, useMetadataStore().tasks ?? []);
  },
  /** Ensure every completed task has all its objectives complete. Returns changes made. */
  repairCompletedTaskObjectives(this: TarkovStoreInstance) {
    return repairCompletedProgress(this, useMetadataStore().tasks ?? []);
  },
  async resetOnlineProfile(this: TarkovStoreInstance) {
    const { $supabase } = useNuxtApp();
    if (!$supabase.user.loggedIn || !$supabase.user.id) {
      logger.error('User not logged in. Cannot reset online profile.');
      return;
    }
    try {
      await persistOnlineReset(this, $supabase.client, $supabase.user.id);
    } catch (error) {
      logger.error('Error resetting online profile:', error);
    }
  },
  async resetCurrentGameModeData(this: TarkovStoreInstance) {
    const tarkovStore = useTarkovStore();
    const currentMode = tarkovStore.getCurrentGameMode();
    await executeWithSyncPause(() => performReset(currentMode, this));
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
  async resetSeasonalData(this: TarkovStoreInstance) {
    logger.debug('[TarkovStore] Resetting Seasonal data...');
    await executeWithSyncPause(() => performReset('seasonal', this));
    logger.debug('[TarkovStore] Seasonal data reset complete');
  },
  async resetAllData(this: TarkovStoreInstance) {
    logger.debug('[TarkovStore] Resetting all data (PvP, PvE, and Seasonal)...');
    await executeWithSyncPause(() => performReset('all', this));
    logger.debug('[TarkovStore] All data reset complete');
  },
  async syncPvpPrestigeLevel(this: TarkovStoreInstance, level: number) {
    await tarkovActions.syncPrestigeLevel.call(this, GAME_MODES.PVP, level);
  },
  async syncPrestigeLevel(this: TarkovStoreInstance, mode: GameMode, level: number) {
    assertPrestigeMode(mode);
    const nextPrestigeLevel = clampPrestigeLevel(level);
    const currentPrestigeLevel = clampPrestigeLevel(this[mode].prestigeLevel || 0);
    if (nextPrestigeLevel === currentPrestigeLevel) return;
    const nextModeData = cloneStateSnapshot(this[mode]);
    nextModeData.prestigeLevel = nextPrestigeLevel;
    // ponytail: do NOT bump progressEpoch here. The epoch contract is "a full
    // reset/prestige wipe happened and wins over older progress"; bumping it for
    // a prestige-level-only edit makes mergeProgressData's epoch early-return
    // silently drop the other device's storyChapters (storyline progress loss).
    await persistPrestigeLevel(this, mode, nextModeData);
    this.$patch((state) => {
      state[mode] = nextModeData;
    });
  },
  async prestigePvP(this: TarkovStoreInstance) {
    await tarkovActions.prestigeMode.call(this, GAME_MODES.PVP);
  },
  async prestigeMode(this: TarkovStoreInstance, mode: GameMode) {
    assertPrestigeMode(mode);
    requirePrestigeSession();
    await executeWithSyncPause(() => archivePrestigeRun(this, mode));
  },
  async fetchPrestigeRuns(
    this: TarkovStoreInstance,
    mode: GameMode = GAME_MODES.PVP,
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
  async deletePrestigeRun(
    this: TarkovStoreInstance,
    runId: string,
    mode: GameMode = GAME_MODES.PVP
  ) {
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
} satisfies UserActions & {
  switchGameMode(mode: GameMode): Promise<void>;
  migrateDataIfNeeded(): Promise<void>;
  migrateStoryObjectiveIds(mode?: GameMode): StoryIdChanges;
  migrateTaskCompletionSchema(): number;
  repairFailedTaskStates(): number;
  repairCompletedTaskObjectives(): number;
  resetOnlineProfile(): Promise<void>;
  resetCurrentGameModeData(): Promise<void>;
  resetPvPData(): Promise<void>;
  resetPvEData(): Promise<void>;
  resetSeasonalData(): Promise<void>;
  resetAllData(): Promise<void>;
  syncPvpPrestigeLevel(level: number): Promise<void>;
  syncPrestigeLevel(mode: GameMode, level: number): Promise<void>;
  prestigePvP(): Promise<void>;
  prestigeMode(mode: GameMode): Promise<void>;
  fetchPrestigeRuns(mode?: GameMode, limit?: number): Promise<PrestigeRunRecord[]>;
  deletePrestigeRun(runId: string, mode?: GameMode): Promise<void>;
  setTasksAndObjectivesUncompleted(taskIds: string[], objectiveIds: string[]): void;
  enforceHideoutPrereqsNow(): number;
};
export const useTarkovStore = defineStore('swapTarkov', {
  state: () => structuredClone(defaultState),
  getters: tarkovGetters,
  actions: tarkovActions,
  persist: progressStorePersist,
});
type TarkovStore = ReturnType<typeof useTarkovStore>;
// ============================================================================
// Sync Lifecycle
// ============================================================================
const progressSync = new ProgressSyncSession();
registerSyncControllerGetter(progressSync.getController);
registerTarkovMetadataHooks({
  getCurrentGameMode: () => useTarkovStore().getCurrentGameMode(),
  repairCompletedTaskObjectives: () => {
    useTarkovStore().repairCompletedTaskObjectives();
  },
  repairFailedTaskStates: () => {
    useTarkovStore().repairFailedTaskStates();
  },
  migrateStoryObjectiveIds: () => {
    useTarkovStore().migrateStoryObjectiveIds();
  },
});
const METADATA_REFRESH_FAILURE_EVENT = 'metadata.refresh.failure';
/** Fence new metadata work; already-dispatched public catalogs retain their own scope guards. */
const refreshStartupMetadata = async (
  tarkovStore: TarkovStore,
  isStartupCurrent: StartupOwnershipGuard
): Promise<void> => {
  const metadataStore = useMetadataStore();
  if (!isStartupCurrent()) return;
  await metadataStore.initialize({ gameMode: tarkovStore.getCurrentGameMode() });
  if (!isStartupCurrent()) return;
  if (metadataStore.currentGameMode === tarkovStore.getCurrentGameMode()) return;
  await metadataStore.refresh();
};
/** Report metadata failures only for the startup that still owns the session. */
const reportStartupMetadataFailure = (
  tarkovStore: TarkovStore,
  isStartupCurrent: StartupOwnershipGuard,
  error: unknown
): void => {
  if (!isStartupCurrent()) return;
  const metadataStore = useMetadataStore();
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
};
const syncMetadataAfterStartup = (
  tarkovStore: TarkovStore,
  isStartupCurrent: StartupOwnershipGuard
) => {
  const metadataStore = useMetadataStore();
  if (metadataStore.currentGameMode === tarkovStore.getCurrentGameMode()) {
    return;
  }
  void (async () => {
    try {
      await refreshStartupMetadata(tarkovStore, isStartupCurrent);
    } catch (error) {
      reportStartupMetadataFailure(tarkovStore, isStartupCurrent, error);
    }
  })();
};
/**
 * Tear down the live progress sync and optionally preserve scoped progress across auth transitions.
 * @param reason Optional log context for the reset.
 * @param options When `preservePersistedStateForUserId` is provided as `string | null`, that user's
 * persisted progress is captured so it survives the auth handoff. Omitting `options` clears it.
 */
export function resetTarkovSync(
  reason?: string,
  options?: { preservePersistedStateForUserId?: string | null }
) {
  invalidateStartupOwnership();
  progressSync.preserveSnapshot(options);
  progressSync.reset(reason);
}
export function resetTarkovStoreForSessionTransition(
  previousUserId: string | null = null,
  reason?: string
) {
  const preservedState = getPreservedProgressStorageValue(previousUserId);
  const currentUserId = getCurrentSupabaseUserId();
  resetProgressMetadataHydration();
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
/** Returns false when a sync for `userId` is already running; resets a sync owned by another user. */
const claimSyncStartup = (userId: string): boolean => {
  if (progressSync.isActiveFor(userId)) {
    logger.debug('[TarkovStore] Supabase sync already initialized, skipping');
    return false;
  }
  if (progressSync.isActive()) {
    logger.warn('[TarkovStore] Supabase sync user changed; resetting');
    resetProgressMetadataHydration();
    resetTarkovSync('user changed');
  }
  return true;
};
/**
 * Fence account-scoped continuations after every await. Generation detects A→B→A; live identity
 * also covers changes before the auth watcher flushes.
 */
const beginOwnedStartup = (userId: string): StartupOwnershipGuard => {
  const { $supabase } = useNuxtApp();
  const ownsStartup = beginStartupOwnership();
  return () => ownsStartup() && $supabase.user.loggedIn === true && $supabase.user.id === userId;
};
const createLocalIgnoreNotifier = (toastI18n: ReturnType<typeof useToastI18n>) => {
  return (reason: LocalIgnoredReason) => {
    if (!import.meta.client || !progressSync.claimLocalIgnoreToast(reason)) return;
    try {
      toastI18n.showLocalIgnored(reason);
    } catch (e) {
      progressSync.releaseLocalIgnoreToast(reason);
      logger.warn('[TarkovStore] Could not show toast notification:', e);
    }
  };
};
/** Migrate and repair freshly loaded progress (reapplies branch failures, clears stale flags). */
const applyPostLoadRepairs = (store: TarkovStore): number =>
  store.migrateTaskCompletionSchema() +
  countStoryIdChanges(store.migrateStoryObjectiveIds()) +
  store.repairFailedTaskStates() +
  store.repairCompletedTaskObjectives();
const persistPostLoadChanges = async (
  store: TarkovStore,
  userId: string,
  isStartupCurrent: StartupOwnershipGuard
): Promise<void> => {
  const { $supabase } = useNuxtApp();
  try {
    recordLocalSyncTime();
    const { error } = await syncProgressState($supabase.client, userId, store.$state);
    if (!isStartupCurrent()) return;
    if (error) throw error;
  } catch (error) {
    logger.error('[TarkovStore] Failed to persist post-load data migration/repair:', error);
    throw error;
  }
};
const startProgressSync = (
  store: TarkovStore,
  userId: string,
  hadRemoteData: boolean,
  isStartupCurrent: StartupOwnershipGuard
): void => {
  const { $supabase } = useNuxtApp();
  const options = { store, client: $supabase.client, userId, hadRemoteData };
  if (hadRemoteData || hasProgress(store.$state)) {
    if (isStartupCurrent()) progressSync.start(options);
    return;
  }
  progressSync.startWhenProgressExists(options, isStartupCurrent);
};
export async function initializeTarkovSync() {
  const tarkovStore = useTarkovStore();
  const { $supabase } = useNuxtApp();
  if (!import.meta.client || !$supabase.user.loggedIn) return;
  const toastI18n = useToastI18n();
  const userId = $supabase.user.id;
  if (!userId) {
    logger.warn('[TarkovStore] Skipping sync initialization without an authenticated user id');
    return;
  }
  if (!claimSyncStartup(userId)) return;
  const isStartupCurrent = beginOwnedStartup(userId);
  logger.debug('[TarkovStore] Setting up Supabase sync and listener');
  const preservedSnapshot = progressSync.preservedSnapshotFor(userId);
  // Load completes BEFORE sync starts, so empty local state never overwrites server data.
  const loadResult = await loadInitialProgress({
    store: tarkovStore,
    client: $supabase.client,
    userId,
    account: $supabase.user,
    isCurrent: isStartupCurrent,
    preservedSnapshot,
    notifyLocalIgnored: createLocalIgnoreNotifier(toastI18n),
    showLoadFailed: () => toastI18n.showLoadFailed(),
  });
  if (!isStartupCurrent()) return;
  if (!loadResult.ok) {
    logger.error('[TarkovStore] Initial load failed; sync not started');
    throw new Error('Supabase initial load failed');
  }
  markProgressMetadataHydrated();
  syncMetadataAfterStartup(tarkovStore, isStartupCurrent);
  if (preservedSnapshot) progressSync.consumePreservedSnapshot();
  if (applyPostLoadRepairs(tarkovStore) > 0 || loadResult.needsRemoteCleanup) {
    await persistPostLoadChanges(tarkovStore, userId, isStartupCurrent);
    if (!isStartupCurrent()) return;
  }
  startProgressSync(tarkovStore, userId, loadResult.hadRemoteData, isStartupCurrent);
  // MULTI-DEVICE CONFLICT RESOLUTION: awaited so initialization does not report success before
  // Realtime acknowledges the channel; failed or stalled joins reject to the app init boundary.
  if (!isStartupCurrent()) return;
  await setupRealtimeListener(tarkovStore);
}
