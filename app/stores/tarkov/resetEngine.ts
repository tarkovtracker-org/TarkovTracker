import { defaultState, type UserProgressData, type UserState } from '@/stores/progressState';
import { clearActiveProgressStorage, resetGuestProgress } from '@/stores/tarkov/localStorage';
import { getNextProgressEpoch, hasRetainableModeProgress } from '@/stores/tarkov/progressMerge';
import { syncProgressState } from '@/stores/tarkov/progressPersistence';
import {
  hasPendingCloudChanges,
  hasUnsavedProgressChanges,
} from '@/stores/tarkov/progressSaveStatus';
import { applyPersistedProgressSnapshot } from '@/stores/tarkov/progressStorePersist';
import { getRegisteredSyncController } from '@/stores/tarkov/realtimeListener';
import { captureStartupOwnership } from '@/stores/tarkov/startupOwnership';
import { saveSupersededProgressCopy } from '@/stores/tarkov/supersededProgress';
import { recordLocalSyncTime } from '@/stores/tarkov/syncTimeline';
import { delay } from '@/utils/async';
import { GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { getCurrentSupabaseUserId } from '@/utils/userScopedStorage';
export { resolveInitialSyncState } from '@/stores/tarkov/initialSyncState';
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
  const ownsGeneration = captureStartupOwnership();
  const isCurrent = () => ownsGeneration() && getCurrentSupabaseUserId() === ownerId;
  if (!ownerId) {
    await resetGuestProgress(
      resetModes,
      resetAll,
      () => store.$state,
      (accepted) => applyPersistedProgressSnapshot(store, accepted)
    );
    return;
  }
  const syncController = getRegisteredSyncController();
  retainBeforeReset(ownerId, resetModes, store.$state);
  for (const resetMode of resetModes) {
    freshState[resetMode].progressEpoch = getNextProgressEpoch(store.$state[resetMode]);
  }
  const resetState = buildResetState(resetAll, resetModes, store.$state, freshState);
  const saved = await saveRemoteReset(ownerId, resetState);
  if (!isCurrent()) return;
  applyResetToStore(store, resetAll, resetModes, freshState);
  // The reset RPC already saved this state; the patch above is not a new cloud change.
  if (saved) {
    recordLocalSyncTime();
    syncController?.acknowledgeExternalSave?.(saved);
  }
  // Only this session's active copy: other accounts' recovery data is not part of a reset.
  // An uncleared copy would return on reload, so the reset must not be reported as complete.
  if (!(await clearActiveProgressStorage(ownerId, saved !== null)))
    throw new Error('Local progress could not be cleared after reset');
};
