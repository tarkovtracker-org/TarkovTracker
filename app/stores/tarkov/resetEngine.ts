import { defaultState, type UserProgressData, type UserState } from '@/stores/progressState';
import { clearActiveProgressStorage } from '@/stores/tarkov/localStorage';
import {
  getNextProgressEpoch,
  hasRetainableModeProgress,
  mergeManualActivityHistory,
  mergePreferringSingleValues,
  mergeProgressData,
  mergeStoryChapterProgress,
  toProgressEpoch,
} from '@/stores/tarkov/progressMerge';
import { syncProgressState } from '@/stores/tarkov/progressPersistence';
import {
  hasPendingCloudChanges,
  hasUnsavedProgressChanges,
} from '@/stores/tarkov/progressSaveStatus';
import { getRegisteredSyncController } from '@/stores/tarkov/realtimeListener';
import { saveSupersededProgressCopy } from '@/stores/tarkov/supersededProgress';
import { recordLocalSyncTime } from '@/stores/tarkov/syncTimeline';
import { delay } from '@/utils/async';
import { ACTIVE_SEASON_NUMBER, GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { mergeTaskAvailability } from '@/utils/taskAvailabilityConfirmation';
const RESET_SETTLE_DELAY_MS = 100;
export type ResetMode = GameMode | 'all';
type ResetTargetStore = {
  $patch: (fn: (state: UserState) => void) => void;
  $state: UserState;
};
const hasPendingOrUnsavedProgress = (): boolean =>
  hasPendingCloudChanges() || hasUnsavedProgressChanges();
/** Reset clocks alone (an earlier reset) are not progress worth retaining. */
const hasChangesInResetModes = (resetModes: readonly GameMode[], state: UserState): boolean =>
  resetModes.some((mode) => hasRetainableModeProgress(state[mode]));
const hasControllerlessLocalChanges = (
  syncControllerAvailable: boolean,
  hasLocalChanges: boolean
): boolean => !syncControllerAvailable && hasLocalChanges;
const ownerIdToRetainBeforeReset = (
  ownerId: string | null,
  syncControllerAvailable: boolean,
  hasLocalChanges: boolean
): string | null => {
  if (!ownerId) return null;
  if (hasPendingOrUnsavedProgress()) return ownerId;
  return hasControllerlessLocalChanges(syncControllerAvailable, hasLocalChanges) ? ownerId : null;
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
/** Freshness inputs that decide local-vs-remote precedence at startup. */
type StartupClocks = {
  localTimestamp: number | null;
  remoteUpdatedAt: number | null;
  localScore: number;
  remoteScore: number;
  modeUpdatedAt?: Partial<Record<GameMode, number>>;
  localModeTimestamps?: Partial<Record<GameMode, number>>;
};
/**
 * An explicit clock map distinguishes historical unknown progress from callers
 * using the legacy account-clock contract. Account-only changes cannot establish
 * whether an unknown mode is newer than an offline edit.
 */
const hasUnknownModeClock = (clocks: StartupClocks, mode: GameMode): boolean =>
  clocks.modeUpdatedAt !== undefined && clocks.modeUpdatedAt[mode] === undefined;
const resolveLocalModeTimestamp = (clocks: StartupClocks, mode: GameMode): number | null =>
  clocks.localModeTimestamps?.[mode] ?? clocks.localTimestamp;
const resolveRemoteModeTimestamp = (clocks: StartupClocks, mode: GameMode): number | null =>
  clocks.modeUpdatedAt?.[mode] ?? clocks.remoteUpdatedAt;
const shouldPreferLocalMode = (clocks: StartupClocks, mode: GameMode): boolean => {
  const localModeTimestamp = resolveLocalModeTimestamp(clocks, mode);
  if (hasUnknownModeClock(clocks, mode)) return (localModeTimestamp ?? 0) > 0;
  return shouldPreferLocalStartupMetadata(
    localModeTimestamp,
    resolveRemoteModeTimestamp(clocks, mode),
    clocks.localScore,
    clocks.remoteScore
  );
};
/**
 * Seasonal writes can advance independently of account metadata. Keep entry
 * timestamps and reset epochs while using this mode's own progress freshness.
 */
const mergeModeSnapshot = (
  localModeData: UserProgressData,
  remoteModeData: UserProgressData,
  preferLocalMode: boolean
): UserProgressData => {
  return preferLocalMode
    ? mergePreferringSingleValues(remoteModeData, localModeData)
    : mergePreferringSingleValues(localModeData, remoteModeData);
};
const mergeModeHistories = (
  localModeData: UserProgressData,
  remoteModeData: UserProgressData,
  preferLocalMode: boolean
): UserProgressData => ({
  ...(preferLocalMode ? localModeData : remoteModeData),
  ...mergeManualActivityHistory(localModeData, remoteModeData),
  storyChapters: mergeStoryChapterProgress(
    localModeData.storyChapters,
    remoteModeData.storyChapters
  ),
  taskAvailability: mergeTaskAvailability(
    localModeData.taskAvailability,
    remoteModeData.taskAvailability
  ),
});
const resolveModeData = (
  clocks: StartupClocks,
  mergeModeSnapshots: boolean,
  localModeData: UserProgressData,
  remoteModeData: UserProgressData,
  mode: GameMode
): UserProgressData => {
  // A differing reset epoch means one side was reset; that takes precedence over
  // freshness comparisons.
  if (toProgressEpoch(localModeData) !== toProgressEpoch(remoteModeData)) {
    return mergeProgressData(localModeData, remoteModeData);
  }
  const preferLocalMode = shouldPreferLocalMode(clocks, mode);
  if (mergeModeSnapshots || hasUnknownModeClock(clocks, mode)) {
    return mergeModeSnapshot(localModeData, remoteModeData, preferLocalMode);
  }
  return mergeModeHistories(localModeData, remoteModeData, preferLocalMode);
};
export const resolveInitialSyncState = (
  localState: UserState,
  remoteState: UserState,
  localTimestamp: number | null,
  remoteUpdatedAt: number | null,
  localScore: number,
  remoteScore: number,
  options: {
    mergeModeSnapshots?: boolean | Partial<Record<GameMode, boolean>>;
    modeUpdatedAt?: Partial<Record<GameMode, number>>;
    localModeTimestamps?: Partial<Record<GameMode, number>>;
  } = {}
): UserState => {
  const { mergeModeSnapshots = false, modeUpdatedAt } = options;
  const preferLocalMetadata = shouldPreferLocalStartupMetadata(
    localTimestamp,
    remoteUpdatedAt,
    localScore,
    remoteScore
  );
  const clocks: StartupClocks = {
    localTimestamp,
    remoteUpdatedAt,
    localScore,
    remoteScore,
    modeUpdatedAt,
    localModeTimestamps: options.localModeTimestamps,
  };
  const resolveMode = (
    localModeData: UserProgressData,
    remoteModeData: UserProgressData,
    mode: GameMode
  ): UserProgressData =>
    resolveModeData(
      clocks,
      typeof mergeModeSnapshots === 'boolean'
        ? mergeModeSnapshots
        : (mergeModeSnapshots[mode] ?? false),
      localModeData,
      remoteModeData,
      mode
    );
  return {
    currentGameMode: preferLocalMetadata ? localState.currentGameMode : remoteState.currentGameMode,
    gameEdition: preferLocalMetadata
      ? localState.gameEdition || defaultState.gameEdition
      : remoteState.gameEdition || defaultState.gameEdition,
    tarkovUid: preferLocalMetadata
      ? (localState.tarkovUid ?? null)
      : (remoteState.tarkovUid ?? null),
    pvp: resolveMode(localState.pvp, remoteState.pvp, GAME_MODES.PVP),
    pve: resolveMode(localState.pve, remoteState.pve, GAME_MODES.PVE),
    seasonal: resolveMode(localState.seasonal, remoteState.seasonal, GAME_MODES.SEASONAL),
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
const seasonNumberFor = (mode: GameMode, state: UserState): number | null =>
  mode === GAME_MODES.SEASONAL ? (state.seasonalSeasonNumber ?? null) : null;
/** Keep a superseded copy of each mode with retainable progress; others have nothing to keep. */
const retainSupersededModes = (
  ownerId: string,
  resetModes: readonly GameMode[],
  state: UserState
): void => {
  for (const mode of resetModes) {
    if (!hasRetainableModeProgress(state[mode])) continue;
    if (!saveSupersededProgressCopy(ownerId, mode, seasonNumberFor(mode, state), state[mode])) {
      throw new Error('Could not retain pending progress before reset');
    }
  }
};
const retainBeforeReset = (
  ownerId: string | null,
  resetModes: readonly GameMode[],
  state: UserState
): void => {
  const retentionOwnerId = ownerIdToRetainBeforeReset(
    ownerId,
    Boolean(getRegisteredSyncController()),
    hasChangesInResetModes(resetModes, state)
  );
  if (retentionOwnerId) retainSupersededModes(retentionOwnerId, resetModes, state);
};
/** The full post-reset state: reset modes (and metadata for `all`) from `freshState`. */
const buildResetState = (
  resetAll: boolean,
  resetModes: readonly GameMode[],
  current: UserState,
  freshState: UserState
): UserState => {
  const metadata = resetAll ? freshState : current;
  const modes = GAME_MODE_VALUES.map((mode) => [
    mode,
    resetModes.includes(mode) ? freshState[mode] : current[mode],
  ]);
  return {
    ...current,
    currentGameMode: metadata.currentGameMode,
    gameEdition: metadata.gameEdition,
    tarkovUid: metadata.tarkovUid,
    ...(Object.fromEntries(modes) as Pick<UserState, GameMode>),
  };
};
/** Returns the state the reset RPC saved, or `null` when signed out. */
const saveRemoteReset = async (
  userId: string | null,
  state: UserState
): Promise<UserState | null> => {
  if (!userId) return null;
  const { $supabase } = useNuxtApp();
  const { error } = await syncProgressState($supabase.client, userId, state);
  if (error) throw new Error(`Failed to reset remote progress: ${error.message}`);
  recordLocalSyncTime();
  return state;
};
/** Assigns only reset fields, so edits made to other modes during the RPC are kept. */
const applyResetToStore = (
  store: ResetTargetStore,
  resetAll: boolean,
  resetModes: readonly GameMode[],
  freshState: UserState
): void =>
  store.$patch((state) => {
    for (const mode of resetModes) state[mode] = freshState[mode];
    if (!resetAll) return;
    state.currentGameMode = freshState.currentGameMode;
    state.gameEdition = freshState.gameEdition;
    state.tarkovUid = freshState.tarkovUid;
  });
export const performReset = async (mode: ResetMode, store: ResetTargetStore): Promise<void> => {
  const { $supabase } = useNuxtApp();
  const freshState = structuredClone(defaultState);
  const resetAll = mode === 'all';
  const resetModes: readonly GameMode[] = resetAll ? GAME_MODE_VALUES : [mode];
  const ownerId = $supabase.user.loggedIn ? $supabase.user.id : null;
  const syncController = getRegisteredSyncController();
  retainBeforeReset(ownerId, resetModes, store.$state);
  for (const resetMode of resetModes) {
    freshState[resetMode].progressEpoch = getNextProgressEpoch(store.$state[resetMode]);
  }
  const resetState = buildResetState(resetAll, resetModes, store.$state, freshState);
  const saved = await saveRemoteReset(ownerId, resetState);
  applyResetToStore(store, resetAll, resetModes, freshState);
  // The reset RPC already saved this state; the patch above is not a new cloud change.
  if (saved) syncController?.acknowledgeExternalSave?.(saved);
  // Only this session's active copy: other accounts' recovery data is not part of a reset.
  // An uncleared copy would return on reload, so the reset must not be reported as complete.
  if (!(await clearActiveProgressStorage(ownerId, saved !== null)))
    throw new Error('Local progress could not be cleared after reset');
};
