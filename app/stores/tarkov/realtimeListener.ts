import { useToastI18n } from '@/composables/useToastI18n';
import { maybeNotifyApiUpdate, runApiUpdateHandlers } from '@/stores/tarkov/apiUpdateNotifier';
import { detectDataConflicts } from '@/stores/tarkov/conflictDetection';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import {
  buildUpsertPayload,
  coerceGameMode,
  mergeProgressData,
} from '@/stores/tarkov/progressMerge';
import {
  getLastLocalSyncTime,
  isLikelySelfOriginUpdate,
  recordLocalSyncTime,
  SYNC_TIMELINE_SELF_ORIGIN_THRESHOLD_MS,
} from '@/stores/tarkov/syncTimeline';
import { useMetadataStore } from '@/stores/useMetadata';
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
export async function setupRealtimeListener(tarkovStore: TarkovStoreLike): Promise<void> {
  const { $supabase } = useNuxtApp();
  const metadataStore = useMetadataStore();
  const toastI18n = useToastI18n();
  const currentUserId = $supabase.user.id;
  if (!$supabase.user.loggedIn || !currentUserId) return;
  if (realtimeChannel) {
    await cleanupRealtimeListener();
  }
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
      pvp: mergeProgressData(localState.pvp, sanitizeOwnedProgressData(remoteData.pvp_data)),
      pve: mergeProgressData(localState.pve, sanitizeOwnedProgressData(remoteData.pve_data)),
    };
    const nextState: UserState = {
      currentGameMode: merged.currentGameMode ?? localState.currentGameMode,
      gameEdition: merged.gameEdition ?? localState.gameEdition,
      tarkovUid: merged.tarkovUid ?? null,
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
    const pvpConflicts = detectDataConflicts(localState.pvp, remoteData.pvp_data);
    const pveConflicts = detectDataConflicts(localState.pve, remoteData.pve_data);
    const hasRealConflict = pvpConflicts.hasConflict || pveConflicts.hasConflict;
    const totalConflicts = pvpConflicts.conflictCount + pveConflicts.conflictCount;
    const apiUpdateHandled = runApiUpdateHandlers([
      () => maybeNotifyApiUpdate('pvp', remoteData.pvp_data, metadataStore, updateTime, toastI18n),
      () => maybeNotifyApiUpdate('pve', remoteData.pve_data, metadataStore, updateTime, toastI18n),
    ]);
    logger.debug('[TarkovStore] Remote update detected, applying changes', {
      hasRealConflict,
      totalConflicts,
      isLikelySelfOrigin,
    });
    const controller = getRegisteredSyncController();
    if (controller) {
      controller.pause();
      pausedSyncController = controller;
    }
    tarkovStore.$patch((state) => {
      state.currentGameMode = nextState.currentGameMode;
      state.gameEdition = nextState.gameEdition;
      state.tarkovUid = nextState.tarkovUid;
      state.pvp = nextState.pvp;
      state.pve = nextState.pve;
    });
    if (syncResumeTimer) {
      clearTimeout(syncResumeTimer);
    }
    syncResumeTimer = setTimeout(() => {
      syncResumeTimer = null;
      pausedSyncController?.resume();
      pausedSyncController = null;
    }, SYNC_RESUME_DELAY_MS);
    if (hasRealConflict && !apiUpdateHandled && !isLikelySelfOrigin) {
      toastI18n.showProgressMerged(totalConflicts);
    }
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
