import { useToastI18n } from '@/composables/useToastI18n';
import { maybeNotifyApiUpdate, runApiUpdateHandlers } from '@/stores/tarkov/apiUpdateNotifier';
import { detectDataConflicts } from '@/stores/tarkov/conflictDetection';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import { coerceGameMode, mergeProgressData } from '@/stores/tarkov/progressMerge';
import {
  getLastLocalSyncTime,
  isLikelySelfOriginUpdate,
  recordLocalSyncTime,
  SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS,
} from '@/stores/tarkov/syncTimeline';
import { useMetadataStore } from '@/stores/useMetadata';
import { GAME_MODES, getGameModeSeasonNumber, isGameMode, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  hasDeprecatedTarkovDevProfileData,
  sanitizeGameEdition,
  sanitizeOwnedProgressData,
  sanitizeOwnedUserState,
  sanitizeTarkovUid,
} from '@/utils/progressSanitizers';
import type { UserProgressData, UserState } from '@/stores/progressState';
const SYNC_RESUME_DELAY_MS = 1000;
const DEPRECATED_REMOTE_CLEANUP_FAST_RETRY_LIMIT = 3;
const DEPRECATED_REMOTE_CLEANUP_FAILURE_BACKOFF_MS = 30000;
export type SyncControllerHandle = {
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
let syncControllerGetter: SyncControllerGetter = () => null;
let realtimeChannel: unknown = null;
let syncResumeTimer: ReturnType<typeof setTimeout> | null = null;
let pausedSyncController: SyncControllerHandle | null = null;
let deprecatedRemoteCleanupInFlight = false;
let lastDeprecatedRemoteCleanupAttemptAt = 0;
let deprecatedRemoteCleanupFailureCount = 0;
export const registerSyncControllerGetter = (getter: SyncControllerGetter): void => {
  syncControllerGetter = getter;
};
export const getRegisteredSyncController = (): SyncControllerHandle | null =>
  syncControllerGetter();
const getDeprecatedRemoteCleanupCooldownMs = () =>
  deprecatedRemoteCleanupFailureCount >= DEPRECATED_REMOTE_CLEANUP_FAST_RETRY_LIMIT
    ? DEPRECATED_REMOTE_CLEANUP_FAILURE_BACKOFF_MS
    : SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS;
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
  if (stateUnchanged && isLikelySelfOriginUpdate(updateTime)) {
    logger.debug('[TarkovStore] Ignoring mode realtime update - likely self-origin', {
      mode,
      threshold: SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS,
    });
  }
  return stateUnchanged;
};
export async function setupRealtimeListener(tarkovStore: TarkovStoreLike): Promise<void> {
  const { $supabase } = useNuxtApp();
  const metadataStore = useMetadataStore();
  const toastI18n = useToastI18n();
  const currentUserId = $supabase.user.id;
  if (!$supabase.user.loggedIn || !currentUserId) return;
  if (realtimeChannel) {
    await cleanupRealtimeListener();
  }
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
  const isCurrentRealtimeUser = () =>
    $supabase.user.loggedIn && $supabase.user.id === currentUserId;
  logger.debug('[TarkovStore] Setting up realtime listener for multi-device sync');
  const handleProgressChange = (payload: { new: unknown; old: unknown }) => {
    if (!$supabase.user.loggedIn || $supabase.user.id !== currentUserId) {
      return;
    }
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
    const pvpProgress = acceptModeUpdate(GAME_MODES.PVP, updateTime)
      ? remoteData.pvp_data
      : undefined;
    const pveProgress = acceptModeUpdate(GAME_MODES.PVE, updateTime)
      ? remoteData.pve_data
      : undefined;
    const timeSinceLastSync = updateTime - getLastLocalSyncTime();
    const remoteHadDeprecatedProgressData = hasDeprecatedTarkovDevProfileData({
      pvp: remoteData.pvp_data,
      pve: remoteData.pve_data,
    });
    const localState = sanitizeOwnedUserState(tarkovStore.$state);
    const merged: Partial<UserState> = {
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
      pvp: pvpProgress
        ? mergeProgressData(localState.pvp, sanitizeOwnedProgressData(pvpProgress))
        : localState.pvp,
      pve: pveProgress
        ? mergeProgressData(localState.pve, sanitizeOwnedProgressData(pveProgress))
        : localState.pve,
    };
    const nextState: UserState = {
      currentGameMode: merged.currentGameMode ?? localState.currentGameMode,
      gameEdition: merged.gameEdition ?? localState.gameEdition,
      tarkovUid: merged.tarkovUid ?? null,
      pvp: merged.pvp ?? localState.pvp,
      pve: merged.pve ?? localState.pve,
      seasonal: localState.seasonal,
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
        if (!remoteData.updated_at) return;
        const { data, error } = await $supabase.client
          .from('user_progress')
          .update({ pvp_data: nextState.pvp, pve_data: nextState.pve })
          .eq('user_id', currentUserId)
          .eq('updated_at', remoteData.updated_at)
          .select('user_id');
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
        if (!data?.length) {
          const { data: current, error: refetchError } = await $supabase.client
            .from('user_progress')
            .select('updated_at')
            .eq('user_id', currentUserId)
            .single();
          logger.debug('[TarkovStore] Skipped stale deprecated remote cleanup', {
            currentUpdatedAt: current?.updated_at,
            error: refetchError,
            remoteUpdatedAt: remoteData.updated_at,
          });
          return;
        }
        deprecatedRemoteCleanupFailureCount = 0;
        lastDeprecatedRemoteCleanupAttemptAt = 0;
        logger.debug('[TarkovStore] Cleaned deprecated remote progress payload');
      } catch (error: unknown) {
        deprecatedRemoteCleanupFailureCount += 1;
        logger.error(
          '[TarkovStore] Failed to clean deprecated remote progress payload:',
          {
            cooldownMs: getDeprecatedRemoteCleanupCooldownMs(),
            failureCount: deprecatedRemoteCleanupFailureCount,
          },
          error
        );
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
        threshold: SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS,
      });
      return;
    }
    if (stateUnchanged) {
      logger.debug('[TarkovStore] Realtime update matches local state; skipping patch');
      return;
    }
    const pvpConflicts = detectDataConflicts(localState.pvp, pvpProgress);
    const pveConflicts = detectDataConflicts(localState.pve, pveProgress);
    const hasRealConflict = pvpConflicts.hasConflict || pveConflicts.hasConflict;
    const totalConflicts = pvpConflicts.conflictCount + pveConflicts.conflictCount;
    const apiUpdateHandled = runApiUpdateHandlers([
      () => maybeNotifyApiUpdate('pvp', pvpProgress, metadataStore, updateTime, toastI18n),
      () => maybeNotifyApiUpdate('pve', pveProgress, metadataStore, updateTime, toastI18n),
    ]);
    logger.debug('[TarkovStore] Remote update detected, applying changes', {
      hasRealConflict,
      totalConflicts,
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
    if (hasRealConflict && !apiUpdateHandled && !isLikelySelfOrigin) {
      toastI18n.showProgressMerged(totalConflicts);
    }
  };
  const handleModeProgressChange = (payload: { new: unknown }) => {
    if (!isCurrentRealtimeUser()) return;
    const remote = acceptRealtimeModeProgress(payload.new);
    if (!remote) return;
    const { mode, progress: remoteProgress, updateTime } = remote;
    const localState = sanitizeOwnedUserState(tarkovStore.$state);
    const nextProgress = mergeProgressData(localState[mode], remoteProgress);
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
  realtimeChannel = $supabase.client
    .channel(`user_progress_${currentUserId}`)
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
    )
    .subscribe((status: string) => {
      logger.debug(`[TarkovStore] Realtime subscription status: ${status}`);
    });
}
export async function cleanupRealtimeListener(): Promise<void> {
  if (realtimeChannel) {
    const { $supabase } = useNuxtApp();
    await $supabase.client.removeChannel(
      realtimeChannel as Parameters<typeof $supabase.client.removeChannel>[0]
    );
    realtimeChannel = null;
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
export function resetRealtimeState(): void {
  deprecatedRemoteCleanupInFlight = false;
  lastDeprecatedRemoteCleanupAttemptAt = 0;
  deprecatedRemoteCleanupFailureCount = 0;
}
