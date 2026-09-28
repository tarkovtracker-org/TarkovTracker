import { defaultState, type UserProgressData, type UserState } from '@/stores/progressState';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import {
  parsePersistedProgressState,
  cloneStateSnapshot,
  isLocalStorageInaccessible,
  isUnparseableProgressStorageValue,
  preserveUnparseableActiveProgress,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
  setActiveProgressRetentionGuard,
  type PersistedProgressSnapshot,
  setActiveProgressWritesBlocked,
} from '@/stores/tarkov/localStorage';
import {
  hasRetainableModeProgress,
  mergePreferringSingleValues,
  toProgressEpoch,
} from '@/stores/tarkov/progressMerge';
import { saveSupersededProgressCopy } from '@/stores/tarkov/supersededProgress';
import { GAME_MODE_VALUES, ACTIVE_SEASON_NUMBER, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
/**
 * Account recovery copies (see `CONTEXT.md`): locally saved progress retained for its
 * owning account after sign-out or an account switch, restored only for that owner.
 */
const recoveryKey = (userId: string): string => `${STORAGE_KEYS.progressRecoveryPrefix}${userId}`;
let retentionFailure = false;
let blockedAccountOwner: string | null = null;
const isOwnedBy = (raw: string, ownerId: string): boolean =>
  parseUserScopedStorage<unknown>(raw)?._userId === ownerId;
const writeRecoveryCopy = (ownerId: string, raw: string): boolean => {
  const saved = safeSetItem(recoveryKey(ownerId), raw);
  if (!saved) logger.error('[AccountRecovery] Could not retain the account recovery copy');
  return saved;
};
const isRetainable = (raw: string | null, ownerId: string | null): ownerId is string =>
  Boolean(raw && ownerId && isOwnedBy(raw, ownerId));
const staleSeasonalData = (
  data: Record<string, unknown> | undefined
): { seasonNumber: number; progress: UserProgressData } | null => {
  const seasonNumber = data?.seasonalSeasonNumber;
  const progress = data?.seasonal;
  if (typeof seasonNumber !== 'number') return null;
  if (seasonNumber === ACTIVE_SEASON_NUMBER) return null;
  if (!hasRetainableModeProgress(progress as UserProgressData)) return null;
  return { seasonNumber, progress: progress as UserProgressData };
};
const archiveStaleSeasonalData = (
  userId: string,
  stale: { seasonNumber: number; progress: UserProgressData }
): boolean => {
  const retained = saveSupersededProgressCopy(
    userId,
    'seasonal',
    stale.seasonNumber,
    stale.progress
  );
  if (!retained) blockAccountRecoveryRetentionForOwner(userId);
  return retained !== null;
};
function preserveRawMismatchedSeason(userId: string, raw: string): boolean {
  const wrapped = parseUserScopedStorage<Record<string, unknown>>(raw);
  if (!wrapped || wrapped._userId !== userId) return false;
  const stale = staleSeasonalData(wrapped.data);
  return stale ? archiveStaleSeasonalData(userId, stale) : true;
}
const validClock = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const snapshotMetadataClock = (snapshot: PersistedProgressSnapshot): number =>
  validClock(snapshot.metadataTimestamp ?? snapshot.timestamp);
const snapshotModeClock = (snapshot: PersistedProgressSnapshot, mode: GameMode): number =>
  mode === 'seasonal' && !isCurrentSeasonalSnapshot(snapshot)
    ? 0
    : validClock(snapshot.modeTimestamps?.[mode] ?? snapshot.timestamp);
const isCurrentSeasonalSnapshot = (snapshot: PersistedProgressSnapshot): boolean =>
  (snapshot.seasonalSourceSeasonNumber ?? snapshot.state.seasonalSeasonNumber) ===
  ACTIVE_SEASON_NUMBER;
const currentSeasonSnapshots = (
  snapshots: PersistedProgressSnapshot[]
): PersistedProgressSnapshot[] => snapshots.filter(isCurrentSeasonalSnapshot);
const latestSnapshotByClock = (
  snapshots: PersistedProgressSnapshot[],
  getClock: (snapshot: PersistedProgressSnapshot) => number
): PersistedProgressSnapshot =>
  snapshots.reduce((winner, candidate) =>
    getClock(candidate) >= getClock(winner) ? candidate : winner
  );
type ModeCandidate = {
  progress: UserProgressData;
  clock: number;
  /** Orders equal-epoch copies; an unknown (zero) mode clock falls back to the copy's write time. */
  order: number;
  seasonNumber: number | null;
};
const toModeCandidate = (snapshot: PersistedProgressSnapshot, mode: GameMode): ModeCandidate => {
  const clock = snapshotModeClock(snapshot, mode);
  return {
    progress: snapshot.state[mode],
    clock,
    order: clock || validClock(snapshot.timestamp),
    seasonNumber: mode === 'seasonal' ? (snapshot.state.seasonalSeasonNumber ?? null) : null,
  };
};
const archiveDisplacedMode = (
  ownerId: string | null,
  displaced: ModeCandidate,
  mode: GameMode
): boolean => {
  if (!hasRetainableModeProgress(displaced.progress)) return true;
  if (!ownerId) return false;
  if (saveSupersededProgressCopy(ownerId, mode, displaced.seasonNumber, displaced.progress)) {
    return true;
  }
  blockAccountRecoveryRetentionForOwner(ownerId);
  setActiveProgressWritesBlocked(true);
  return false;
};
/**
 * Equal-epoch copies can each hold edits the other lacks (for example two tabs), so they are
 * merged like any other local/remote pair; the newer clock wins fields that need a single value.
 * A newer copy that contributes nothing, such as a default placeholder, keeps the older clock.
 */
const mergeEqualEpochModes = (left: ModeCandidate, right: ModeCandidate): ModeCandidate => {
  const [older, newer] = right.order >= left.order ? [left, right] : [right, left];
  const progress = mergePreferringSingleValues(older.progress, newer.progress);
  const olderAlone = mergePreferringSingleValues(older.progress, older.progress);
  return { ...(deepEqual(progress, olderAlone) ? older : newer), progress };
};
const preferModeCandidate = (
  winner: ModeCandidate,
  candidate: ModeCandidate,
  ownerId: string | null,
  mode: GameMode
): ModeCandidate | null => {
  const winnerEpoch = toProgressEpoch(winner.progress);
  const candidateEpoch = toProgressEpoch(candidate.progress);
  if (candidateEpoch > winnerEpoch) {
    return archiveDisplacedMode(ownerId, winner, mode) ? candidate : null;
  }
  if (candidateEpoch < winnerEpoch) {
    return archiveDisplacedMode(ownerId, candidate, mode) ? winner : null;
  }
  return mergeEqualEpochModes(winner, candidate);
};
const newestModeCandidate = (
  snapshots: PersistedProgressSnapshot[],
  ownerId: string | null,
  mode: GameMode
): ModeCandidate | null => {
  let winner: ModeCandidate | null = toModeCandidate(snapshots[0]!, mode);
  for (const snapshot of snapshots.slice(1)) {
    winner = preferModeCandidate(winner, toModeCandidate(snapshot, mode), ownerId, mode);
    if (!winner) return null;
  }
  return winner;
};
/** Compose wrapper snapshots by the clocks that own each independent field. */
const composeOwnerSnapshots = (
  snapshots: PersistedProgressSnapshot[],
  ownerId: string | null
): PersistedProgressSnapshot | null => {
  if (!snapshots.length) return null;
  const metadataWinner = latestSnapshotByClock(snapshots, snapshotMetadataClock);
  const state = cloneStateSnapshot(metadataWinner.state);
  const modeTimestamps: Partial<Record<GameMode, number>> = {};
  for (const mode of GAME_MODE_VALUES) {
    const candidates = mode === 'seasonal' ? currentSeasonSnapshots(snapshots) : snapshots;
    const winner = candidates.length ? newestModeCandidate(candidates, ownerId, mode) : null;
    if (!candidates.length) {
      state.seasonal = cloneStateSnapshot(defaultState.seasonal);
      modeTimestamps[mode] = 0;
      continue;
    }
    if (!winner) return null;
    state[mode] = cloneStateSnapshot(winner.progress);
    modeTimestamps[mode] = winner.clock;
  }
  state.seasonalSeasonNumber = ACTIVE_SEASON_NUMBER;
  const timestamps = snapshots.map((snapshot) => validClock(snapshot.timestamp));
  const timestamp = Math.max(...timestamps);
  return {
    hadDeprecatedProgressData: snapshots.some((snapshot) => snapshot.hadDeprecatedProgressData),
    state,
    storedUserId: ownerId,
    timestamp,
    metadataTimestamp: snapshotMetadataClock(metadataWinner),
    modeTimestamps,
    seasonalSourceSeasonNumber: ACTIVE_SEASON_NUMBER,
  };
};
const parseOwnedRecoverySnapshot = (
  raw: string,
  ownerId: string
): PersistedProgressSnapshot | null => {
  const wrapped = parseUserScopedStorage<UserState>(raw);
  if (!wrapped || wrapped._userId !== ownerId) return null;
  if (!preserveRawMismatchedSeason(ownerId, raw)) return null;
  return parsePersistedProgressState(raw, ownerId);
};
const readRecoveryStorage = (ownerId: string): { ok: boolean; raw: string | null } => {
  if (typeof window === 'undefined') return { ok: false, raw: null };
  try {
    return { ok: true, raw: localStorage.getItem(recoveryKey(ownerId)) };
  } catch (error) {
    // Fully blocked storage holds no copy to protect, and every write fails as well.
    if (isLocalStorageInaccessible()) return { ok: true, raw: null };
    logger.error('[AccountRecovery] Could not read the account recovery copy', error);
    return { ok: false, raw: null };
  }
};
/**
 * Retains `raw` as `ownerId`'s recovery copy. Returns `true` only when the newest
 * metadata and each mode are represented, with any displaced reset data exportable.
 */
export const saveAccountRecoveryCopy = (raw: string | null, ownerId: string | null): boolean => {
  if (!raw || !isRetainable(raw, ownerId)) return false;
  const source = parseOwnedRecoverySnapshot(raw, ownerId);
  const current = readRecoveryStorage(ownerId);
  if (!source || !current.ok) {
    blockAccountRecoveryRetentionForOwner(ownerId);
    setActiveProgressWritesBlocked(true);
    return false;
  }
  const snapshots = [
    ...(current.raw === null
      ? []
      : [parseOwnedRecoverySnapshot(current.raw, ownerId)].filter(
          (snapshot): snapshot is PersistedProgressSnapshot => snapshot !== null
        )),
    source,
  ];
  if (current.raw !== null && snapshots.length < 2) {
    blockAccountRecoveryRetentionForOwner(ownerId);
    setActiveProgressWritesBlocked(true);
    return false;
  }
  const composed = composeOwnerSnapshots(snapshots, ownerId);
  if (!composed) return false;
  const encoded = JSON.stringify({
    _timestamp: composed.timestamp,
    _metadataTimestamp: composed.metadataTimestamp,
    _modeTimestamps: composed.modeTimestamps,
    _userId: ownerId,
    data: composed.state,
  });
  const retained = current.raw === encoded || writeRecoveryCopy(ownerId, encoded);
  if (!retained) {
    blockAccountRecoveryRetentionForOwner(ownerId);
    setActiveProgressWritesBlocked(true);
  } else if (blockedAccountOwner === ownerId) {
    clearBlockedAccountRecoveryRetention(ownerId);
  }
  return retained;
};
export const retryBlockedAccountRecoveryRetention = (): boolean => {
  if (!blockedAccountOwner) return true;
  const active = safeGetItem(STORAGE_KEYS.progress);
  if (active && isOwnedBy(active, blockedAccountOwner)) {
    return saveAccountRecoveryCopy(active, blockedAccountOwner);
  }
  const recovery = readRecoveryStorage(blockedAccountOwner);
  return recovery.ok && recovery.raw
    ? saveAccountRecoveryCopy(recovery.raw, blockedAccountOwner)
    : false;
};
export const isAccountRecoveryRetentionBlocked = (): boolean => retentionFailure;
export const markAccountRecoveryRetentionBlocked = (): void => {
  retentionFailure = true;
};
export const blockAccountRecoveryRetentionForOwner = (ownerId: string): void => {
  retentionFailure = true;
  blockedAccountOwner = ownerId;
};
export const resetAccountRecoveryRetentionBlock = (): void => {
  retentionFailure = false;
  blockedAccountOwner = null;
};
/** Explicit owner-scoped device-data removal is the only path that can discard a blocked copy. */
export const clearBlockedAccountRecoveryRetention = (ownerId: string): void => {
  if (blockedAccountOwner !== ownerId) return;
  retentionFailure = false;
  blockedAccountOwner = null;
  setActiveProgressWritesBlocked(false);
};
export const readAccountRecoveryCopy = (userId: string): PersistedProgressSnapshot | null => {
  const { ok, raw } = readRecoveryStorage(userId);
  if (!ok) {
    blockAccountRecoveryRetentionForOwner(userId);
    setActiveProgressWritesBlocked(true);
    return null;
  }
  if (!raw) return null;
  const snapshot = parseOwnedRecoverySnapshot(raw, userId);
  if (snapshot) {
    if (blockedAccountOwner === userId) clearBlockedAccountRecoveryRetention(userId);
  } else {
    blockAccountRecoveryRetentionForOwner(userId);
    setActiveProgressWritesBlocked(true);
  }
  return snapshot;
};
export const hasAccountRecoveryCopy = (userId: string): boolean =>
  safeGetItem(recoveryKey(userId)) !== null;
export const removeAccountRecoveryCopy = (userId: string): boolean =>
  safeRemoveItem(recoveryKey(userId));
/** Chooses the freshest owner snapshot from recovery, active storage, or a session handoff. */
export const selectFreshestOwnerProgressSnapshot = (
  recovery: PersistedProgressSnapshot | null,
  active: PersistedProgressSnapshot | null,
  handoff: PersistedProgressSnapshot | null = null
): PersistedProgressSnapshot | null => {
  const snapshots = [recovery, handoff, active].filter(
    (snapshot): snapshot is PersistedProgressSnapshot => snapshot !== null
  );
  const ownerId = active?.storedUserId ?? recovery?.storedUserId ?? handoff?.storedUserId ?? null;
  if (
    ownerId &&
    snapshots.some(
      (snapshot) => snapshot.storedUserId !== null && snapshot.storedUserId !== ownerId
    )
  ) {
    blockAccountRecoveryRetentionForOwner(ownerId);
    setActiveProgressWritesBlocked(true);
    return null;
  }
  return composeOwnerSnapshots(
    snapshots.filter((snapshot) => snapshot.storedUserId === ownerId),
    ownerId
  );
};
/** Retains the active copy for its owner when it belongs to an account other than `userId`. */
export const preserveForeignActiveCopy = (userId: string | null): boolean => {
  const raw = safeGetItem(STORAGE_KEYS.progress);
  if (!raw) return true;
  if (isUnparseableProgressStorageValue(raw)) {
    return preserveUnparseableActiveProgress(raw);
  }
  const ownerId = parseUserScopedStorage<unknown>(raw)?._userId ?? null;
  if (!ownerId || ownerId === userId) return true;
  const retained = saveAccountRecoveryCopy(raw, ownerId);
  if (!retained) retentionFailure = true;
  return retained;
};
const retainParseableActiveProgress = (current: string, next: string | null): boolean => {
  const currentEnvelope = parseUserScopedStorage<unknown>(current);
  if (!currentEnvelope) return true;
  const ownerId = currentEnvelope._userId;
  const nextOwnerId = next ? (parseUserScopedStorage<unknown>(next)?._userId ?? null) : null;
  if (!ownerId || ownerId === nextOwnerId) return true;
  const retained = saveAccountRecoveryCopy(current, ownerId);
  if (!retained) {
    retentionFailure = true;
    blockedAccountOwner = ownerId;
    setActiveProgressWritesBlocked(true);
  }
  return retained;
};
const retainActiveProgressBeforeChange = (current: string | null, next: string | null): boolean => {
  if (!current) return true;
  if (isUnparseableProgressStorageValue(current)) {
    return preserveUnparseableActiveProgress(current);
  }
  return retainParseableActiveProgress(current, next);
};
setActiveProgressRetentionGuard(retainActiveProgressBeforeChange);
