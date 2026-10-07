import { defaultState, migrateToGameModeStructure, type UserState } from '@/stores/progressState';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import { resolveInitialSyncState } from '@/stores/tarkov/initialSyncState';
import { getNextProgressEpoch, toProgressEpoch } from '@/stores/tarkov/progressMerge';
import {
  classifyLocalSaveFailure,
  progressSaveStatus,
  recordLocalSave,
  recordLocalSavePending,
} from '@/stores/tarkov/progressSaveStatus';
import { ACTIVE_SEASON_NUMBER, GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  hasDeprecatedTarkovDevProfileData,
  sanitizeOwnedUserState,
} from '@/utils/progressSanitizers';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
import {
  taskAvailabilityCandidates,
  type ConfirmationMap,
} from '@/utils/taskAvailabilityConfirmation';
import { getCurrentSupabaseUserId, parseUserScopedStorage } from '@/utils/userScopedStorage';
export type PersistedProgressSnapshot = {
  hadDeprecatedProgressData: boolean;
  state: UserState;
  storedUserId: string | null;
  timestamp: number | null;
  metadataTimestamp?: number;
  modeTimestamps?: Partial<Record<GameMode, number>>;
  /** Count-bounded evidence for reconciliation only; never serialized or applied to Pinia. */
  confirmationCandidates?: Partial<Record<GameMode, ConfirmationMap>>;
  isSessionHandoff?: boolean;
  /** Original season attached to the seasonal payload before migration/sanitization. */
  seasonalSourceSeasonNumber?: number;
};
const metadataKeys = ['currentGameMode', 'gameEdition', 'tarkovUid'] as const;
const sameMetadata = (left: Partial<UserState>, right: Partial<UserState>) =>
  metadataKeys.every((key) => deepEqual(left[key], right[key]));
export type GuestProgressSource = {
  key: object;
  readState: () => UserState;
  acceptState: (snapshot: PersistedProgressSnapshot) => void;
};
type RemoteProgressSnapshot = {
  state: UserState;
  userId: string;
  remote: Partial<UserState>;
  next: Partial<UserState>;
  updatedAtByMode: Partial<Record<GameMode, number>>;
  metadataTimestamp?: number;
};
const retainedModeTimestamp = (previous: PersistedProgressSnapshot, mode: GameMode): number => {
  if (
    mode === 'seasonal' &&
    previous.seasonalSourceSeasonNumber !== undefined &&
    previous.seasonalSourceSeasonNumber !== ACTIVE_SEASON_NUMBER
  ) {
    return 0;
  }
  return previous.modeTimestamps?.[mode] ?? previous.timestamp ?? 0;
};
const nextModeTimestamp = (
  previous: PersistedProgressSnapshot | null,
  state: UserState,
  mode: GameMode,
  timestamp: number
): number => {
  if (!previous || !deepEqual(previous.state[mode], state[mode])) return timestamp;
  return retainedModeTimestamp(previous, mode);
};
const retainedMetadataTimestamp = (previous: PersistedProgressSnapshot): number =>
  previous.metadataTimestamp ?? previous.timestamp ?? 0;
const matchesPersistedSnapshot = (
  current: PersistedProgressSnapshot | null,
  expected: PersistedProgressSnapshot
): boolean =>
  !current ||
  (deepEqual(current.state, expected.state) &&
    retainedMetadataTimestamp(current) === retainedMetadataTimestamp(expected) &&
    GAME_MODE_VALUES.every(
      (mode) => retainedModeTimestamp(current, mode) === retainedModeTimestamp(expected, mode)
    ));
const nextMetadataTimestamp = (
  previous: PersistedProgressSnapshot | null,
  state: UserState,
  timestamp: number
): number => {
  if (!previous || !sameMetadata(previous.state, state)) return timestamp;
  return retainedMetadataTimestamp(previous);
};
const acceptedRemoteTimestamp = (
  matchesRemote: boolean,
  localTimestamp = 0,
  remoteTimestamp = 0
): number => (matchesRemote ? remoteTimestamp : Math.max(localTimestamp, remoteTimestamp + 1));
const acceptRemoteMetadata = (
  accepted: PersistedProgressSnapshot,
  snapshot: RemoteProgressSnapshot
): void => {
  if (snapshot.metadataTimestamp === undefined) return;
  accepted.metadataTimestamp = acceptedRemoteTimestamp(
    sameMetadata(snapshot.next, snapshot.remote),
    accepted.metadataTimestamp,
    snapshot.metadataTimestamp
  );
  const presentKeys = metadataKeys.filter((key) => Object.hasOwn(snapshot.next, key));
  Object.assign(
    accepted.state,
    Object.fromEntries(presentKeys.map((key) => [key, snapshot.next[key]]))
  );
};
const acceptRemoteMode = (
  accepted: PersistedProgressSnapshot,
  snapshot: RemoteProgressSnapshot,
  mode: GameMode
): void => {
  const next = snapshot.next[mode];
  const remote = snapshot.remote[mode];
  if (!next || !remote) return;
  accepted.modeTimestamps![mode] = acceptedRemoteTimestamp(
    deepEqual(next, remote),
    accepted.modeTimestamps![mode],
    snapshot.updatedAtByMode[mode]
  );
  accepted.state[mode] = cloneStateSnapshot(next);
};
const initialGuestProgressSnapshot = (): PersistedProgressSnapshot => ({
  state: cloneStateSnapshot(defaultState),
  storedUserId: null,
  timestamp: 0,
  metadataTimestamp: 0,
  modeTimestamps: { pvp: 0, pve: 0, seasonal: 0 },
  hadDeprecatedProgressData: false,
});
export const createProgressStorageSerializer = (
  readPrevious: (userId: string | null) => PersistedProgressSnapshot | null,
  persistAccepted?: (value: string, expected: PersistedProgressSnapshot | null) => void
) => {
  let previous: PersistedProgressSnapshot | null = null;
  let guestSerialization: {
    value: string;
    state: UserState;
    baseline: PersistedProgressSnapshot | null;
  } | null = null;
  const serialize = (state: UserState, userId: string | null, timestamp: number): string => {
    if (previous?.storedUserId !== userId)
      previous = userId === null ? initialGuestProgressSnapshot() : readPrevious(userId);
    const baseline = previous ? cloneStateSnapshot(previous) : null;
    const editTimestamp = (clock: number) =>
      userId === null ? Math.max(timestamp, clock + 1) : timestamp;
    const modeTimestamps = Object.fromEntries(
      GAME_MODE_VALUES.map((mode) => [
        mode,
        nextModeTimestamp(
          previous,
          state,
          mode,
          editTimestamp(previous ? retainedModeTimestamp(previous, mode) : 0)
        ),
      ])
    );
    const metadataTimestamp = nextMetadataTimestamp(
      previous,
      state,
      editTimestamp(previous ? retainedMetadataTimestamp(previous) : 0)
    );
    previous = {
      metadataTimestamp,
      state: cloneStateSnapshot(state),
      storedUserId: userId,
      timestamp,
      modeTimestamps,
      seasonalSourceSeasonNumber: state.seasonalSeasonNumber ?? ACTIVE_SEASON_NUMBER,
      hadDeprecatedProgressData: false,
    };
    const value = JSON.stringify({
      _timestamp: timestamp,
      _metadataTimestamp: metadataTimestamp,
      _modeTimestamps: modeTimestamps,
      _userId: userId,
      data: state,
    });
    guestSerialization = userId === null ? { value, state, baseline } : null;
    return value;
  };
  return {
    clearGuestSource: () => {
      guestSerialization = null;
    },
    takeGuestSource: (value: string) => {
      const captured = guestSerialization?.value === value ? guestSerialization : null;
      guestSerialization = null;
      return captured;
    },
    retainBaseline: (userId: string, state: UserState) => {
      if (previous?.storedUserId === userId) return;
      previous = {
        ...cloneStateSnapshot({
          ...(readPrevious(userId) ?? {
            state,
            timestamp: 0,
            hadDeprecatedProgressData: false,
          }),
          confirmationCandidates: undefined,
        }),
        storedUserId: userId,
      };
    },
    reset: (snapshot: PersistedProgressSnapshot | null = null) => {
      guestSerialization = null;
      previous = snapshot
        ? cloneStateSnapshot({ ...snapshot, confirmationCandidates: undefined })
        : null;
    },
    serialize,
    acceptRemote: (snapshot: RemoteProgressSnapshot) => {
      // Capture any local edits before replacing the baseline. Pinia persistence
      // can run after a synchronous remote patch, so comparing only in serialize
      // would incorrectly timestamp downloaded progress as a new local edit.
      serialize(snapshot.state, snapshot.userId, Date.now());
      const accepted = previous!;
      const persistedBefore = readPrevious(snapshot.userId);
      const canPersist = matchesPersistedSnapshot(persistedBefore, accepted);
      const expected = persistedBefore ? cloneStateSnapshot(accepted) : null;
      acceptRemoteMetadata(accepted, snapshot);
      GAME_MODE_VALUES.forEach((mode) => acceptRemoteMode(accepted, snapshot, mode));
      // Matching echoes may require no Pinia patch. Persist the accepted clocks
      // now so a reload cannot restore an obsolete client-side edit timestamp.
      // Another tab may have persisted an unsaved edit since our last write.
      // A clock-only acknowledgement must not overwrite that shared envelope.
      if (canPersist) {
        // The pre-lock observation is only an optimization. Recheck this baseline under the lock.
        persistAccepted?.(
          serialize(accepted.state, snapshot.userId, accepted.timestamp ?? 0),
          expected
        );
      }
    },
  };
};
export const cloneStateSnapshot = <T>(value: T): T => {
  const rawValue = value !== null && typeof value === 'object' ? toRaw(value) : value;
  try {
    return structuredClone(rawValue);
  } catch {
    return JSON.parse(JSON.stringify(rawValue)) as T;
  }
};
export const safeGetItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    logger.error(`[TarkovStore] Failed to read localStorage key "${key}":`, error);
    return null;
  }
};
/**
 * True when the browser refuses all access to local storage (for example when site data is
 * blocked). Nothing can then be stored, read, overwritten, or lost, unlike a single failed read.
 */
export const isLocalStorageInaccessible = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    void window.localStorage.length;
    return false;
  } catch {
    return true;
  }
};
type StorageWriteResult = { ok: true } | { ok: false; error: unknown; canceled?: true };
let activeProgressWritesBlocked = false;
const ACTIVE_PROGRESS_LOCK = `${STORAGE_KEYS.progress}:mutation`;
let activeProgressGeneration = 0;
const ownerGenerations = new Map<string, number>();
const ownerGenerationFor = (owner?: string | null): number =>
  owner ? (ownerGenerations.get(owner) ?? 0) : 0;
let localWriteRevision = 0;
let progressValueRevision = 0;
let pendingValueRevision: number | null = null;
let pendingEditRevision: number | null = null;
const pendingProgressWrites = new Map<number, ProgressWriteRequest>();
const sameProgressWriteState = (left: string, right: string): boolean => {
  const a = parseUserScopedStorage<unknown>(left);
  const b = parseUserScopedStorage<unknown>(right);
  if (!a || !b) return false;
  return a._userId === b._userId && deepEqual(a.data, b.data);
};
const pendingProgressWriteAt = (revision: number | null) =>
  pendingProgressWrites.get(revision ?? -1);
const latestPendingProgressWrite = () => {
  const edit = pendingProgressWriteAt(pendingEditRevision);
  const latest = pendingProgressWriteAt(pendingValueRevision);
  if (!edit) return latest;
  if (!latest) return edit;
  return sameProgressWriteState(edit.value, latest.value) ? latest : edit;
};
const readActiveProgressValue = (): string | null =>
  latestPendingProgressWrite()?.value ?? safeGetItem(STORAGE_KEYS.progress);
/** Preserve the ordered baseline chain before an auth handoff invalidates its old session. */
export const getPendingProgressWritesForOwners = (owners: (string | null)[]) => {
  return [...pendingProgressWrites.values()].filter(
    ({ value, handoff }) =>
      handoff || owners.includes(parseUserScopedStorage<unknown>(value)?._userId ?? null)
  );
};
const discardPendingProgressWrite = (revision: number): void => {
  const request = pendingProgressWrites.get(revision);
  if (request) request.source = undefined;
  pendingProgressWrites.delete(revision);
};
const discardPendingProgressWrites = (owner?: string): void => {
  if (!owner) {
    for (const request of pendingProgressWrites.values()) request.source = undefined;
    pendingProgressWrites.clear();
    return;
  }
  for (const [revision, { value }] of pendingProgressWrites)
    if (parseUserScopedStorage<unknown>(value)?._userId === owner)
      discardPendingProgressWrite(revision);
};
const activeProgressOperations = new Set<Promise<StorageWriteResult>>();
/** Cancel queued writes before changing the session or intentionally clearing its progress. */
export const invalidateActiveProgressWrites = (owner?: string, cloudHeld = false): void => {
  const pending = latestPendingProgressWrite();
  progressStorageSerializer.clearGuestSource();
  discardPendingProgressWrites(owner);
  if (owner) {
    ownerGenerations.set(owner, ownerGenerationFor(owner) + 1);
    if (parseUserScopedStorage<unknown>(pending?.value ?? '')?._userId !== owner) return;
  } else {
    activeProgressGeneration += 1;
  }
  if (pending && progressSaveStatus.local === 'pending')
    recordLocalSave(false, null, cloudHeld || pending.cloudHeld);
  localWriteRevision += 1;
  pendingValueRevision = null;
  pendingEditRevision = null;
};
/** A synchronous plugin cannot await storage; lifecycle callers can wait for its queue to drain. */
export const flushActiveProgressWrites = async (): Promise<void> => {
  while (activeProgressOperations.size) await Promise.all(activeProgressOperations);
};
const mutateActiveProgress = (
  mutate: () => StorageWriteResult,
  owner?: string | null
): Promise<StorageWriteResult> => {
  const generation = activeProgressGeneration;
  const ownerGeneration = ownerGenerationFor(owner);
  const sessionOwner = getCurrentSupabaseUserId();
  const operation = (async (): Promise<StorageWriteResult> => {
    try {
      if (typeof window === 'undefined' || !navigator.locks) {
        throw new DOMException('Cross-tab progress locking is unavailable', 'InvalidStateError');
      }
      return await navigator.locks.request(ACTIVE_PROGRESS_LOCK, { mode: 'exclusive' }, () => {
        if (
          generation !== activeProgressGeneration ||
          sessionOwner !== getCurrentSupabaseUserId() ||
          ownerGeneration !== ownerGenerationFor(owner)
        ) {
          return {
            ok: false,
            error: new Error('Progress operation belongs to an expired session'),
            canceled: true,
          };
        }
        return mutate();
      });
    } catch (error) {
      logger.error('[TarkovStore] Active progress mutation failed:', error);
      return { ok: false, error };
    }
  })();
  activeProgressOperations.add(operation);
  void operation.then(() => activeProgressOperations.delete(operation));
  return operation;
};
type ActiveProgressRetentionGuard = (
  current: string | null,
  next: string | null,
  cloudHeld?: boolean
) => boolean;
let activeProgressRetentionGuard: ActiveProgressRetentionGuard = (current) => !current;
export const setActiveProgressWritesBlocked = (blocked: boolean): void => {
  if (blocked) invalidateActiveProgressWrites();
  activeProgressWritesBlocked = blocked;
};
export const setActiveProgressRetentionGuard = (guard: ActiveProgressRetentionGuard): void => {
  activeProgressRetentionGuard = guard;
};
const writeStorageItem = (key: string, value: string, cloudHeld = false): StorageWriteResult => {
  if (typeof window === 'undefined') return { ok: false, error: null };
  try {
    if (key === STORAGE_KEYS.progress) {
      if (
        activeProgressWritesBlocked ||
        !activeProgressRetentionGuard(localStorage.getItem(key), value, cloudHeld)
      ) {
        return {
          ok: false,
          error: new Error('Progress retention must succeed before active progress can change'),
        };
      }
    }
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    logger.error(`[TarkovStore] Failed to write localStorage key "${key}":`, error);
    return { ok: false, error };
  }
};
/** Synchronous helpers may only mutate keys outside the serialized active slot. */
export const safeSetItem = (key: string, value: string): boolean =>
  key !== STORAGE_KEYS.progress && writeStorageItem(key, value).ok;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const hasEnvelopeMetadata = (data: Record<string, unknown>): boolean =>
  ['_userId', '_timestamp', '_metadataTimestamp', '_modeTimestamps'].some((key) => key in data);
const hasLegacyProgressFields = (data: Record<string, unknown>): boolean =>
  Object.keys(defaultState).some((key) => key in data) ||
  Object.keys(defaultState.pvp).some((key) => key in data);
const parsesProgressForOwner = (raw: string, userId: string | null): boolean => {
  try {
    return parsePersistedProgressState(raw, userId) !== null;
  } catch {
    return false;
  }
};
const isLegacyProgressStorageValue = (raw: string): boolean => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) && !hasEnvelopeMetadata(parsed) && hasLegacyProgressFields(parsed);
  } catch {
    return false;
  }
};
const hasInvalidScopedOwnerId = (raw: string): boolean => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return (
      isRecord(parsed) &&
      'data' in parsed &&
      (!Object.hasOwn(parsed, '_userId') ||
        (parsed._userId !== null &&
          (typeof parsed._userId !== 'string' || parsed._userId.length === 0)))
    );
  } catch {
    return false;
  }
};
export const isUnparseableProgressStorageValue = (raw: string): boolean => {
  if (hasInvalidScopedOwnerId(raw)) return true;
  const wrapped = parseUserScopedStorage<unknown>(raw);
  if (wrapped) {
    if (!isRecord(wrapped.data) || !hasLegacyProgressFields(wrapped.data)) {
      return true;
    }
    return !parsesProgressForOwner(raw, wrapped._userId);
  }
  return !isLegacyProgressStorageValue(raw) || !parsesProgressForOwner(raw, null);
};
const findOpaqueProgressQuarantine = (raw: string): string | null => {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (
      key?.startsWith(STORAGE_KEYS.progressQuarantinePrefix) &&
      localStorage.getItem(key) === raw
    ) {
      return key;
    }
  }
  return null;
};
const writeOpaqueProgressQuarantine = (raw: string): string | null => {
  const token =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const key = `${STORAGE_KEYS.progressQuarantinePrefix}${token}_${attempt}`;
    const existing = localStorage.getItem(key);
    if (existing === raw) return key;
    if (existing !== null) continue;
    localStorage.setItem(key, raw);
    return localStorage.getItem(key) === raw ? key : null;
  }
  return null;
};
/** Returns the quarantine key holding `raw`, or `null` when it could not be preserved. */
const quarantineUnparseableActiveProgress = (raw: string): string | null => {
  if (typeof window === 'undefined' || !raw) return null;
  try {
    if (localStorage.getItem(STORAGE_KEYS.progress) !== raw) return null;
    if (!isUnparseableProgressStorageValue(raw)) return null;
    return findOpaqueProgressQuarantine(raw) ?? writeOpaqueProgressQuarantine(raw);
  } catch (error) {
    logger.error('[TarkovStore] Could not quarantine unparseable active progress:', error);
  }
  return null;
};
/**
 * Retains unparseable active bytes in a fresh ownerless slot. Quarantined values are never
 * interpreted as progress and are not overwritten, exported, or pruned as backups.
 */
export const preserveUnparseableActiveProgress = (raw: string): boolean =>
  quarantineUnparseableActiveProgress(raw) !== null;
/**
 * Explicit device cleanup may release malformed active bytes only after exact quarantine and
 * after `confirmRelease` durably records that quarantine. Returns whether the slot was released.
 */
export const quarantineAndRemoveUnparseableActiveProgress = async (
  raw: string,
  confirmRelease: (quarantineKey: string) => boolean
): Promise<boolean> => {
  const result = await mutateActiveProgress(() => {
    const quarantineKey = quarantineUnparseableActiveProgress(raw);
    if (!quarantineKey || !confirmRelease(quarantineKey)) return { ok: false, error: null };
    if (localStorage.getItem(STORAGE_KEYS.progress) !== raw) return { ok: false, error: null };
    localStorage.removeItem(STORAGE_KEYS.progress);
    return localStorage.getItem(STORAGE_KEYS.progress) === null
      ? { ok: true }
      : { ok: false, error: null };
  });
  return result.ok;
};
const parseHandoffBaseline = (raw: string | null): PersistedProgressSnapshot | null => {
  try {
    return parsePersistedProgressState(
      raw,
      parseUserScopedStorage<unknown>(raw ?? '')?._userId ?? null
    );
  } catch {
    return null;
  }
};
type ProgressWriteRequest = {
  value: string;
  cloudHeld: boolean;
  expected?: PersistedProgressSnapshot | null;
  handoffBaseline?: PersistedProgressSnapshot | null;
  baseline: PersistedProgressSnapshot | null;
  guestBaseline: PersistedProgressSnapshot | null;
  guestMemoryBaseline: PersistedProgressSnapshot | null;
  source?: GuestProgressSource;
  failedGuest?: { error: unknown };
  guestReconciled?: boolean;
  handoff: boolean;
};
const queueProgressWrite = (request: ProgressWriteRequest): number => {
  const valueRevision = ++progressValueRevision;
  pendingProgressWrites.set(valueRevision, request);
  pendingValueRevision = valueRevision;
  if (request.expected === undefined) pendingEditRevision = valueRevision;
  return valueRevision;
};
const finishPendingProgressWrite = (valueRevision: number): void => {
  discardPendingProgressWrite(valueRevision);
  if (pendingValueRevision === valueRevision) pendingValueRevision = null;
  if (pendingEditRevision === valueRevision) pendingEditRevision = null;
};
const encodeProgressSnapshot = (snapshot: PersistedProgressSnapshot): string =>
  JSON.stringify({
    _userId: snapshot.storedUserId,
    _timestamp: snapshot.timestamp,
    _metadataTimestamp: snapshot.metadataTimestamp,
    _modeTimestamps: snapshot.modeTimestamps,
    data: snapshot.state,
  });
const reconciledModeTimestamp = (
  incoming: PersistedProgressSnapshot,
  current: PersistedProgressSnapshot,
  mode: GameMode
): number => {
  const incomingEpoch = toProgressEpoch(incoming.state[mode]);
  const currentEpoch = toProgressEpoch(current.state[mode]);
  if (incomingEpoch > currentEpoch) return retainedModeTimestamp(incoming, mode);
  if (currentEpoch > incomingEpoch) return retainedModeTimestamp(current, mode);
  return Math.max(retainedModeTimestamp(incoming, mode), retainedModeTimestamp(current, mode));
};
/** Equal epochs merge edits; a reset epoch selects the entire winning mode, including its clock. */
const reconcileGuestSnapshots = (
  incoming: PersistedProgressSnapshot,
  current: PersistedProgressSnapshot | null
): PersistedProgressSnapshot => {
  if (!current) return incoming;
  return {
    ...incoming,
    timestamp: Math.max(incoming.timestamp ?? 0, current.timestamp ?? 0),
    metadataTimestamp: Math.max(
      retainedMetadataTimestamp(incoming),
      retainedMetadataTimestamp(current)
    ),
    modeTimestamps: Object.fromEntries(
      GAME_MODE_VALUES.map((mode) => [mode, reconciledModeTimestamp(incoming, current, mode)])
    ),
    state: resolveInitialSyncState(
      incoming.state,
      current.state,
      retainedMetadataTimestamp(incoming),
      retainedMetadataTimestamp(current),
      0,
      0,
      {
        mergeModeSnapshots: true,
        localModeTimestamps: Object.fromEntries(
          GAME_MODE_VALUES.map((mode) => [mode, retainedModeTimestamp(incoming, mode)])
        ),
        modeUpdatedAt: Object.fromEntries(
          GAME_MODE_VALUES.map((mode) => [mode, retainedModeTimestamp(current, mode)])
        ),
      }
    ),
  };
};
const rebaseGuestField = (
  next: Record<string, unknown>,
  key: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): void => {
  if (!Object.hasOwn(after, key)) {
    Reflect.deleteProperty(next, key);
    return;
  }
  const value = rebaseGuestValue(next[key], before[key], after[key]);
  if (value === undefined) Reflect.deleteProperty(next, key);
  else next[key] = value;
};
/** Transfer only changes made after capture; unchanged old-epoch fields stay discarded. */
const rebaseGuestRecord = (
  accepted: unknown,
  before: Record<string, unknown>,
  after: Record<string, unknown>
) => {
  const next = { ...(isRecord(accepted) ? accepted : {}) };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
    rebaseGuestField(next, key, before, after);
  return next;
};
const historyById = (rows: unknown[]) =>
  Object.fromEntries(rows.filter(isRecord).map((row) => [String(row.id), row]));
const hasHistoryIds = (rows: unknown[]): boolean =>
  rows.every((row) => isRecord(row) && typeof row.id === 'string');
const rebaseGuestHistory = (accepted: unknown, before: unknown[], after: unknown[]) => {
  const current = Array.isArray(accepted) ? accepted : [];
  if (![current, before, after].every(hasHistoryIds)) return cloneStateSnapshot(after);
  return Object.values(
    rebaseGuestRecord(historyById(current), historyById(before), historyById(after))
  );
};
const rebaseGuestValue = (accepted: unknown, before: unknown, after: unknown): unknown => {
  if (deepEqual(before, after)) return accepted;
  const pair = [before, after];
  if (pair.every(isRecord)) return rebaseGuestRecord(accepted, pair[0]!, pair[1]!);
  if (pair.every(Array.isArray)) return rebaseGuestHistory(accepted, pair[0]!, pair[1]!);
  return cloneStateSnapshot(after);
};
const rebaseGuestMode = (
  accepted: UserState[GameMode],
  before: UserState[GameMode],
  after: UserState[GameMode],
  live: boolean
): UserState[GameMode] => {
  if (!live && toProgressEpoch(after) < toProgressEpoch(accepted))
    return cloneStateSnapshot(accepted);
  if (toProgressEpoch(after) > Math.max(toProgressEpoch(before), toProgressEpoch(accepted)))
    return cloneStateSnapshot(after);
  const next = cloneStateSnapshot(rebaseGuestValue(accepted, before, after)) as UserState[GameMode];
  next.progressEpoch = Math.max(toProgressEpoch(accepted), toProgressEpoch(after));
  rebaseGuestManualHistory(next, accepted, before, after, live);
  return next;
};
const manualHistoryEpoch = (mode: UserState[GameMode]): number => mode.manualActivityEpoch ?? 0;
const guestManualHistorySource = (
  accepted: UserState[GameMode],
  before: UserState[GameMode],
  after: UserState[GameMode],
  live: boolean
): UserState[GameMode] | null => {
  if (!live && manualHistoryEpoch(after) < manualHistoryEpoch(accepted)) return accepted;
  return manualHistoryEpoch(after) >
    Math.max(manualHistoryEpoch(before), manualHistoryEpoch(accepted))
    ? after
    : null;
};
const rebaseGuestManualHistory = (
  next: UserState[GameMode],
  accepted: UserState[GameMode],
  before: UserState[GameMode],
  after: UserState[GameMode],
  live: boolean
): void => {
  next.manualActivityEpoch = Math.max(manualHistoryEpoch(after), manualHistoryEpoch(accepted));
  const source = guestManualHistorySource(accepted, before, after, live);
  if (source) next.manualActivityHistory = cloneStateSnapshot(source.manualActivityHistory);
};
const rebasedEditClock = (same: boolean, accepted: number, incoming: number): number =>
  same ? accepted : Math.max(Date.now(), accepted + 1, incoming);
const rebaseGuestSnapshot = (
  accepted: PersistedProgressSnapshot,
  before: PersistedProgressSnapshot,
  after: PersistedProgressSnapshot,
  live = false
): PersistedProgressSnapshot => {
  const state = {
    ...(rebaseGuestRecord(
      accepted.state,
      before.state as unknown as Record<string, unknown>,
      after.state as unknown as Record<string, unknown>
    ) as unknown as UserState),
    ...Object.fromEntries(
      GAME_MODE_VALUES.map((mode) => [
        mode,
        rebaseGuestMode(accepted.state[mode], before.state[mode], after.state[mode], live),
      ])
    ),
  };
  return {
    ...after,
    state,
    metadataTimestamp: rebasedEditClock(
      sameMetadata(accepted.state, state),
      retainedMetadataTimestamp(accepted),
      retainedMetadataTimestamp(after)
    ),
    modeTimestamps: Object.fromEntries(
      GAME_MODE_VALUES.map((mode) => [
        mode,
        rebasedEditClock(
          deepEqual(accepted.state[mode], state[mode]),
          retainedModeTimestamp(accepted, mode),
          retainedModeTimestamp(after, mode)
        ),
      ])
    ),
  };
};
const laterGuestWrites = (request: ProgressWriteRequest): ProgressWriteRequest[] => {
  const writes = [...pendingProgressWrites.values()];
  const index = writes.indexOf(request);
  if (index < 0) return [];
  return writes.slice(index + 1).filter((pending) => pending.source?.key === request.source?.key);
};
const rebaseQueuedGuestWrites = (
  request: ProgressWriteRequest,
  accepted: PersistedProgressSnapshot
) => {
  let previous = accepted;
  let captured = parsePersistedProgressState(request.value, null)!;
  for (const pending of laterGuestWrites(request)) {
    const incoming = parsePersistedProgressState(pending.value, null);
    if (!incoming || !pending.guestBaseline) continue;
    const next = rebaseGuestSnapshot(previous, pending.guestBaseline, incoming);
    captured = incoming;
    pending.baseline = cloneStateSnapshot(previous);
    pending.guestBaseline = cloneStateSnapshot(previous);
    pending.value = encodeProgressSnapshot(next);
    previous = next;
  }
  return { previous, captured };
};
const adoptGuestWrite = (
  request: ProgressWriteRequest,
  accepted: PersistedProgressSnapshot
): void => {
  const source = request.source;
  if (!source) return;
  const { previous, captured } = rebaseQueuedGuestWrites(request, accepted);
  const serializer = createProgressStorageSerializer(() => captured);
  serializer.reset(captured);
  const live = parsePersistedProgressState(
    serializer.serialize(cloneStateSnapshot(source.readState()), null, Date.now()),
    null
  )!;
  const next = rebaseGuestSnapshot(previous, captured, live, true);
  progressStorageSerializer.reset(next);
  source.acceptState(next);
  // Only an unqueued post-capture edit needs another write; downloaded state never does.
  if (!deepEqual(next.state, previous.state)) {
    progressStorageSerializer.reset(previous);
    const value = progressStorageSerializer.serialize(next.state, null, Date.now());
    void persistActiveProgressValue(value, false, undefined, undefined, source);
  }
};
const hasSameEpochCapturedGuestMode = (
  incoming: PersistedProgressSnapshot,
  current: PersistedProgressSnapshot,
  mode: GameMode
): boolean => toProgressEpoch(incoming.state[mode]) === toProgressEpoch(current.state[mode]);
const applyCapturedGuestModes = (
  before: PersistedProgressSnapshot,
  incoming: PersistedProgressSnapshot,
  current: PersistedProgressSnapshot,
  accepted: PersistedProgressSnapshot
) => {
  const state = cloneStateSnapshot(accepted.state);
  const modeTimestamps = { ...accepted.modeTimestamps };
  for (const mode of GAME_MODE_VALUES) {
    if (!hasSameEpochCapturedGuestMode(incoming, current, mode)) continue;
    state[mode] = rebaseGuestMode(
      current.state[mode],
      before.state[mode],
      incoming.state[mode],
      false
    );
    modeTimestamps[mode] = deepEqual(state[mode], current.state[mode])
      ? retainedModeTimestamp(current, mode)
      : Math.max(retainedModeTimestamp(current, mode) + 1, retainedModeTimestamp(incoming, mode));
  }
  return { state, modeTimestamps };
};
/** Captured intent changes only its edited fields; unchanged concurrent fields stay durable. */
const applyCapturedGuestIntent = (
  before: PersistedProgressSnapshot | null,
  incoming: PersistedProgressSnapshot,
  current: PersistedProgressSnapshot | null,
  accepted: PersistedProgressSnapshot
): PersistedProgressSnapshot => {
  if (!current || !before) return accepted;
  const modes = applyCapturedGuestModes(before, incoming, current, accepted);
  const state = {
    ...modes.state,
    ...Object.fromEntries(
      metadataKeys.map((key) => [
        key,
        rebaseGuestValue(current.state[key], before.state[key], incoming.state[key]),
      ])
    ),
  };
  const metadataTimestamp = sameMetadata(current.state, state)
    ? retainedMetadataTimestamp(current)
    : Math.max(retainedMetadataTimestamp(current) + 1, retainedMetadataTimestamp(incoming));
  return { ...accepted, ...modes, state, metadataTimestamp };
};
const reconcileCapturedGuestSnapshot = (
  incoming: PersistedProgressSnapshot,
  before: PersistedProgressSnapshot | null,
  current: PersistedProgressSnapshot | null
): PersistedProgressSnapshot =>
  applyCapturedGuestIntent(before, incoming, current, reconcileGuestSnapshots(incoming, current));
const failedGuestWritesBefore = (request: ProgressWriteRequest): ProgressWriteRequest[] => {
  const writes = [...pendingProgressWrites.values()];
  return writes
    .slice(0, writes.indexOf(request))
    .filter((pending) => pending.failedGuest && pending.source?.key === request.source?.key);
};
const reconcileGuestWrite = (
  request: ProgressWriteRequest,
  current: PersistedProgressSnapshot | null
): PersistedProgressSnapshot => {
  let accepted = current;
  for (const pending of [...failedGuestWritesBefore(request), request]) {
    accepted = reconcileCapturedGuestSnapshot(
      parsePersistedProgressState(pending.value, null)!,
      pending.guestBaseline,
      accepted
    );
  }
  return accepted!;
};
/** Fold retry intent against the observed bytes, never acknowledge it as a committed baseline. */
const foldGuestWriteRequest = (
  request: ProgressWriteRequest,
  current: PersistedProgressSnapshot | null,
  accepted: PersistedProgressSnapshot
): void => {
  request.guestBaseline = current ? cloneStateSnapshot(current) : null;
  request.value = encodeProgressSnapshot(accepted);
  request.guestReconciled = true;
};
const discardFailedGuestWritesBefore = (request: ProgressWriteRequest): void => {
  const obsolete = new Set(failedGuestWritesBefore(request));
  for (const [revision, pending] of pendingProgressWrites) {
    if (obsolete.has(pending)) finishPendingProgressWrite(revision);
  }
};
const retainGuestMemoryBaseline = (request: ProgressWriteRequest): void => {
  const earliest = failedGuestWritesBefore(request)[0];
  if (earliest) request.guestMemoryBaseline = earliest.guestMemoryBaseline;
};
const retainFailedGuestWrite = (request: ProgressWriteRequest, error: unknown): void => {
  retainGuestMemoryBaseline(request);
  if (!request.guestReconciled) {
    const current = failedGuestWritesBefore(request)[0]?.guestBaseline ?? request.guestBaseline;
    foldGuestWriteRequest(request, current, reconcileGuestWrite(request, current));
  }
  discardFailedGuestWritesBefore(request);
  request.failedGuest = { error };
};
const applyGuestProgressWrite = (request: ProgressWriteRequest): StorageWriteResult => {
  const incoming = parsePersistedProgressState(request.value, null)!;
  const current = parsePersistedProgressState(localStorage.getItem(STORAGE_KEYS.progress), null);
  const accepted = reconcileGuestWrite(request, current);
  const result = writeStorageItem(
    STORAGE_KEYS.progress,
    matchesPersistedSnapshot(accepted, incoming) ? request.value : encodeProgressSnapshot(accepted),
    request.cloudHeld
  );
  if (result.ok) {
    adoptGuestWrite(request, accepted);
    discardFailedGuestWritesBefore(request);
  } else {
    foldGuestWriteRequest(request, current, accepted);
    // The next lock holder must see failed intent before this holder releases the lock.
    if (request.source) retainFailedGuestWrite(request, result.error);
  }
  return result;
};
const captureGuestProgress = (readState: () => UserState) => {
  const value = progressStorageSerializer.serialize(
    cloneStateSnapshot(readState()),
    null,
    Date.now()
  );
  const baseline = progressStorageSerializer.takeGuestSource(value)?.baseline ?? null;
  progressStorageSerializer.reset(baseline);
  return { value, guestBaseline: baseline };
};
const reconcileGuestResetIntent = (
  requests: Pick<ProgressWriteRequest, 'value' | 'guestBaseline'>[],
  current: PersistedProgressSnapshot | null
): PersistedProgressSnapshot => {
  let accepted = current;
  for (const request of requests)
    accepted = reconcileCapturedGuestSnapshot(
      parsePersistedProgressState(request.value, null)!,
      request.guestBaseline,
      accepted
    );
  return accepted!;
};
const assertGuestResetSession = (): void => {
  if (getCurrentSupabaseUserId() !== null)
    throw new Error('Guest reset belongs to an expired session');
};
const readGuestProgressForReset = (): PersistedProgressSnapshot | null => {
  assertGuestResetSession();
  // Read durable bytes, never this tab's pending overlay. Failed reads must abort the reset.
  const raw = localStorage.getItem(STORAGE_KEYS.progress);
  if (raw === null) return null;
  const current = parsePersistedProgressState(raw, null);
  if (isUnparseableProgressStorageValue(raw) || !current)
    throw new Error('Guest reset cannot replace foreign or unreadable progress');
  return current;
};
const resetGuestModes = (
  snapshot: PersistedProgressSnapshot,
  resetModes: readonly GameMode[],
  timestamp: number
): void => {
  for (const mode of resetModes) {
    snapshot.state[mode] = {
      ...cloneStateSnapshot(defaultState[mode]),
      progressEpoch: getNextProgressEpoch(snapshot.state[mode]),
    };
    snapshot.modeTimestamps = { ...snapshot.modeTimestamps, [mode]: timestamp };
  }
};
const buildGuestResetSnapshot = (
  snapshot: PersistedProgressSnapshot,
  resetModes: readonly GameMode[],
  resetAll: boolean
): PersistedProgressSnapshot => {
  const now = Date.now();
  resetGuestModes(snapshot, resetModes, now);
  if (resetAll) {
    for (const key of metadataKeys) Object.assign(snapshot.state, { [key]: defaultState[key] });
    snapshot.metadataTimestamp = now;
  }
  snapshot.timestamp = now;
  return snapshot;
};
const recordGuestResetResult = (revision: number, result: StorageWriteResult): void => {
  if (revision !== localWriteRevision || getCurrentSupabaseUserId() !== null) return;
  recordLocalSave(result.ok, result.ok ? null : classifyLocalSaveFailure(result.error));
};
/** Guest resets replace one envelope under the same lock as ordinary guest writes. */
export const resetGuestProgress = async (
  resetModes: readonly GameMode[],
  resetAll: boolean,
  readState: () => UserState,
  acceptState: (snapshot: PersistedProgressSnapshot) => void
): Promise<PersistedProgressSnapshot> => {
  const captured = captureGuestProgress(readState);
  const intent = [...pendingProgressWrites.values()].filter(isOrdinaryGuestWrite);
  const baseline = intent[0]?.guestMemoryBaseline ?? captured.guestBaseline;
  invalidateActiveProgressWrites();
  const revision = localWriteRevision;
  let accepted: PersistedProgressSnapshot | null = null;
  recordLocalSavePending();
  const result = await mutateActiveProgress(() => {
    const current = readGuestProgressForReset();
    const latest = captureGuestProgress(readState);
    latest.guestBaseline = parsePersistedProgressState(captured.value, null);
    const next = buildGuestResetSnapshot(
      reconcileGuestResetIntent([...intent, captured, latest], current),
      resetModes,
      resetAll
    );
    const written = writeStorageItem(STORAGE_KEYS.progress, encodeProgressSnapshot(next));
    if (written.ok) {
      accepted = next;
      // Adopt inside the lock: no newer writer or auth continuation can intervene after commit.
      acceptState(next);
    }
    return written;
  }, null);
  recordGuestResetResult(revision, result);
  if (!result.ok) {
    if (!result.canceled) progressStorageSerializer.reset(baseline);
    throw new Error('Local guest progress could not be saved after reset');
  }
  safeRemoveItem(LEGACY_STORAGE_KEYS.progress);
  return accepted!;
};
const isOrdinaryGuestWrite = (request: ProgressWriteRequest): boolean =>
  request.expected === undefined &&
  request.handoffBaseline === undefined &&
  parseUserScopedStorage<unknown>(request.value)?._userId === null;
const applyProgressWrite = (request: ProgressWriteRequest): StorageWriteResult => {
  const required = request.expected === undefined ? request.handoffBaseline : request.expected;
  if (
    required !== undefined &&
    !matchesExpectedProgress(localStorage.getItem(STORAGE_KEYS.progress), required)
  )
    return { ok: false, error: null, canceled: true };
  if (isOrdinaryGuestWrite(request)) return applyGuestProgressWrite(request);
  return writeStorageItem(STORAGE_KEYS.progress, request.value, request.cloudHeld);
};
const shouldReportProgressWriteFailure = (
  request: ProgressWriteRequest,
  result: Extract<StorageWriteResult, { ok: false }>
): boolean => !result.canceled || request.expected === undefined;
const recordProgressWriteResult = (
  request: ProgressWriteRequest,
  result: StorageWriteResult
): void => {
  if (result.ok) {
    // An ACK changes clocks, never the save result of a genuine edit.
    if (request.expected === undefined) recordGuestSaveAcknowledgement();
  } else if (shouldReportProgressWriteFailure(request, result)) {
    recordLocalSave(false, classifyLocalSaveFailure(result.error), request.cloudHeld);
  }
};
const recordGuestSaveAcknowledgement = (): void => {
  const failed = [...pendingProgressWrites.values()].find((pending) => pending.failedGuest);
  if (failed) recordLocalSave(false, classifyLocalSaveFailure(failed.failedGuest!.error));
  else recordLocalSave(true);
};
const isRetainableGuestWriteFailure = (
  request: ProgressWriteRequest,
  result: StorageWriteResult
): result is Extract<StorageWriteResult, { ok: false }> =>
  !result.ok && !result.canceled && Boolean(request.source) && isOrdinaryGuestWrite(request);
const finishProgressWriteResult = (
  request: ProgressWriteRequest,
  valueRevision: number,
  result: StorageWriteResult
): void => {
  if (isRetainableGuestWriteFailure(request, result)) retainFailedGuestWrite(request, result.error);
  else finishPendingProgressWrite(valueRevision);
};
/** Writes active envelopes and transfers their captured baselines across auth changes. */
export const persistActiveProgressValue = async (
  value: ProgressWriteRequest['value'],
  cloudHeld = false,
  expected?: PersistedProgressSnapshot | null,
  handoffBaseline?: PersistedProgressSnapshot | null,
  guestSource?: GuestProgressSource
): Promise<boolean> => {
  const revision = expected === undefined ? ++localWriteRevision : localWriteRevision;
  const captured = progressStorageSerializer.takeGuestSource(value);
  const request: ProgressWriteRequest = {
    value,
    cloudHeld,
    expected,
    handoffBaseline,
    baseline:
      handoffBaseline === undefined
        ? parseHandoffBaseline(readActiveProgressValue())
        : handoffBaseline,
    guestBaseline: captured?.baseline ?? null,
    guestMemoryBaseline: captured?.baseline ?? null,
    handoff: handoffBaseline !== undefined,
    source: captured
      ? (guestSource ?? {
          key: captured.state,
          readState: () => captured.state,
          acceptState: (snapshot) => Object.assign(captured.state, snapshot.state),
        })
      : undefined,
  };
  if (!isOrdinaryGuestWrite(request)) request.source = undefined;
  const valueRevision = queueProgressWrite(request);
  if (expected === undefined) recordLocalSavePending(cloudHeld);
  const result = await mutateActiveProgress(
    () => applyProgressWrite(request),
    parseUserScopedStorage<unknown>(value)?._userId
  );
  finishProgressWriteResult(request, valueRevision, result);
  if (localWriteRevision === revision) recordProgressWriteResult(request, result);
  return result.ok;
};
const matchesExpectedProgress = (
  raw: string | null,
  expected: PersistedProgressSnapshot | null
): boolean => {
  if (expected === null) return raw === null;
  const current = parsePersistedProgressState(raw, expected.storedUserId);
  return current !== null && matchesPersistedSnapshot(current, expected);
};
/**
 * Storage adapter for the progress persist plugin. The plugin swallows storage
 * exceptions, so writes go through `persistActiveProgressValue` to surface them.
 */
export const progressPersistStorage = {
  getItem: (key: string): string | null =>
    key === STORAGE_KEYS.progress ? readActiveProgressValue() : safeGetItem(key),
  setItem: (key: string, value: string, guestSource?: GuestProgressSource): void => {
    if (key === STORAGE_KEYS.progress)
      void persistActiveProgressValue(value, false, undefined, undefined, guestSource);
    else safeSetItem(key, value);
  },
};
const matchesExpectedValue = (current: string | null, expected?: string): boolean =>
  expected === undefined || current === expected;
const isExplicitOwnerRemoval = (current: string | null, owner?: string): boolean =>
  Boolean(owner && current && parseUserScopedStorage<unknown>(current)?._userId === owner);
const canRemoveActiveProgress = (
  current: string | null,
  owner?: string,
  expected?: string
): boolean => {
  if (!matchesExpectedValue(current, expected)) return false;
  return (
    isExplicitOwnerRemoval(current, owner) ||
    (!activeProgressWritesBlocked && activeProgressRetentionGuard(current, null))
  );
};
const removeStorageItem = (
  key: string,
  explicitOwnerRemoval?: string,
  expectedValue?: string,
  storage?: Storage
): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    // Blocked site data throws on access to `localStorage` itself, so resolve it here.
    const target = storage ?? localStorage;
    if (
      key === STORAGE_KEYS.progress &&
      !canRemoveActiveProgress(target.getItem(key), explicitOwnerRemoval, expectedValue)
    )
      return false;
    target.removeItem(key);
    return target.getItem(key) === null;
  } catch (error) {
    logger.error(`[TarkovStore] Failed to remove localStorage key "${key}":`, error);
    return false;
  }
};
export const safeRemoveItem = (key: string): boolean =>
  key !== STORAGE_KEYS.progress && removeStorageItem(key);
/** Ownership and optional exact-byte checks are performed only after acquiring the shared lock. */
export const removeActiveProgressValue = async (
  explicitOwnerRemoval?: string,
  expectedValue?: string,
  storage?: Storage
): Promise<boolean> => {
  const result = await mutateActiveProgress(() =>
    removeStorageItem(STORAGE_KEYS.progress, explicitOwnerRemoval, expectedValue, storage)
      ? { ok: true }
      : { ok: false, error: null }
  );
  return result.ok;
};
/** An empty slot leaves nothing for a reload to restore, even where a write barrier refuses removal. */
const clearActiveSlot = (explicitOwner?: string): boolean =>
  localStorage.getItem(STORAGE_KEYS.progress) === null ||
  removeStorageItem(STORAGE_KEYS.progress, explicitOwner);
const reportActiveClearFailure = (
  result: StorageWriteResult,
  revision: number,
  cloudHeld: boolean
): void => {
  if (!result.ok && result.canceled) return;
  if (localWriteRevision === revision) recordLocalSave(false, 'unknown', cloudHeld);
};
/**
 * `resetOwner` marks a deliberate reset of that owner's own progress: its retention was already
 * decided before the reset, so the active copy is removed without keeping a recovery copy.
 * Write barriers still apply. Resolves `false` when an active copy may remain for a reload to
 * restore; fully blocked storage holds none.
 */
export const clearActiveProgressStorage = async (
  resetOwner?: string | null,
  cloudHeld = false
): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  invalidateActiveProgressWrites(undefined, cloudHeld);
  const revision = localWriteRevision;
  const result = await mutateActiveProgress(() => {
    const explicitOwner = resetOwner && !activeProgressWritesBlocked ? resetOwner : undefined;
    return clearActiveSlot(explicitOwner) ? { ok: true } : { ok: false, error: null };
  });
  const cleared =
    (result.ok && safeRemoveItem(LEGACY_STORAGE_KEYS.progress)) || isLocalStorageInaccessible();
  if (!cleared) reportActiveClearFailure(result, revision, cloudHeld);
  return cleared;
};
const hasCompleteModes = (data: Record<string, unknown>): boolean => 'pvp' in data && 'pve' in data;
const legacyModeEvidence = (data: Record<string, unknown>, mode: GameMode): unknown => {
  if (hasCompleteModes(data)) return undefined;
  const legacyMode = data.currentGameMode === 'seasonal' ? 'seasonal' : 'pvp';
  return mode === legacyMode ? data : undefined;
};
const rawStructuredModeEvidence = (data: Record<string, unknown>, mode: GameMode): unknown => {
  if (!('currentGameMode' in data)) return mode === 'pvp' ? data : undefined;
  return mode in data ? data[mode] : legacyModeEvidence(data, mode);
};
const rawModeEvidence = (data: unknown, mode: GameMode): unknown =>
  isRecord(data) ? rawStructuredModeEvidence(data, mode) : undefined;
const modeConfirmationCandidates = (data: unknown, mode: GameMode): ConfirmationMap => {
  const progress = rawModeEvidence(data, mode);
  return taskAvailabilityCandidates(isRecord(progress) ? progress.taskAvailability : undefined);
};
const persistedModeEvidence = (data: UserState) => {
  return {
    state: sanitizeOwnedUserState(migrateToGameModeStructure(data)),
    confirmationCandidates: Object.fromEntries(
      GAME_MODE_VALUES.map((mode) => [mode, modeConfirmationCandidates(data, mode)])
    ),
  };
};
export const parsePersistedProgressState = (
  rawValue: string | null | undefined,
  userId: string | null
): PersistedProgressSnapshot | null => {
  if (!rawValue) {
    return null;
  }
  const wrapped = parseUserScopedStorage<UserState>(rawValue);
  if (wrapped) {
    const hadDeprecatedProgressData = hasDeprecatedTarkovDevProfileData(wrapped.data);
    if (wrapped._userId !== userId) {
      return null;
    }
    return {
      hadDeprecatedProgressData,
      ...persistedModeEvidence(wrapped.data),
      storedUserId: wrapped._userId,
      timestamp: wrapped._timestamp ?? null,
      metadataTimestamp: wrapped._metadataTimestamp,
      modeTimestamps: wrapped._modeTimestamps,
      seasonalSourceSeasonNumber: wrapped.data.seasonalSeasonNumber ?? ACTIVE_SEASON_NUMBER,
    };
  }
  try {
    const parsed = JSON.parse(rawValue) as UserState;
    return {
      hadDeprecatedProgressData: hasDeprecatedTarkovDevProfileData(parsed),
      ...persistedModeEvidence(parsed),
      storedUserId: null,
      timestamp: null,
      seasonalSourceSeasonNumber: parsed.seasonalSeasonNumber ?? ACTIVE_SEASON_NUMBER,
    };
  } catch {
    return null;
  }
};
export const readPersistedProgressState = (
  userId: string | null
): PersistedProgressSnapshot | null => {
  if (!import.meta.client) {
    return null;
  }
  return parsePersistedProgressState(readActiveProgressValue(), userId);
};
export const getPreservedProgressStorageValue = (previousUserId: string | null): string | null => {
  if (!import.meta.client || !previousUserId) {
    return null;
  }
  const rawPersistedState = readActiveProgressValue();
  return parsePersistedProgressState(rawPersistedState, previousUserId) ? rawPersistedState : null;
};
export const patchStoreState = (
  store: { $patch: (fn: (state: UserState) => void) => void },
  snapshot: UserState
) => {
  const sanitizedSnapshot = sanitizeOwnedUserState(snapshot);
  store.$patch((state) => {
    state.currentGameMode = sanitizedSnapshot.currentGameMode;
    state.gameEdition = sanitizedSnapshot.gameEdition;
    state.tarkovUid = sanitizedSnapshot.tarkovUid;
    state.pvp = sanitizedSnapshot.pvp;
    state.pve = sanitizedSnapshot.pve;
    state.seasonal = sanitizedSnapshot.seasonal;
  });
};
export const progressStorageSerializer = createProgressStorageSerializer(
  readPersistedProgressState,
  // Accepted remote state and clocks are already held by the cloud.
  (value, expected) => {
    void persistActiveProgressValue(value, true, expected);
  }
);
