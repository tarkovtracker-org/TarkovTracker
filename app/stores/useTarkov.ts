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
  hasAccountRecoveryCopy,
  isAccountRecoveryRetentionBlocked,
  mayHoldAccountRecoveryCopy,
  markAccountRecoveryRetentionBlocked,
  preserveForeignActiveCopy,
  readAccountRecoveryCopy,
  removeAccountRecoveryCopy,
  retryBlockedAccountRecoveryRetention,
  saveAccountRecoveryCopy,
  selectFreshestOwnerProgressSnapshot,
} from '@/stores/tarkov/accountRecovery';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import {
  clearDeviceDataRemoval,
  clearIncompleteDeviceDataRemoval,
  isDeviceDataRemovalPending,
  registerDeviceDataRemovalCleanup,
  removeAccountDeviceData,
} from '@/stores/tarkov/deviceData';
import {
  enforceHideoutPrereqs,
  notifyHideoutPrereqEnforcement,
} from '@/stores/tarkov/hideoutPrereqs';
import {
  clearActiveProgressStorage,
  cloneStateSnapshot,
  getPendingProgressWritesForOwners,
  getPreservedProgressStorageValue,
  parsePersistedProgressState,
  progressStorageSerializer,
  readPersistedProgressState,
  persistActiveProgressValue,
  invalidateActiveProgressWrites,
  setActiveProgressWritesBlocked,
  type PersistedProgressSnapshot,
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
import {
  initializeProgressAuthority,
  isProgressAuthorityReady,
} from '@/stores/tarkov/progressAuthority';
import { getNextProgressEpoch, hasProgress } from '@/stores/tarkov/progressMerge';
import {
  countStoryIdChanges,
  migrateTaskCompletionSchemas,
  needsGameModeMigration,
  reconcileStoryObjectiveIds,
  type StoryIdChanges,
} from '@/stores/tarkov/progressMigration';
import {
  executeProgressMutation,
  onTarkovUidConflict,
  syncProgressState,
} from '@/stores/tarkov/progressPersistence';
import { repairCompletedProgress, repairFailedProgress } from '@/stores/tarkov/progressRepair';
import {
  acknowledgeStartupSync,
  hasUnsavedProgressChanges,
  resetCloudSaveStatus,
} from '@/stores/tarkov/progressSaveStatus';
import {
  progressStorePersist,
  resetProgressStoreMemory,
} from '@/stores/tarkov/progressStorePersist';
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
import { sanitizeOwnedUserState } from '@/utils/progressSanitizers';
import { getCurrentSupabaseUserId, parseUserScopedStorage } from '@/utils/userScopedStorage';
export type { PrestigeRunRecord } from '@/stores/tarkov/prestige';
type TarkovStoreInstance = UserState & {
  $state: UserState;
  $patch(partialOrMutator: Partial<UserState> | ((state: UserState) => void)): void;
  migrateTaskCompletionSchema(): number;
};
const assertPrestigeMode = (mode: GameMode) => {
  if (mode === GAME_MODES.SEASONAL) throw new Error('Prestige is not supported for Seasonal PvP.');
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
  const revision = sessionTransitionRevision;
  const isCurrent = () =>
    revision === sessionTransitionRevision && getCurrentSupabaseUserId() === userId;
  const freshState = buildOnlineResetState(store);
  const { error } = await syncProgressState(client, userId, freshState);
  if (!isCurrent()) return;
  throwSyncError(error, 'Failed to reset online profile');
  const cleared = await clearActiveProgressStorage(userId, true);
  if (!isCurrent()) return;
  patchProgressState(store, freshState);
  if (!cleared)
    throw new Error('Online profile reset saved, but local progress could not be cleared');
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
/** Resolves true once the cloud holds the state, or immediately for local-only sessions. */
const syncProgressIfLoggedIn = async (
  store: TarkovStoreInstance,
  errorMessage: string
): Promise<boolean> => {
  const { $supabase } = useNuxtApp();
  const userId = $supabase.user.id;
  if (!$supabase.user.loggedIn || !userId) return true;
  try {
    recordLocalSyncTime();
    const { error } = await syncProgressState($supabase.client, userId, store.$state);
    throwSyncError(error, errorMessage);
    return true;
  } catch (error) {
    logger.error(errorMessage, error);
    return false;
  }
};
const archivePrestigeRun = async (store: TarkovStoreInstance, mode: GameMode) => {
  const { $supabase, userId } = requirePrestigeSession();
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
  const args = {
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
  };
  const modes = { pvp: nextState.pvp, pve: nextState.pve };
  const { error } = await executeProgressMutation(userId, {
    modes,
    expected: { ...modes, currentGameMode, gameEdition, tarkovUid },
    send: () => $supabase.client.rpc('archive_prestige_run_and_reset_progress', args),
    canContinue: () => $supabase.user.loggedIn && $supabase.user.id === userId,
    onSuccess: () => {
      recordLocalSyncTime();
      store.$patch((state) => {
        state[mode] = resetModeData;
      });
    },
  });
  throwSyncError(error, 'Failed to update prestige progress');
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
  /** Saves now instead of after the sync debounce; false when a signed-in save fails. */
  saveProgressNow(this: TarkovStoreInstance): Promise<boolean> {
    return syncProgressIfLoggedIn(this, 'Error saving progress to backend:');
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
  saveProgressNow(): Promise<boolean>;
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
  actions: {
    ...tarkovActions,
    $reset() {
      resetProgressStoreMemory(this);
    },
  },
  persist: progressStorePersist,
});
type TarkovStore = ReturnType<typeof useTarkovStore>;
// ============================================================================
// Sync Lifecycle
// ============================================================================
const progressSync = new ProgressSyncSession();
registerSyncControllerGetter(progressSync.getController);
registerDeviceDataRemovalCleanup((userId) => progressSync.dropPreservedSnapshotFor(userId));
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
  options?: {
    preservePersistedStateForUserId?: string | null;
    preservedSnapshot?: PersistedProgressSnapshot | null;
    preserveStorageBaselineForUserId?: string;
  }
) {
  invalidateStartupOwnership();
  stopTarkovUidConflictWatch?.();
  stopTarkovUidConflictWatch = null;
  progressSync.preserveSnapshot(options);
  const userId = options?.preserveStorageBaselineForUserId;
  progressSync.reset(
    reason,
    userId ? { userId, state: sanitizeOwnedUserState(useTarkovStore().$state) } : undefined
  );
}
/**
 * Memory-only edits made while sync was unavailable exist only in the store. Before a retry
 * reruns the startup load, which rehydrates from storage, hand them over as the session
 * snapshot for `userId` so the startup merge keeps them. The serializer's clocks mark only the
 * edited modes and metadata as new, so untouched modes still yield to newer remote progress.
 */
export function preserveUnsavedSessionProgress(userId: string): void {
  if (!hasUnsavedProgressChanges() || getCurrentSupabaseUserId() !== userId) return;
  const state = cloneStateSnapshot(sanitizeOwnedUserState(useTarkovStore().$state));
  const snapshot = parsePersistedProgressState(
    progressStorageSerializer.serialize(state, userId, Date.now()),
    userId
  );
  if (snapshot) progressSync.handOffSnapshot(userId, snapshot);
}
/**
 * Whether local progress may be waiting for the cloud when initialization fails: tracked
 * progress, a failed local save, or a recovery copy that exists, is unreadable, or is blocked. A
 * default account has nothing to save.
 */
export function mayHoldUnsyncedProgress(userId: string): boolean {
  return (
    hasProgress(useTarkovStore().$state) ||
    hasUnsavedProgressChanges() ||
    mayHoldAccountRecoveryCopy(userId)
  );
}
/**
 * Unacknowledged changes stay recoverable for their owner after sign-out, even if another
 * account or a guest session later overwrites the active copy. An explicit device-data
 * removal for that owner retains nothing.
 */
const retainPreviousOwnerCopy = (preservedState: string | null, previousUserId: string | null) => {
  if (isDeviceDataRemovalPending(previousUserId)) return true;
  if (!preservedState || !previousUserId) return true;
  if (parseUserScopedStorage<unknown>(preservedState)?._userId !== previousUserId) return true;
  if (!progressSync.mayHaveUnacknowledgedChanges()) return true;
  const retained = saveAccountRecoveryCopy(preservedState, previousUserId);
  setActiveProgressWritesBlocked(!retained);
  return retained;
};
const isSessionResetPlaceholder = (): boolean =>
  deepEqual(sanitizeOwnedUserState(useTarkovStore().$state), sanitizeOwnedUserState(defaultState));
/** Returns `true` when the previous owner's active copy was restored for a guest session. */
const restorePreviousOwnerCopy = async (
  preservedState: string | null,
  previousUserId: string | null,
  currentUserId: string | null
): Promise<boolean> => {
  if (isDeviceDataRemovalPending(previousUserId)) {
    await removeAccountDeviceData(previousUserId as string);
    return false;
  }
  return (
    Boolean(preservedState && currentUserId === null && isSessionResetPlaceholder()) &&
    (await persistActiveProgressValue(
      preservedState as string,
      false,
      undefined,
      parsePersistedProgressState(preservedState, previousUserId)
    ))
  );
};
const resetSessionMemory = (
  reason: string | undefined,
  userId: string | null,
  preservedState: string | null
) => {
  resetProgressMetadataHydration();
  resetTarkovSync(reason, {
    preservePersistedStateForUserId: userId,
    preservedSnapshot: userId ? parsePersistedProgressState(preservedState, userId) : undefined,
  });
  // A reset placeholder has no edits; only changes made in the incoming session earn clocks.
  progressStorageSerializer.reset({
    state: sanitizeOwnedUserState(defaultState),
    storedUserId: getCurrentSupabaseUserId(),
    timestamp: 0,
    hadDeprecatedProgressData: false,
  });
  resetProgressStoreMemory(useTarkovStore());
};
/** Retains the previous owner's copy, or blocks active-copy writes when that is impossible. */
const retainForSessionTransition = (
  preservedState: string | null,
  previousUserId: string | null
): boolean => {
  if (!retryBlockedAccountRecoveryRetention() || isAccountRecoveryRetentionBlocked()) {
    setActiveProgressWritesBlocked(true);
    return false;
  }
  if (retainPreviousOwnerCopy(preservedState, previousUserId)) return true;
  markAccountRecoveryRetentionBlocked();
  setActiveProgressWritesBlocked(true);
  return false;
};
let sessionTransitionRevision = 0;
export const hasPendingProgressHandoff = (): boolean =>
  getPendingProgressWritesForOwners([null]).length > 0;
const pendingHandoffWritesFor = (owners: (string | null)[]) =>
  getPendingProgressWritesForOwners(owners).filter(
    ({ value }) =>
      !isDeviceDataRemovalPending(parseUserScopedStorage<unknown>(value)?._userId ?? null)
  );
const startProgressHandoff = (writes: ReturnType<typeof getPendingProgressWritesForOwners>) =>
  writes.map(({ value, cloudHeld, expected, baseline }) =>
    persistActiveProgressValue(value, cloudHeld, expected, baseline)
  );
const isCurrentSessionTransition = (revision: number, userId: string | null): boolean =>
  revision === sessionTransitionRevision && userId === getCurrentSupabaseUserId();
const isMatchingGuestProgress = (
  guest: PersistedProgressSnapshot | null,
  state: UserState
): guest is PersistedProgressSnapshot =>
  guest !== null &&
  hasProgress(guest.state) &&
  deepEqual(guest.state, sanitizeOwnedUserState(state));
/** Finish an older auth handoff without resetting guest edits awaiting normal login adoption. */
export async function settlePendingProgressHandoffs(): Promise<void> {
  const userId = getCurrentSupabaseUserId();
  const revision = sessionTransitionRevision;
  const writes = pendingHandoffWritesFor([null, userId]);
  const guest = readPersistedProgressState(null);
  invalidateActiveProgressWrites();
  await Promise.all(startProgressHandoff(writes));
  // An intervening tab's envelope may supersede the transferred baseline chain. Keep guest
  // edits available to normal login adoption without overwriting that newer owner's copy.
  if (
    userId &&
    isCurrentSessionTransition(revision, userId) &&
    isMatchingGuestProgress(guest, useTarkovStore().$state)
  )
    progressSync.handOffSnapshot(userId, guest);
}
export async function resetTarkovStoreForSessionTransition(
  previousUserId: string | null = null,
  reason?: string
) {
  const revision = ++sessionTransitionRevision;
  const preservedState = getPreservedProgressStorageValue(previousUserId);
  const pendingWrites = pendingHandoffWritesFor([previousUserId]);
  const currentUserId = getCurrentSupabaseUserId();
  invalidateActiveProgressWrites();
  if (!retainForSessionTransition(preservedState, previousUserId)) {
    resetSessionMemory(reason, previousUserId, preservedState);
    return;
  }
  setActiveProgressWritesBlocked(false);
  // Transfer the owner's pending baseline chain before placeholders retain obsolete clocks.
  const handoffWrites = startProgressHandoff(pendingWrites);
  resetSessionMemory(reason, previousUserId, preservedState);
  if (!import.meta.client) {
    return;
  }
  if (handoffWrites.length) {
    await Promise.all(handoffWrites);
    if (revision !== sessionTransitionRevision || currentUserId !== getCurrentSupabaseUserId())
      return;
  }
  await initializeProgressAuthority(currentUserId, false, () =>
    isCurrentSessionTransition(revision, currentUserId)
  );
  if (!isCurrentSessionTransition(revision, currentUserId)) return;
  const restored = await restorePreviousOwnerCopy(preservedState, previousUserId, currentUserId);
  if (revision !== sessionTransitionRevision || currentUserId !== getCurrentSupabaseUserId())
    return;
  // Edits made while the handoff waited belong to the new session, beyond its reset placeholder.
  if (restored || !isSessionResetPlaceholder()) return;
  // Only the active copy is cleared: recovery copies belong to their owners. The reset above
  // may have persisted a default placeholder for the new owner; it is not their progress.
  const cleared = await clearActiveProgressStorage(currentUserId);
  if (revision !== sessionTransitionRevision || currentUserId !== getCurrentSupabaseUserId())
    return;
  if (!cleared)
    logger.error('[TarkovStore] Failed to clear active progress during session transition');
}
/** Returns false when a sync for `userId` is already running; resets a sync owned by another user. */
const claimSyncStartup = (userId: string): boolean => {
  if (!isProgressAuthorityReady()) {
    throw new DOMException('Progress authority is unavailable', 'InvalidStateError');
  }
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
let stopTarkovUidConflictWatch: (() => void) | null = null;
/** A UID another account owns is dropped locally so later syncs stop resubmitting it. */
const watchTarkovUidConflicts = (
  store: TarkovStore,
  ownerId: string,
  toastI18n: ReturnType<typeof useToastI18n>,
  isCurrent: StartupOwnershipGuard
): void => {
  stopTarkovUidConflictWatch?.();
  stopTarkovUidConflictWatch = onTarkovUidConflict((userId, conflict) => {
    if (!isCurrent()) return;
    if (userId !== ownerId || store.$state.tarkovUid !== conflict.rejectedUid) return;
    store.setTarkovUid(conflict.storedUid);
    toastI18n.showTarkovUidConflict(conflict.rejectedUid);
  });
};
const failBlockedRetention = (toastI18n: ReturnType<typeof useToastI18n>): never => {
  setActiveProgressWritesBlocked(true);
  toastI18n.showLoadFailed();
  throw new Error('Account recovery retention is blocked');
};
/**
 * Retain another account's active copy, then pick the freshest of this user's recovery copy,
 * persisted copy, and handed-off snapshot. Throws while retention is blocked.
 */
const selectStartupSnapshot = (userId: string, toastI18n: ReturnType<typeof useToastI18n>) => {
  // A new sign-in ends any device-data removal requested for the previous session.
  clearDeviceDataRemoval();
  clearIncompleteDeviceDataRemoval(userId);
  if (!retryBlockedAccountRecoveryRetention(userId) || !preserveForeignActiveCopy(userId)) {
    failBlockedRetention(toastI18n);
  }
  const snapshot = selectFreshestOwnerProgressSnapshot(
    readAccountRecoveryCopy(userId),
    readPersistedProgressState(userId),
    progressSync.preservedSnapshotFor(userId)
  );
  if (isAccountRecoveryRetentionBlocked()) failBlockedRetention(toastI18n);
  return snapshot;
};
type StartupCloudState = {
  /** A recovery copy holds changes the cloud has not acknowledged yet. */
  awaitsUpload: boolean;
  /** The recovery copy must be retired by the next acknowledged upload. */
  retirementPending: boolean;
};
/**
 * The startup merge reconciled local changes with the cloud; a previous failed attempt's
 * unavailable status no longer applies. Memory-only local changes are acknowledged only when
 * the cloud now holds them, which also retires the recovery copy. A removal the browser rejects
 * stays pending for the next acknowledged upload.
 */
const settleStartupCloudState = (
  userId: string,
  cloudHoldsResolvedState: boolean
): StartupCloudState => {
  if (!cloudHoldsResolvedState) {
    resetCloudSaveStatus();
    const awaitsUpload = hasAccountRecoveryCopy(userId);
    return { awaitsUpload, retirementPending: awaitsUpload };
  }
  acknowledgeStartupSync();
  return { awaitsUpload: false, retirementPending: !removeAccountRecoveryCopy(userId) };
};
/**
 * The first acknowledged upload carries the recovered state, whichever attempt it was. A removal
 * the browser rejects stays pending so a later acknowledged upload retries it.
 */
const retireRecoveryCopyOnFirstSync = (userId: string, retirementPending: boolean) => {
  let pending = retirementPending;
  return () => {
    if (pending) pending = !removeAccountRecoveryCopy(userId);
  };
};
type ProgressSyncStart = {
  hadRemoteData: boolean;
  /** Memory-only or recovered changes the startup load did not upload. */
  hasUnsavedHandoff: boolean;
  onSynced: () => void;
};
const shouldStartSyncNow = (store: TarkovStore, start: ProgressSyncStart): boolean =>
  start.hadRemoteData || hasProgress(store.$state) || start.hasUnsavedHandoff;
const startProgressSync = (
  store: TarkovStore,
  userId: string,
  start: ProgressSyncStart,
  isStartupCurrent: StartupOwnershipGuard
): void => {
  const { $supabase } = useNuxtApp();
  const { hadRemoteData, onSynced } = start;
  const options = { store, client: $supabase.client, userId, hadRemoteData, onSynced };
  if (!shouldStartSyncNow(store, start)) {
    progressSync.startWhenProgressExists(options, isStartupCurrent);
    return;
  }
  if (!isStartupCurrent()) return;
  progressSync.start(options);
  // Handed-off changes have no other path to the cloud; a failed attempt schedules the
  // controller's retries, which merge remote state first.
  if (start.hasUnsavedHandoff) progressSync.attemptSync();
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
  watchTarkovUidConflicts(tarkovStore, userId, toastI18n, isStartupCurrent);
  logger.debug('[TarkovStore] Setting up Supabase sync and listener');
  const preservedSnapshot = selectStartupSnapshot(userId, toastI18n);
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
  const startupCloudState = settleStartupCloudState(
    userId,
    loadResult.hadRemoteData || loadResult.migratedLocalState
  );
  syncMetadataAfterStartup(tarkovStore, isStartupCurrent);
  if (preservedSnapshot) progressSync.consumePreservedSnapshot();
  if (applyPostLoadRepairs(tarkovStore) > 0 || loadResult.needsRemoteCleanup) {
    await persistPostLoadChanges(tarkovStore, userId, isStartupCurrent);
    if (!isStartupCurrent()) return;
  }
  const syncStart = {
    hadRemoteData: loadResult.hadRemoteData,
    hasUnsavedHandoff: hasUnsavedProgressChanges() || startupCloudState.awaitsUpload,
    onSynced: retireRecoveryCopyOnFirstSync(userId, startupCloudState.retirementPending),
  };
  startProgressSync(tarkovStore, userId, syncStart, isStartupCurrent);
  // MULTI-DEVICE CONFLICT RESOLUTION: awaited so initialization does not report success before
  // Realtime acknowledges the channel; failed or stalled joins reject to the app init boundary.
  if (!isStartupCurrent()) return;
  await setupRealtimeListener(tarkovStore);
}
