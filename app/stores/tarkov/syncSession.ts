import {
  useSupabaseSync,
  type SupabaseSyncConfig,
  type SupabaseSyncReturn,
} from '@/composables/supabase/useSupabaseSync';
import { clearAcknowledgedModes } from '@/stores/tarkov/acknowledgedModes';
import { resetApiUpdateState } from '@/stores/tarkov/apiUpdateNotifier';
import { isDeviceDataRemovalPending } from '@/stores/tarkov/deviceData';
import {
  progressStorageSerializer,
  readPersistedProgressState,
  type PersistedProgressSnapshot,
} from '@/stores/tarkov/localStorage';
import { hasProgress, toProgressEpoch } from '@/stores/tarkov/progressMerge';
import { sendProgressSync } from '@/stores/tarkov/progressPersistence';
import {
  CLOUD_SAVE_RETRY_DELAYS_MS,
  registerCloudRetryHandler,
  resetCloudSaveStatus,
  setCloudSaveStatus,
} from '@/stores/tarkov/progressSaveStatus';
import { cleanupRealtimeListener, reconcileRemoteSnapshot } from '@/stores/tarkov/realtimeListener';
import {
  beginLocalSync,
  recordLocalSyncTime,
  resetSyncTimeline,
} from '@/stores/tarkov/syncTimeline';
import { GAME_MODES, GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { sanitizeOwnedUserState } from '@/utils/progressSanitizers';
import type { LocalIgnoredReason } from '@/composables/useToastI18n';
import type { UserProgressData, UserState } from '@/stores/progressState';
const SYNC_DEBOUNCE_MS = 5000;
type UserProgressSyncPayload = {
  current_game_mode: GameMode;
  game_edition: number;
  tarkov_uid: number | null;
  pvp_data: UserProgressData;
  pve_data: UserProgressData;
  seasonal_data: UserProgressData;
};
type ProgressSyncController = SupabaseSyncReturn<UserState, UserProgressSyncPayload>;
type SyncRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ error: { message: string } | null }>;
};
type SyncedStore = SupabaseSyncConfig<UserState, UserProgressSyncPayload>['store'];
const hasResetEpoch = (state: UserState): boolean =>
  GAME_MODE_VALUES.some((mode) => toProgressEpoch(state[mode]) > 0);
const toGameEdition = (edition: UserState['gameEdition']): number =>
  typeof edition === 'string' ? parseInt(edition) : edition;
/** Build the RPC payload, or `null` to block an accidental empty overwrite of remote data. */
const toSyncPayload = (
  userState: UserState,
  hadRemoteData: boolean
): UserProgressSyncPayload | null => {
  if (!hasProgress(userState) && hadRemoteData && !hasResetEpoch(userState)) {
    logger.warn('[TarkovStore] Blocking sync of empty state - account had remote data on load');
    return null;
  }
  const state = sanitizeOwnedUserState(userState);
  return {
    current_game_mode: state.currentGameMode || GAME_MODES.PVP,
    game_edition: toGameEdition(state.gameEdition),
    tarkov_uid: state.tarkovUid ?? null,
    pvp_data: state.pvp,
    pve_data: state.pve,
    seasonal_data: state.seasonal,
  };
};
const sendSyncPayload = async (
  client: SyncRpcClient,
  userId: string,
  payload: UserProgressSyncPayload
) => {
  const finish = beginLocalSync();
  try {
    const result = await sendProgressSync(client, userId, payload);
    finish(!result.error);
    return result;
  } catch (error) {
    finish(false);
    throw error;
  }
};
const broadcastProgressUpdate = (userId: string): void => {
  recordLocalSyncTime();
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(`tarkov-progress:${userId}`);
  channel.postMessage('updated');
  channel.close();
};
type ControllerOptions = {
  store: SyncedStore;
  client: SyncRpcClient;
  userId: string;
  hadRemoteData: boolean;
  /** Runs after each acknowledged upload while this controller is still the live one. */
  onSynced?: () => void;
};
const createProgressSyncController = (
  options: ControllerOptions,
  isLive: () => boolean
): ProgressSyncController =>
  useSupabaseSync({
    store: options.store,
    table: 'user_progress',
    debounceMs: SYNC_DEBOUNCE_MS,
    retryDelaysMs: CLOUD_SAVE_RETRY_DELAYS_MS,
    reconcileBeforeRetry: reconcileRemoteSnapshot,
    onSaveStatusChange: (status) => {
      if (isLive()) setCloudSaveStatus(status);
    },
    onSynced: () => {
      if (isLive()) options.onSynced?.();
      broadcastProgressUpdate(options.userId);
    },
    transform: (userState: UserState) => toSyncPayload(userState, options.hadRemoteData),
    sync: (payload: UserProgressSyncPayload) =>
      sendSyncPayload(options.client, options.userId, payload),
  });
type PendingResetSnapshot = { snapshot: PersistedProgressSnapshot | null; userId: string | null };
/**
 * Owns the single live progress sync for the signed-in account: the controller, its user, a
 * deferred start watcher, the snapshot preserved across auth handoffs, and one-shot toasts.
 */
export class ProgressSyncSession {
  private controller: ProgressSyncController | null = null;
  private userId: string | null = null;
  private stopDeferredStart: (() => void) | null = null;
  private pendingResetSnapshot: PendingResetSnapshot | null = null;
  private readonly shownLocalIgnoreReasons = new Set<LocalIgnoredReason>();
  getController = (): ProgressSyncController | null => this.controller;
  isActive(): boolean {
    return this.controller !== null;
  }
  isActiveFor(userId: string): boolean {
    return this.controller !== null && this.userId === userId;
  }
  /** Start syncing once; later calls are no-ops while a controller exists. */
  start(options: ControllerOptions): void {
    if (this.controller) return;
    this.clearDeferredStart();
    this.userId = options.userId;
    const controller = createProgressSyncController(options, () => this.controller === controller);
    this.controller = controller;
    registerCloudRetryHandler(controller.retryNow);
  }
  /** One upload attempt; a failure schedules the controller's own retries. */
  attemptSync(): void {
    if (this.controller) void attemptSync(this.controller);
  }
  /** Without a running controller, acknowledgement of the local copy cannot be proven. */
  mayHaveUnacknowledgedChanges(): boolean {
    return !this.controller || (this.controller.hasPendingChanges?.() ?? true);
  }
  /** Defer `start` until the store first has progress, then persist that snapshot. */
  startWhenProgressExists(options: ControllerOptions, isCurrent: () => boolean): void {
    logger.debug('[TarkovStore] Delaying sync until progress exists');
    this.clearDeferredStart();
    this.stopDeferredStart = watch(
      () => hasProgress(options.store.$state),
      (hasTrackedProgress) => {
        if (!hasTrackedProgress || !isCurrent()) return;
        this.start(options);
        // The subscription was created after this mutation (including legacy
        // history adoption), so explicitly persist the snapshot that started it.
        // One attempt: a failure schedules the controller's reconciled retries.
        this.attemptSync();
      },
      { flush: 'post' }
    );
  }
  private clearDeferredStart(): void {
    this.stopDeferredStart?.();
    this.stopDeferredStart = null;
  }
  /** Capture (or clear) the persisted snapshot a following startup for `userId` may adopt. */
  preserveSnapshot(options?: { preservePersistedStateForUserId?: string | null }): void {
    if (!options || !Object.hasOwn(options, 'preservePersistedStateForUserId')) {
      this.pendingResetSnapshot = null;
      return;
    }
    const userId = options.preservePersistedStateForUserId ?? null;
    this.pendingResetSnapshot = isDeviceDataRemovalPending(userId)
      ? null
      : { snapshot: readPersistedProgressState(userId), userId };
  }
  /** Hand `snapshot` to the next startup for `userId`, replacing any captured one. */
  handOffSnapshot(userId: string, snapshot: PersistedProgressSnapshot): void {
    this.pendingResetSnapshot = { snapshot: { ...snapshot, isSessionHandoff: true }, userId };
  }
  dropPreservedSnapshotFor(userId: string): void {
    if (this.pendingResetSnapshot?.userId === userId) this.pendingResetSnapshot = null;
  }
  preservedSnapshotFor(userId: string): PersistedProgressSnapshot | null {
    return this.pendingResetSnapshot?.userId === userId ? this.pendingResetSnapshot.snapshot : null;
  }
  consumePreservedSnapshot(): void {
    this.pendingResetSnapshot = null;
  }
  /** Returns true the first time `reason` is claimed in this session. */
  claimLocalIgnoreToast(reason: LocalIgnoredReason): boolean {
    if (this.shownLocalIgnoreReasons.has(reason)) return false;
    this.shownLocalIgnoreReasons.add(reason);
    return true;
  }
  releaseLocalIgnoreToast(reason: LocalIgnoredReason): void {
    this.shownLocalIgnoreReasons.delete(reason);
  }
  /** Tear down the controller, watcher, realtime channel, and per-session sync state. */
  reset(reason?: string, baseline?: { userId: string; state: UserState }): void {
    if (this.controller) {
      logger.debug(`[TarkovStore] Clearing Supabase sync${reason ? ` (${reason})` : ''}`);
      this.controller.cleanup();
      this.controller = null;
    }
    this.clearDeferredStart();
    cleanupRealtimeListener();
    resetCloudSaveStatus();
    this.userId = null;
    this.shownLocalIgnoreReasons.clear();
    resetSyncTimeline();
    if (baseline) {
      progressStorageSerializer.retainBaseline(baseline.userId, baseline.state);
    } else {
      progressStorageSerializer.reset();
    }
    resetApiUpdateState();
    clearAcknowledgedModes();
  }
}
const attemptSync = async (controller: ProgressSyncController) => {
  try {
    return await controller.syncToSupabase();
  } catch (error) {
    logger.error('[TarkovStore] Failed to sync initial tracked progress:', error);
    return null;
  }
};
