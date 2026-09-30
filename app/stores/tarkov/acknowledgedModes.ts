import { deepEqual } from '@/stores/tarkov/deepEqual';
import { GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import type { UserProgressData, UserState } from '@/stores/progressState';
export type ModeProgressMap = Partial<Record<GameMode, UserProgressData>>;
export type ProgressSyncSnapshot = Partial<
  Pick<UserState, GameMode | 'currentGameMode' | 'gameEdition' | 'tarkovUid'>
>;
type RemoteProgressUpdate = { remote: ProgressSyncSnapshot; applied: ProgressSyncSnapshot };
/**
 * Per-mode progress the server is known to hold for one account: loaded at startup or
 * acknowledged by a sync. A sync sends only modes that differ, so unchanged modes are never
 * re-uploaded and the payload stays within the server's size cap.
 */
let ownerId: string | null = null;
let acknowledged: ModeProgressMap = {};
let generation = 0;
let remoteApplied = 0;
let expectedProgress: ProgressSyncSnapshot | null = null;
const toWire = (progress: UserProgressData): UserProgressData =>
  JSON.parse(JSON.stringify(progress)) as UserProgressData;
export const clearAcknowledgedModes = (): void => {
  generation += 1;
  ownerId = null;
  acknowledged = {};
  expectedProgress = null;
};
/** Replacing another owner's baseline invalidates that owner's in-flight acknowledgements. */
const claimOwner = (userId: string): void => {
  if (ownerId === userId) return;
  generation += 1;
  ownerId = userId;
  acknowledged = {};
  expectedProgress = null;
};
/** Records modes the server holds for `userId`; another owner's baseline is replaced. */
export const recordAcknowledgedModes = (userId: string, modes: ModeProgressMap): void => {
  claimOwner(userId);
  for (const mode of GAME_MODE_VALUES) {
    const progress = modes[mode];
    if (progress) acknowledged[mode] = toWire(progress);
  }
};
/** A dispatched write can still commit after supersession or a same-account session reset. */
export const invalidateAcknowledgedModes = (userId: string, modes: ModeProgressMap): void => {
  if (ownerId !== userId) return;
  acknowledged = Object.fromEntries(
    Object.entries(acknowledged).filter(([mode]) => !Object.hasOwn(modes, mode))
  );
};
const matchesExpectedProgress = (snapshot: ProgressSyncSnapshot): boolean => {
  const expected = expectedProgress;
  return (
    expected !== null &&
    Object.entries(snapshot).every(
      ([key, value]) =>
        !Object.hasOwn(expected, key) ||
        deepEqual(expected[key as keyof ProgressSyncSnapshot], value)
    )
  );
};
const isCompatibleProgressUpdate = (update: RemoteProgressUpdate): boolean =>
  matchesExpectedProgress(update.remote) && matchesExpectedProgress(update.applied);
/** Matching echoes and updates outside the write scope do not supersede the current save. */
export const noteRemoteProgressApplied = (update?: RemoteProgressUpdate): void => {
  if (update && isCompatibleProgressUpdate(update)) return;
  remoteApplied += 1;
  expectedProgress = null;
};
/**
 * Starts a multi-request sync and supersedes any older one still in flight. `isCurrent` turns false
 * once a newer sync starts, the baseline is cleared or claimed by another account, or Realtime
 * applies newer progress or metadata; the sync then stops so later requests never replay a stale
 * snapshot. `acknowledge` records a batch only while current.
 */
export const beginAcknowledgement = (userId: string, expected?: ProgressSyncSnapshot) => {
  claimOwner(userId);
  generation += 1;
  expectedProgress = expected
    ? (JSON.parse(JSON.stringify(expected)) as ProgressSyncSnapshot)
    : null;
  const started = { generation, remoteApplied };
  const isCurrent = (): boolean =>
    generation === started.generation && remoteApplied === started.remoteApplied;
  return {
    isCurrent,
    acknowledge: (modes: ModeProgressMap): void => {
      if (isCurrent()) recordAcknowledgedModes(userId, modes);
    },
    finish: (): void => {
      if (isCurrent()) expectedProgress = null;
    },
  };
};
/** Modes whose progress differs from what the server is known to hold; unknown modes differ. */
export const selectChangedModes = (userId: string, modes: ModeProgressMap): ModeProgressMap => {
  const known = ownerId === userId ? acknowledged : {};
  const differs = (mode: GameMode): boolean => {
    const progress = modes[mode];
    return progress !== undefined && !deepEqual(known[mode], toWire(progress));
  };
  return Object.fromEntries(GAME_MODE_VALUES.filter(differs).map((mode) => [mode, modes[mode]]));
};
