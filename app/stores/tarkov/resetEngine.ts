import { defaultState, type UserProgressData, type UserState } from '@/stores/progressState';
import {
  getNextProgressEpoch,
  mergeProgressData,
  mergeStoryChapterProgress,
  toProgressEpoch,
} from '@/stores/tarkov/progressMerge';
import { syncProgressState } from '@/stores/tarkov/progressPersistence';
import { getRegisteredSyncController } from '@/stores/tarkov/realtimeListener';
import { recordLocalSyncTime } from '@/stores/tarkov/syncTimeline';
import { delay } from '@/utils/async';
import { clearProgressStorage } from '@/utils/clientStorage';
import { ACTIVE_SEASON_NUMBER, GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
const RESET_SETTLE_DELAY_MS = 100;
export type ResetMode = GameMode | 'all';
type ResetTargetStore = {
  $patch: (fn: (state: UserState) => void) => void;
  $state: UserState;
};
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
  remoteScore: number,
  mergeModeSnapshots = false,
  modeUpdatedAt?: Partial<Record<GameMode, number>>
): UserState => {
  const preferLocalMetadata = shouldPreferLocalStartupMetadata(
    localTimestamp,
    remoteUpdatedAt,
    localScore,
    remoteScore
  );
  // fallow-ignore-next-line complexity -- startup merge/reset precedence is covered in resetEngine.seasonalReset.test.ts
  const resolveModeData = (
    localModeData: UserProgressData,
    remoteModeData: UserProgressData,
    mode: GameMode
  ): UserProgressData => {
    const localEpoch = toProgressEpoch(localModeData);
    const remoteEpoch = toProgressEpoch(remoteModeData);
    if (localEpoch !== remoteEpoch) {
      return mergeProgressData(localModeData, remoteModeData);
    }
    const preferLocalMode = shouldPreferLocalStartupMetadata(
      localTimestamp,
      modeUpdatedAt?.[mode] ?? remoteUpdatedAt,
      localScore,
      remoteScore
    );
    const preferredModeData = preferLocalMode ? localModeData : remoteModeData;
    // Seasonal writes can advance independently of account metadata. Keep entry
    // timestamps and reset epochs while using this mode's own progress freshness.
    if (mergeModeSnapshots) {
      const merged = preferLocalMode
        ? mergeProgressData(remoteModeData, localModeData, true)
        : mergeProgressData(localModeData, remoteModeData, true);
      return {
        ...merged,
        displayName: preferredModeData.displayName,
        pmcFaction: preferredModeData.pmcFaction,
        xpOffset: preferredModeData.xpOffset,
        skillOffsets: preferredModeData.skillOffsets,
      };
    }
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
    pvp: resolveModeData(localState.pvp, remoteState.pvp, GAME_MODES.PVP),
    pve: resolveModeData(localState.pve, remoteState.pve, GAME_MODES.PVE),
    seasonal: resolveModeData(localState.seasonal, remoteState.seasonal, GAME_MODES.SEASONAL),
    seasonalSeasonNumber: ACTIVE_SEASON_NUMBER,
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
  const resetModes = mode === 'all' ? GAME_MODE_VALUES : [mode];
  for (const resetMode of resetModes) {
    freshState[resetMode].progressEpoch = getNextProgressEpoch(store.$state[resetMode]);
  }
  if ($supabase.user.loggedIn && $supabase.user.id) {
    const nextRemoteState: UserState = {
      ...store.$state,
      currentGameMode: mode === 'all' ? freshState.currentGameMode : store.$state.currentGameMode,
      gameEdition: mode === 'all' ? freshState.gameEdition : store.$state.gameEdition,
      tarkovUid: mode === 'all' ? freshState.tarkovUid : store.$state.tarkovUid,
      pvp: resetModes.includes('pvp') ? freshState.pvp : store.$state.pvp,
      pve: resetModes.includes('pve') ? freshState.pve : store.$state.pve,
      seasonal: resetModes.includes('seasonal') ? freshState.seasonal : store.$state.seasonal,
    };
    const { error } = await syncProgressState($supabase.client, $supabase.user.id, nextRemoteState);
    if (error) {
      throw new Error(`Failed to reset remote progress: ${error.message}`);
    }
    recordLocalSyncTime();
  }
  store.$patch((state) => {
    if (resetModes.includes('pvp')) state.pvp = freshState.pvp;
    if (resetModes.includes('pve')) state.pve = freshState.pve;
    if (resetModes.includes('seasonal')) state.seasonal = freshState.seasonal;
    if (mode === 'all') {
      state.currentGameMode = freshState.currentGameMode;
      state.gameEdition = freshState.gameEdition;
      state.tarkovUid = freshState.tarkovUid;
    }
  });
  clearProgressStorage();
};
