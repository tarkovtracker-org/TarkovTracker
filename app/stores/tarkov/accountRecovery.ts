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
import {
  mergeTaskAvailabilityCandidates,
  sanitizeTaskAvailabilityMap,
  taskAvailabilityCandidates,
  type ConfirmationMap,
} from '@/utils/taskAvailabilityConfirmation';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
/**
 * Account recovery copies (see `CONTEXT.md`): locally saved progress retained for its
 * owning account after sign-out or an account switch, restored only for that owner.
 */
const recoveryKey = (userId: string): string => `${STORAGE_KEYS.progressRecoveryPrefix}${userId}`;
let retentionFailure = false;
let blockedAccountOwner: string | null = null;
let historicalRetentionOwner: string | null = null;
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
  confirmations: ConfirmationMap;
  clock: number;
  /** Session handoffs use mode clocks; other unknown clocks use the copy's write time. */
  order: number;
  seasonNumber: number | null;
};
const toModeCandidate = (snapshot: PersistedProgressSnapshot, mode: GameMode): ModeCandidate => {
  const clock = snapshotModeClock(snapshot, mode);
  return {
    progress: snapshot.state[mode],
    confirmations: taskAvailabilityCandidates(
      snapshot.confirmationCandidates?.[mode] ?? snapshot.state[mode].taskAvailability
    ),
    clock,
    order: snapshot.isSessionHandoff ? clock : clock || validClock(snapshot.timestamp),
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
  const confirmations = mergeTaskAvailabilityCandidates(older.confirmations, newer.confirmations);
  progress.taskAvailability = sanitizeTaskAvailabilityMap(confirmations);
  const olderAlone = mergePreferringSingleValues(older.progress, older.progress);
  const unchanged =
    deepEqual(progress, olderAlone) && deepEqual(confirmations, older.confirmations);
  return { ...(unchanged ? older : newer), progress, confirmations };
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
  const confirmationCandidates: Partial<Record<GameMode, ConfirmationMap>> = {};
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
    confirmationCandidates[mode] = winner.confirmations;
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
    confirmationCandidates,
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
/** Only historical byte overflow needs unchanged retention; malformed/count-evicted entries do not. */
const hasHistoricalConfirmationOverflow = (snapshot: PersistedProgressSnapshot): boolean =>
  GAME_MODE_VALUES.filter(
    (mode) => mode !== 'seasonal' || isCurrentSeasonalSnapshot(snapshot)
  ).some(
    (mode) =>
      !deepEqual(
        snapshot.confirmationCandidates?.[mode] ?? {},
        snapshot.state[mode].taskAvailability ?? {}
      )
  );
const sameSnapshotClocks = (
  source: PersistedProgressSnapshot,
  composed: PersistedProgressSnapshot
): boolean =>
  validClock(source.timestamp) === validClock(composed.timestamp) &&
  snapshotMetadataClock(source) === snapshotMetadataClock(composed) &&
  GAME_MODE_VALUES.every(
    (mode) => snapshotModeClock(source, mode) === snapshotModeClock(composed, mode)
  );
const representsComposedSnapshot = (
  source: PersistedProgressSnapshot,
  composed: PersistedProgressSnapshot
): boolean =>
  deepEqual(source.state, composed.state) &&
  deepEqual(source.confirmationCandidates, composed.confirmationCandidates) &&
  sameSnapshotClocks(source, composed);
const originalRecoveryValue = (
  snapshots: PersistedProgressSnapshot[],
  values: string[],
  composed: PersistedProgressSnapshot
): string | null => {
  const index = snapshots.findIndex((snapshot) => representsComposedSnapshot(snapshot, composed));
  return index < 0 ? null : values[index]!;
};
const blockHistoricalRetention = (ownerId: string): void => {
  blockAccountRecoveryRetentionForOwner(ownerId);
  historicalRetentionOwner = ownerId;
  setActiveProgressWritesBlocked(true);
};
const boundedRecoveryValue = (composed: PersistedProgressSnapshot, ownerId: string): string =>
  JSON.stringify({
    _timestamp: composed.timestamp,
    _metadataTimestamp: composed.metadataTimestamp,
    _modeTimestamps: composed.modeTimestamps,
    _userId: ownerId,
    data: composed.state,
  });
const retainedRecoveryValue = (
  snapshots: PersistedProgressSnapshot[],
  values: string[],
  composed: PersistedProgressSnapshot,
  ownerId: string
): string | null => {
  if (!hasHistoricalConfirmationOverflow(composed)) return boundedRecoveryValue(composed, ownerId);
  // One existing slot may hold one unchanged historical payload, never synthesized overflow.
  // Divergent sources requiring more evidence leave both existing originals untouched.
  const original = originalRecoveryValue(snapshots, values, composed);
  if (original === null) blockHistoricalRetention(ownerId);
  return original;
};
const persistRecoveryValue = (
  ownerId: string,
  current: string | null,
  encoded: string,
  historical: boolean
): boolean => {
  const retained = current === encoded || writeRecoveryCopy(ownerId, encoded);
  if (retained) {
    clearBlockedAccountRecoveryRetention(ownerId);
    return true;
  }
  if (historical) blockHistoricalRetention(ownerId);
  else {
    blockAccountRecoveryRetentionForOwner(ownerId);
    setActiveProgressWritesBlocked(true);
  }
  return false;
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
  // Identical validated owner bytes already retain every field; composing them can
  // normalize legacy task timestamps and falsely classify unchanged history as divergent.
  if (current.raw === raw) return persistRecoveryValue(ownerId, raw, raw, false);
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
  const encoded = retainedRecoveryValue(
    snapshots,
    current.raw === null ? [raw] : [current.raw, raw],
    composed,
    ownerId
  );
  if (encoded === null) return false;
  return persistRecoveryValue(
    ownerId,
    current.raw,
    encoded,
    hasHistoricalConfirmationOverflow(composed)
  );
};
const readOwnedHistoricalSources = (
  ownerId: string
): (PersistedProgressSnapshot | null)[] | null => {
  try {
    const active = localStorage.getItem(STORAGE_KEYS.progress);
    const recovery = readRecoveryStorage(ownerId);
    if (!recovery.ok) return null;
    const values = [active, recovery.raw].filter((raw): raw is string => raw !== null);
    const snapshots = values.map((raw) => parsePersistedProgressState(raw, ownerId));
    return snapshots.some((snapshot) => snapshot === null) ? null : snapshots;
  } catch {
    return null;
  }
};
const resumeOwnedHistoricalReconciliation = (ownerId: string): boolean => {
  const snapshots = readOwnedHistoricalSources(ownerId);
  if (!snapshots?.some((snapshot) => snapshot && hasHistoricalConfirmationOverflow(snapshot)))
    return false;
  clearBlockedAccountRecoveryRetention(ownerId);
  return true;
};
export const retryBlockedAccountRecoveryRetention = (reconcilingOwner?: string): boolean => {
  if (!blockedAccountOwner) return true;
  if (reconcilingOwner === historicalRetentionOwner && reconcilingOwner === blockedAccountOwner) {
    return resumeOwnedHistoricalReconciliation(reconcilingOwner);
  }
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
  historicalRetentionOwner = null;
  retentionFailure = true;
  blockedAccountOwner = ownerId;
};
export const resetAccountRecoveryRetentionBlock = (): void => {
  historicalRetentionOwner = null;
  retentionFailure = false;
  blockedAccountOwner = null;
};
/** Explicit owner-scoped device-data removal is the only path that can discard a blocked copy. */
export const clearBlockedAccountRecoveryRetention = (ownerId: string): void => {
  if (blockedAccountOwner !== ownerId) return;
  retentionFailure = false;
  blockedAccountOwner = null;
  historicalRetentionOwner = null;
  setActiveProgressWritesBlocked(false);
};
/** A proven startup merge/upload releases only this owner's historical-retention barrier. */
export const acknowledgeHistoricalReconciliation = (ownerId: string): void => {
  if (historicalRetentionOwner === ownerId) clearBlockedAccountRecoveryRetention(ownerId);
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
/** An unreadable recovery slot or a retention block may still hold the owner's changes. */
export const mayHoldAccountRecoveryCopy = (userId: string): boolean => {
  const { ok, raw } = readRecoveryStorage(userId);
  return !ok || raw !== null || isAccountRecoveryRetentionBlocked();
};
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
    // Once the opaque bytes are preserved, a barrier from an earlier failed attempt is lifted.
    const preserved = preserveUnparseableActiveProgress(raw);
    if (preserved) setActiveProgressWritesBlocked(false);
    return preserved;
  }
  const ownerId = parseUserScopedStorage<unknown>(raw)?._userId ?? null;
  if (!ownerId || ownerId === userId) return true;
  const retained = saveAccountRecoveryCopy(raw, ownerId);
  if (!retained) retentionFailure = true;
  return retained;
};
const needsHistoricalRetention = (current: string, ownerId: string): boolean => {
  const snapshot = parsePersistedProgressState(current, ownerId);
  return snapshot !== null && hasHistoricalConfirmationOverflow(snapshot);
};
const canReplaceOwnActiveProgress = (
  current: string,
  ownerId: string,
  cloudHeld: boolean
): boolean => cloudHeld || !needsHistoricalRetention(current, ownerId);
const retainParseableActiveProgress = (
  current: string,
  next: string | null,
  cloudHeld = false
): boolean => {
  const currentEnvelope = parseUserScopedStorage<unknown>(current);
  if (!currentEnvelope) return true;
  const ownerId = currentEnvelope._userId;
  const nextOwnerId = next ? (parseUserScopedStorage<unknown>(next)?._userId ?? null) : null;
  if (!ownerId) return true;
  if (ownerId === nextOwnerId && canReplaceOwnActiveProgress(current, ownerId, cloudHeld))
    return true;
  const retained = saveAccountRecoveryCopy(current, ownerId);
  if (!retained) {
    retentionFailure = true;
    blockedAccountOwner = ownerId;
    setActiveProgressWritesBlocked(true);
  }
  return retained;
};
const retainActiveProgressBeforeChange = (
  current: string | null,
  next: string | null,
  cloudHeld = false
): boolean => {
  if (!current) return true;
  if (isUnparseableProgressStorageValue(current)) {
    return preserveUnparseableActiveProgress(current);
  }
  return retainParseableActiveProgress(current, next, cloudHeld);
};
setActiveProgressRetentionGuard(retainActiveProgressBeforeChange);
