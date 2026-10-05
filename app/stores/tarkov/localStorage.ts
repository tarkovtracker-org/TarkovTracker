import { migrateToGameModeStructure, type UserState } from '@/stores/progressState';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import {
  classifyLocalSaveFailure,
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
export const createProgressStorageSerializer = (
  readPrevious: (userId: string | null) => PersistedProgressSnapshot | null,
  persistAccepted?: (value: string, expected: PersistedProgressSnapshot | null) => void
) => {
  let previous: PersistedProgressSnapshot | null = null;
  const serialize = (state: UserState, userId: string | null, timestamp: number): string => {
    if (previous?.storedUserId !== userId) previous = readPrevious(userId);
    const modeTimestamps = Object.fromEntries(
      GAME_MODE_VALUES.map((mode) => [mode, nextModeTimestamp(previous, state, mode, timestamp)])
    );
    const metadataTimestamp = nextMetadataTimestamp(previous, state, timestamp);
    previous = {
      metadataTimestamp,
      state: cloneStateSnapshot(state),
      storedUserId: userId,
      timestamp,
      modeTimestamps,
      seasonalSourceSeasonNumber: state.seasonalSeasonNumber ?? ACTIVE_SEASON_NUMBER,
      hadDeprecatedProgressData: false,
    };
    return JSON.stringify({
      _timestamp: timestamp,
      _metadataTimestamp: metadataTimestamp,
      _modeTimestamps: modeTimestamps,
      _userId: userId,
      data: state,
    });
  };
  return {
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
type StorageWriteResult = { ok: true } | { ok: false; error: unknown; canceled?: boolean };
let activeProgressWritesBlocked = false;
const ACTIVE_PROGRESS_LOCK = `${STORAGE_KEYS.progress}:mutation`;
let activeProgressGeneration = 0;
const ownerGenerations = new Map<string, number>();
const ownerGenerationFor = (owner?: string | null): number =>
  owner ? (ownerGenerations.get(owner) ?? 0) : 0;
let localWriteRevision = 0;
let pendingProgressValue: { value: string; revision: number; cloudHeld: boolean } | null = null;
const readActiveProgressValue = (): string | null =>
  pendingProgressValue?.value ?? safeGetItem(STORAGE_KEYS.progress);
let pendingAcknowledgementValue: { value: string; revision: number } | null = null;
let acknowledgementRevision = 0;
const readSerializerProgressState = (userId: string | null): PersistedProgressSnapshot | null =>
  parsePersistedProgressState(
    pendingProgressValue?.value ??
      pendingAcknowledgementValue?.value ??
      safeGetItem(STORAGE_KEYS.progress),
    userId
  );
const activeProgressOperations = new Set<Promise<StorageWriteResult>>();
/** Cancel queued writes before changing the session or intentionally clearing its progress. */
export const invalidateActiveProgressWrites = (owner?: string, cloudHeld = false): void => {
  if (owner) {
    ownerGenerations.set(owner, ownerGenerationFor(owner) + 1);
    if (
      parseUserScopedStorage<unknown>(pendingAcknowledgementValue?.value ?? '')?._userId === owner
    )
      pendingAcknowledgementValue = null;
    if (parseUserScopedStorage<unknown>(pendingProgressValue?.value ?? '')?._userId !== owner)
      return;
  } else {
    activeProgressGeneration += 1;
  }
  if (pendingProgressValue)
    recordLocalSave(false, null, cloudHeld || pendingProgressValue.cloudHeld);
  localWriteRevision += 1;
  pendingProgressValue = null;
  pendingAcknowledgementValue = null;
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
/**
 * Writes the active progress envelope and records whether the browser confirmed it.
 * Only this confirmation may be described to the player as a local save.
 */
export const persistActiveProgressValue = async (
  value: string,
  cloudHeld = false,
  expected?: PersistedProgressSnapshot | null
): Promise<boolean> => {
  // A conditional acknowledgement changes clocks for cloud-held state, not local edits.
  // Keep any real queued value and its save status visible until its own write settles.
  const revision = expected === undefined ? ++localWriteRevision : localWriteRevision;
  const acknowledgement = ++acknowledgementRevision;
  if (expected !== undefined) pendingAcknowledgementValue = { value, revision: acknowledgement };
  if (expected === undefined) {
    pendingProgressValue = { value, revision, cloudHeld };
    recordLocalSavePending(cloudHeld);
  }
  const result = await mutateActiveProgress(() => {
    const current = localStorage.getItem(STORAGE_KEYS.progress);
    if (expected !== undefined && !matchesExpectedProgress(current, expected)) {
      return { ok: false, error: null, canceled: true };
    }
    return writeStorageItem(STORAGE_KEYS.progress, value, cloudHeld);
  }, parseUserScopedStorage<unknown>(value)?._userId);
  if (pendingAcknowledgementValue?.revision === acknowledgement) pendingAcknowledgementValue = null;
  if (expected === undefined && pendingProgressValue?.revision === revision)
    pendingProgressValue = null;
  const canceledAcknowledgement = expected !== undefined && !result.ok && result.canceled;
  if (localWriteRevision === revision && !canceledAcknowledgement) {
    if (result.ok) {
      if (expected === undefined) recordLocalSave(true);
    } else recordLocalSave(false, classifyLocalSaveFailure(result.error), cloudHeld);
  }
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
  setItem: (key: string, value: string): void => {
    if (key === STORAGE_KEYS.progress) void persistActiveProgressValue(value);
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
  storage: Storage = localStorage
): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (
      key === STORAGE_KEYS.progress &&
      !canRemoveActiveProgress(storage.getItem(key), explicitOwnerRemoval, expectedValue)
    )
      return false;
    storage.removeItem(key);
    return true;
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
  const result = await mutateActiveProgress(() => {
    const explicitOwner = resetOwner && !activeProgressWritesBlocked ? resetOwner : undefined;
    return removeStorageItem(STORAGE_KEYS.progress, explicitOwner)
      ? { ok: true }
      : { ok: false, error: null };
  });
  safeRemoveItem(LEGACY_STORAGE_KEYS.progress);
  return result.ok || isLocalStorageInaccessible();
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
  readSerializerProgressState,
  // Accepted remote state and clocks are already held by the cloud.
  (value, expected) => {
    void persistActiveProgressValue(value, true, expected);
  }
);
