import { useToastI18n } from '@/composables/useToastI18n';
import { maybeNotifyApiUpdate } from '@/stores/tarkov/apiUpdateNotifier';
import { detectDataConflicts } from '@/stores/tarkov/conflictDetection';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import { coerceGameMode, mergeProgressData, toProgressEpoch } from '@/stores/tarkov/progressMerge';
import {
  getLastLocalSyncTime,
  isLikelySelfOriginUpdate,
  SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS,
} from '@/stores/tarkov/syncTimeline';
import { useMetadataStore } from '@/stores/useMetadata';
import { getGameModeSeasonNumber, isGameMode, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { createPendingStateTracker, type RemoteStateMerge } from '@/utils/pendingState';
import {
  sanitizeGameEdition,
  sanitizeOwnedProgressData,
  sanitizeOwnedUserState,
  sanitizeTarkovUid,
} from '@/utils/progressSanitizers';
import {
  createChannelReleaseLatch,
  removeOwnedChannel,
  subscribeAndWaitForRealtimeChannel,
  type OwnedRealtimeChannel,
  REALTIME_SUBSCRIPTION_TIMEOUT_MS,
} from '@/utils/realtimeChannel';
import { isRealtimeSuspended } from '@/utils/realtimeVisibility';
import type { UserProgressData, UserState } from '@/stores/progressState';
const SYNC_RESUME_DELAY_MS = 1000;
export type SyncControllerHandle = {
  hasPendingChanges?: () => boolean;
  captureRemoteMerge?: () => RemoteStateMerge;
  pause: () => void;
  resume: () => void;
};
type SyncControllerGetter = () => SyncControllerHandle | null;
type TarkovStoreLike = {
  $state: UserState;
  $patch(mutator: (state: UserState) => void): void;
};
type RealtimeModeProgress = {
  mode: GameMode;
  progress: UserProgressData;
  updateTime: number;
};
type LegacyProgressMetadata = {
  current_game_mode?: string;
  game_edition?: number;
  tarkov_uid?: number | null;
  updated_at?: string | null;
};
let syncControllerGetter: SyncControllerGetter = () => null;
let realtimeChannel: OwnedRealtimeChannel | null = null;
const channelRelease = createChannelReleaseLatch();
/**
 * Bumped synchronously by every setup and teardown. A newer request supersedes an
 * older one before either request reaches its next await, so unrelated topics do
 * not wait behind a slow leave from the previous user.
 */
let listenerGeneration = 0;
let syncResumeTimer: ReturnType<typeof setTimeout> | null = null;
let pausedSyncController: SyncControllerHandle | null = null;
export const registerSyncControllerGetter = (getter: SyncControllerGetter): void => {
  syncControllerGetter = getter;
};
export const getRegisteredSyncController = (): SyncControllerHandle | null =>
  syncControllerGetter();
const parseRealtimeUpdateTime = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Date.now() : parsed;
};
const isActiveRealtimeModeRow = (
  row: Record<string, unknown>
): row is Record<string, unknown> & { game_mode: GameMode } =>
  isGameMode(row.game_mode) && row.season_number === getGameModeSeasonNumber(row.game_mode);
const parseRealtimeModeProgress = (value: unknown): RealtimeModeProgress | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!isActiveRealtimeModeRow(row)) return null;
  return {
    mode: row.game_mode,
    progress: sanitizeOwnedProgressData(row.progress_data),
    updateTime: parseRealtimeUpdateTime(row.updated_at),
  };
};
const buildLegacyMetadataState = (
  remoteData: LegacyProgressMetadata,
  localState: UserState
): UserState => ({
  currentGameMode: remoteData.current_game_mode
    ? coerceGameMode(remoteData.current_game_mode)
    : localState.currentGameMode,
  gameEdition:
    remoteData.game_edition === undefined
      ? localState.gameEdition
      : sanitizeGameEdition(remoteData.game_edition),
  tarkovUid:
    remoteData.tarkov_uid === undefined
      ? localState.tarkovUid
      : sanitizeTarkovUid(remoteData.tarkov_uid),
  pvp: localState.pvp,
  pve: localState.pve,
  seasonal: localState.seasonal,
  seasonalSeasonNumber: localState.seasonalSeasonNumber,
});
const pauseRegisteredSyncController = (): void => {
  const controller = getRegisteredSyncController();
  if (!controller) return;
  controller.pause();
  pausedSyncController = controller;
};
const scheduleSyncResume = (): void => {
  if (syncResumeTimer) clearTimeout(syncResumeTimer);
  syncResumeTimer = setTimeout(() => {
    syncResumeTimer = null;
    pausedSyncController?.resume();
    pausedSyncController = null;
  }, SYNC_RESUME_DELAY_MS);
};
const notifyModeConflict = (
  conflicts: ReturnType<typeof detectDataConflicts>,
  apiUpdateHandled: boolean,
  updateTime: number,
  toastI18n: ReturnType<typeof useToastI18n>
): void => {
  if (conflicts.hasConflict && !apiUpdateHandled && !isLikelySelfOriginUpdate(updateTime)) {
    toastI18n.showProgressMerged(conflicts.conflictCount);
  }
};
const shouldIgnoreModeProgressUpdate = (
  mode: GameMode,
  updateTime: number,
  nextProgress: UserProgressData,
  localProgress: UserProgressData
): boolean => {
  const stateUnchanged = deepEqual(nextProgress, localProgress);
  if (!stateUnchanged) return false;
  if (isLikelySelfOriginUpdate(updateTime)) {
    logger.debug('[TarkovStore] Ignoring mode realtime update - likely self-origin', {
      mode,
      threshold: SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS,
    });
  } else {
    logger.debug('[TarkovStore] Mode realtime update matches local state; skipping patch', {
      mode,
    });
  }
  return true;
};
const shouldIgnoreLegacyMetadataUpdate = (
  updateTime: number,
  nextState: UserState,
  localState: UserState
): boolean => {
  if (!deepEqual(nextState, localState)) return false;
  if (isLikelySelfOriginUpdate(updateTime)) {
    logger.debug('[TarkovStore] Ignoring realtime update - likely self-origin', {
      threshold: SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS,
      timeSinceLastSync: updateTime - getLastLocalSyncTime(),
    });
  } else {
    logger.debug('[TarkovStore] Realtime update matches local state; skipping patch');
  }
  return true;
};
const isStillSignedInAs = (currentUserId: string): boolean => {
  const { $supabase } = useNuxtApp();
  return $supabase.user.loggedIn === true && $supabase.user.id === currentUserId;
};
const progressTopic = (userId: string) => `user_progress_${userId}`;
/**
 * Returns whether a setup still owns the current user and generation.
 *
 * Setup and teardown increment the generation synchronously, before awaiting
 * channel removal or subscription acknowledgement.
 */
const stillOwnsSetup = (currentUserId: string, generation: number): boolean =>
  generation === listenerGeneration && isStillSignedInAs(currentUserId);
/**
 * Releases a channel and records its leave until the topic is free to rejoin.
 *
 * `RealtimeClient.channel()` hands back the still-leaving channel until
 * `phx_leave` settles and `subscribe()` only rejoins a closed channel, so the
 * same-topic setup must wait for this promise. Different topics can continue
 * independently.
 */
const releaseProgressChannel = (owned: OwnedRealtimeChannel): Promise<boolean> => {
  if (realtimeChannel === owned) realtimeChannel = null;
  const removal = removeOwnedChannel(owned, 'TarkovStore');
  channelRelease.hold(owned, removal);
  return channelRelease.release(owned.topic);
};
// fallow-ignore-next-line complexity -- same-topic joins must await a clean leave
const prepareProgressTopic = async (
  currentUserId: string,
  generation: number
): Promise<boolean> => {
  const previousChannel = realtimeChannel;
  if (previousChannel) {
    realtimeChannel = null;
    const leftCleanly = releaseProgressChannel(previousChannel);
    // A different user's topic can proceed while the old topic leaves. Rejoining
    // the same topic still waits for its leave to finish.
    if (previousChannel.topic === progressTopic(currentUserId) && !(await leftCleanly)) {
      return false;
    }
  }
  if (!(await channelRelease.release(progressTopic(currentUserId)))) return false;
  return stillOwnsSetup(currentUserId, generation);
};
/**
 * Starts listener setup immediately and lets the newest request win.
 *
 * A setup suspends across a channel leave and subscription acknowledgement. The
 * generation check invalidates stale work at every asynchronous boundary while
 * the release latch only blocks a rejoin of the same topic.
 */
export function setupRealtimeListener(tarkovStore: TarkovStoreLike): Promise<void> {
  const generation = ++listenerGeneration;
  return runSetupRealtimeListener(tarkovStore, generation);
}
// fallow-ignore-next-line complexity -- coordinates cancellation, topic release, and join readiness
async function runSetupRealtimeListener(
  tarkovStore: TarkovStoreLike,
  generation: number
): Promise<void> {
  const { $supabase } = useNuxtApp();
  const metadataStore = useMetadataStore();
  const toastI18n = useToastI18n();
  const currentUserId = $supabase.user.id;
  if (!$supabase.user.loggedIn || !currentUserId) return;
  if (!(await prepareProgressTopic(currentUserId, generation))) return;
  const fallbackTracker = createPendingStateTracker(() => tarkovStore.$state);
  const captureRemoteMerge = () =>
    getRegisteredSyncController()?.captureRemoteMerge?.() ?? fallbackTracker.capture();
  const latestModeUpdateTimes = new Map<GameMode, number>();
  const acceptModeUpdate = (mode: GameMode, updateTime: number): boolean => {
    const latestUpdateTime = latestModeUpdateTimes.get(mode);
    if (latestUpdateTime !== undefined && updateTime < latestUpdateTime) return false;
    latestModeUpdateTimes.set(mode, updateTime);
    return true;
  };
  const acceptRealtimeModeProgress = (value: unknown): RealtimeModeProgress | null => {
    const remote = parseRealtimeModeProgress(value);
    return remote && acceptModeUpdate(remote.mode, remote.updateTime) ? remote : null;
  };
  let latestLegacyMetadataUpdateTime: number | undefined;
  const acceptLegacyMetadataUpdate = (updateTime: number): boolean => {
    if (
      latestLegacyMetadataUpdateTime !== undefined &&
      updateTime < latestLegacyMetadataUpdateTime
    ) {
      logger.debug('[TarkovStore] Ignoring out-of-order legacy metadata update', {
        latestUpdateTime: latestLegacyMetadataUpdateTime,
        updateTime,
      });
      return false;
    }
    latestLegacyMetadataUpdateTime = updateTime;
    return true;
  };
  const isCurrentRealtimeUser = () =>
    stillOwnsSetup(currentUserId, generation) &&
    !($supabase.client.realtime && isRealtimeSuspended($supabase.client.realtime));
  logger.debug('[TarkovStore] Setting up realtime listener for multi-device sync');
  const handleProgressChange = (
    payload: { new: unknown; old: unknown },
    reconcile = captureRemoteMerge()
  ) => {
    if (!isCurrentRealtimeUser()) return;
    const remoteData = payload.new as LegacyProgressMetadata;
    const updateTime = parseRealtimeUpdateTime(remoteData.updated_at);
    if (!acceptLegacyMetadataUpdate(updateTime)) return;
    const localState = sanitizeOwnedUserState(tarkovStore.$state);
    const remoteState = buildLegacyMetadataState(remoteData, localState);
    const metadata = reconcile({
      currentGameMode: remoteState.currentGameMode,
      gameEdition: remoteState.gameEdition,
      tarkovUid: remoteState.tarkovUid,
    });
    const nextState = { ...localState, ...metadata } as UserState;
    if (shouldIgnoreLegacyMetadataUpdate(updateTime, nextState, localState)) return;
    const isLikelySelfOrigin = isLikelySelfOriginUpdate(updateTime);
    logger.debug('[TarkovStore] Remote metadata update detected, applying changes', {
      isLikelySelfOrigin,
    });
    pauseRegisteredSyncController();
    tarkovStore.$patch((state) => {
      state.currentGameMode = nextState.currentGameMode;
      state.gameEdition = nextState.gameEdition;
      state.tarkovUid = nextState.tarkovUid;
      state.pvp = nextState.pvp;
      state.pve = nextState.pve;
      state.seasonal = nextState.seasonal;
    });
    scheduleSyncResume();
  };
  const handleModeProgressChange = (
    payload: { new: unknown },
    reconcile = captureRemoteMerge()
  ) => {
    if (!isCurrentRealtimeUser()) return;
    const remote = acceptRealtimeModeProgress(payload.new);
    if (!remote) return;
    const { mode, progress: remoteProgress, updateTime } = remote;
    const localState = sanitizeOwnedUserState(tarkovStore.$state);
    const merged = mergeProgressData(localState[mode], remoteProgress, true);
    const nextProgress = reconcile(
      { [mode]: remoteProgress },
      { [mode]: merged },
      toProgressEpoch(localState[mode]) === toProgressEpoch(remoteProgress)
    )[mode] as UserProgressData;
    if (shouldIgnoreModeProgressUpdate(mode, updateTime, nextProgress, localState[mode])) return;
    const conflicts = detectDataConflicts(localState[mode], remoteProgress);
    const apiUpdateHandled = maybeNotifyApiUpdate(
      mode,
      remoteProgress,
      metadataStore,
      updateTime,
      toastI18n
    );
    pauseRegisteredSyncController();
    tarkovStore.$patch((state) => {
      state[mode] = nextProgress;
    });
    scheduleSyncResume();
    notifyModeConflict(conflicts, apiUpdateHandled, updateTime, toastI18n);
  };
  const client = $supabase.client;
  const topic = progressTopic(currentUserId);
  const channel = client
    .channel(topic)
    .on(
      'postgres_changes' as const,
      {
        event: 'INSERT',
        schema: 'public',
        table: 'user_progress',
        filter: `user_id=eq.${currentUserId}`,
      },
      handleProgressChange
    )
    .on(
      'postgres_changes' as const,
      {
        event: '*',
        schema: 'public',
        table: 'user_game_mode_progress',
        filter: `user_id=eq.${currentUserId}`,
      },
      handleModeProgressChange
    )
    .on(
      'postgres_changes' as const,
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_progress',
        filter: `user_id=eq.${currentUserId}`,
      },
      handleProgressChange
    );
  let refreshGeneration = 0;
  // fallow-ignore-next-line complexity -- snapshot/event/edit races are covered in realtimeListener.seasonal.test.ts; keep generation checks together
  const refreshSnapshot = async () => {
    const request = ++refreshGeneration;
    const reconcile = captureRemoteMerge();
    try {
      const [metadata, modes] = await Promise.all([
        client
          .from('user_progress')
          .select('current_game_mode,game_edition,tarkov_uid,updated_at')
          .eq('user_id', currentUserId)
          .single(),
        client
          .from('user_game_mode_progress')
          .select('game_mode,season_number,progress_data,updated_at')
          .eq('user_id', currentUserId),
      ]);
      if (!isCurrentRealtimeUser() || request !== refreshGeneration) return;
      if (modes.error) throw modes.error;
      if (metadata.error && metadata.error.code !== 'PGRST116') throw metadata.error;
      if (metadata.data) {
        handleProgressChange({ new: metadata.data, old: null }, reconcile);
      }
      for (const row of modes.data ?? []) {
        if (!isGameMode(row.game_mode)) continue;
        handleModeProgressChange({ new: row }, reconcile);
      }
    } catch (error) {
      logger.warn('[TarkovStore] Reconnect snapshot failed', error);
    }
  };
  const owned = { channel, client, topic } satisfies OwnedRealtimeChannel;
  if (!stillOwnsSetup(currentUserId, generation)) {
    await releaseProgressChannel(owned);
    return;
  }
  // Publish ownership before awaiting the join so a newer setup can tear down
  // this channel instead of creating a duplicate subscription for the topic.
  realtimeChannel = owned;
  try {
    await subscribeAndWaitForRealtimeChannel(
      channel,
      'TarkovStore',
      {
        table: 'user_progress',
      },
      REALTIME_SUBSCRIPTION_TIMEOUT_MS,
      () => {
        void refreshSnapshot();
      }
    );
  } catch (error) {
    if (realtimeChannel === owned) await releaseProgressChannel(owned);
    // A newer setup or teardown intentionally superseded this request. Its
    // subscription failure is no longer actionable and must not reject the new
    // request or surface as an initialization failure.
    if (!stillOwnsSetup(currentUserId, generation)) return;
    throw error;
  }
  if (!stillOwnsSetup(currentUserId, generation) || realtimeChannel !== owned) {
    if (realtimeChannel === owned) await releaseProgressChannel(owned);
  }
}
/**
 * Removes the channel and stops its timers. Bumping the generation invalidates
 * setup work that is awaiting a leave or subscription acknowledgement.
 */
async function teardownProgressChannel(): Promise<void> {
  listenerGeneration += 1;
  if (realtimeChannel) {
    // Remove through the client that created the channel: `$supabase.client` is
    // replaced once background initialization completes.
    const owned = realtimeChannel;
    realtimeChannel = null;
    await releaseProgressChannel(owned);
    logger.debug('[TarkovStore] Cleaned up realtime listener');
  }
  if (syncResumeTimer) {
    clearTimeout(syncResumeTimer);
    syncResumeTimer = null;
  }
  if (pausedSyncController) {
    pausedSyncController.resume();
    pausedSyncController = null;
  }
}
/**
 * Public teardown: removes the channel and cancels any setup still in flight.
 *
 * Bumping the generation before awaiting removal prevents a setup suspended
 * across an asynchronous boundary from recreating the channel afterwards.
 */
export async function cleanupRealtimeListener(): Promise<void> {
  await teardownProgressChannel();
}
