import { defaultState, type UserProgressData, type UserState } from '@/stores/progressState';
import {
  mergeManualActivityHistory,
  mergePreferringSingleValues,
  mergeProgressData,
  mergeStoryChapterProgress,
  toProgressEpoch,
} from '@/stores/tarkov/progressMerge';
import { ACTIVE_SEASON_NUMBER, GAME_MODES, type GameMode } from '@/utils/constants';
import { mergeTaskAvailability } from '@/utils/taskAvailabilityConfirmation';
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
