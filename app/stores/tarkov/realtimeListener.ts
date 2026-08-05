import { useToastI18n } from '@/composables/useToastI18n';
import { maybeNotifyApiUpdate } from '@/stores/tarkov/apiUpdateNotifier';
import { detectDataConflicts } from '@/stores/tarkov/conflictDetection';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import { coerceGameMode, mergeProgressData } from '@/stores/tarkov/progressMerge';
import {
  getLastLocalSyncTime,
  isLikelySelfOriginUpdate,
  SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS,
} from '@/stores/tarkov/syncTimeline';
import { useMetadataStore } from '@/stores/useMetadata';
import { getGameModeSeasonNumber, isGameMode, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  sanitizeGameEdition,
  sanitizeOwnedProgressData,
  sanitizeOwnedUserState,
  sanitizeTarkovUid,
} from '@/utils/progressSanitizers';
import type { UserProgressData, UserState } from '@/stores/progressState';
const SYNC_RESUME_DELAY_MS = 1000;
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
type LegacyProgressMetadata = {
  current_game_mode?: string;
  game_edition?: number;
  tarkov_uid?: number | null;
  updated_at?: string | null;
};
let syncControllerGetter: SyncControllerGetter = () => null;
let realtimeChannel: unknown = null;
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
    if (!isCurrentRealtimeUser()) return;
    const remoteData = payload.new as LegacyProgressMetadata;
    const updateTime = parseRealtimeUpdateTime(remoteData.updated_at);
    const localState = sanitizeOwnedUserState(tarkovStore.$state);
    const nextState = buildLegacyMetadataState(remoteData, localState);
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
