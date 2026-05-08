import { defaultState, type UserProgressData, type UserState } from '@/stores/progressState';
import {
  buildUpsertPayload,
  getNextProgressEpoch,
  mergeProgressData,
  mergeStoryChapterProgress,
  toProgressEpoch,
} from '@/stores/tarkov/progressMerge';
import { getRegisteredSyncController } from '@/stores/tarkov/realtimeListener';
import { recordLocalSyncTime } from '@/stores/tarkov/syncTimeline';
import { delay } from '@/utils/async';
import { clearProgressStorage } from '@/utils/clientStorage';
import { logger } from '@/utils/logger';
const RESET_SETTLE_DELAY_MS = 100;
export type ResetMode = 'pvp' | 'pve' | 'all';
type ResetTargetStore = {
  $patch: (fn: (state: UserState) => void) => void;
  $state: UserState;
};
export const shouldPreferLocalStartupMetadata = (
  localTimestamp: number | null,
  remoteUpdatedAt: number | null,
  localScore: number,
  remoteScore: number
): boolean => {
  if (localTimestamp && remoteUpdatedAt) {
    return localTimestamp > remoteUpdatedAt;
  }
  if (localTimestamp && !remoteUpdatedAt) {
    return localScore >= remoteScore;
  }
  if (!localTimestamp && !remoteUpdatedAt) {
    return localScore >= remoteScore;
  }
  return false;
};
export const getStoryProgressScore = (mode: UserProgressData | undefined): number => {
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
export const resolveInitialSyncState = (
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
export const executeWithSyncPause = async <T>(operation: () => Promise<T>): Promise<T> => {
  const controller = getRegisteredSyncController();
  controller?.pause();
  try {
    const result = await operation();
    await delay(RESET_SETTLE_DELAY_MS);
    return result;
  } catch (error) {
    logger.error('[TarkovStore] Reset operation failed:', error);
    throw error;
  } finally {
    controller?.resume();
  }
};
export const performReset = async (mode: ResetMode, store: ResetTargetStore): Promise<void> => {
  const { $supabase } = useNuxtApp();
  const freshState = structuredClone(defaultState);
  if (mode === 'all' || mode === 'pvp') {
    freshState.pvp.progressEpoch = getNextProgressEpoch(store.$state.pvp);
  }
  if (mode === 'all' || mode === 'pve') {
    freshState.pve.progressEpoch = getNextProgressEpoch(store.$state.pve);
  }
  if ($supabase.user.loggedIn && $supabase.user.id) {
    const nextRemoteState: UserState = {
      ...store.$state,
      currentGameMode: mode === 'all' ? freshState.currentGameMode : store.$state.currentGameMode,
      gameEdition: mode === 'all' ? freshState.gameEdition : store.$state.gameEdition,
      tarkovUid: mode === 'all' ? freshState.tarkovUid : store.$state.tarkovUid,
      pvp: mode === 'all' || mode === 'pvp' ? freshState.pvp : store.$state.pvp,
      pve: mode === 'all' || mode === 'pve' ? freshState.pve : store.$state.pve,
    };
    const payload = buildUpsertPayload($supabase.user.id, nextRemoteState);
    const { error } = await $supabase.client.from('user_progress').upsert(payload);
    if (error) {
      throw new Error(`Failed to reset remote progress: ${error.message}`);
    }
    recordLocalSyncTime();
  }
  store.$patch((state) => {
    if (mode === 'all' || mode === 'pvp') state.pvp = freshState.pvp;
    if (mode === 'all' || mode === 'pve') state.pve = freshState.pve;
    if (mode === 'all') {
      state.currentGameMode = freshState.currentGameMode;
      state.gameEdition = freshState.gameEdition;
      state.tarkovUid = freshState.tarkovUid;
    }
  });
  clearProgressStorage();
};
