import { migrateToGameModeStructure, type UserState } from '@/stores/progressState';
import { deepEqual } from '@/stores/tarkov/deepEqual';
import { clearProgressStorage } from '@/utils/clientStorage';
import { GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  hasDeprecatedTarkovDevProfileData,
  sanitizeOwnedUserState,
} from '@/utils/progressSanitizers';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
export type PersistedProgressSnapshot = {
  hadDeprecatedProgressData: boolean;
  state: UserState;
  storedUserId: string | null;
  timestamp: number | null;
  metadataTimestamp?: number;
  modeTimestamps?: Partial<Record<GameMode, number>>;
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
const retainedModeTimestamp = (previous: PersistedProgressSnapshot, mode: GameMode): number =>
  previous.modeTimestamps?.[mode] ?? previous.timestamp ?? 0;
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
  readPrevious: (userId: string | null) => PersistedProgressSnapshot | null
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
    reset: (snapshot: PersistedProgressSnapshot | null = null) => {
      previous = snapshot ? cloneStateSnapshot(snapshot) : null;
    },
    serialize,
    acceptRemote: (snapshot: RemoteProgressSnapshot) => {
      // Capture any local edits before replacing the baseline. Pinia persistence
      // can run after a synchronous remote patch, so comparing only in serialize
      // would incorrectly timestamp downloaded progress as a new local edit.
      serialize(snapshot.state, snapshot.userId, Date.now());
      const accepted = previous!;
      acceptRemoteMetadata(accepted, snapshot);
      GAME_MODE_VALUES.forEach((mode) => acceptRemoteMode(accepted, snapshot, mode));
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
export const safeSetItem = (key: string, value: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    logger.error(`[TarkovStore] Failed to write localStorage key "${key}":`, error);
    return false;
  }
};
export const safeRemoveItem = (key: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    logger.error(`[TarkovStore] Failed to remove localStorage key "${key}":`, error);
    return false;
  }
};
export const clearProgressStorageSafely = () => {
  try {
    clearProgressStorage();
  } catch (error) {
    logger.error('[TarkovStore] Failed to clear progress storage:', error);
  }
};
export const clearActiveProgressStorage = () => {
  if (typeof window === 'undefined') return;
  safeRemoveItem(STORAGE_KEYS.progress);
  safeRemoveItem(LEGACY_STORAGE_KEYS.progress);
};
export const backupProgressStorageValue = (rawValue: string, storedUserId: string | null) => {
  if (typeof window === 'undefined') return;
  const ownerKey = storedUserId || 'anonymous';
  const backupKey = `${STORAGE_KEYS.progressBackupPrefix}${ownerKey}_${Date.now()}`;
  if (safeSetItem(backupKey, rawValue) && import.meta.dev) {
    logger.debug(`[TarkovStore] Data backed up to ${backupKey}`);
  }
};
const parsePersistedProgressState = (
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
      state: sanitizeOwnedUserState(migrateToGameModeStructure(wrapped.data)),
      storedUserId: wrapped._userId,
      timestamp: wrapped._timestamp ?? null,
      metadataTimestamp: wrapped._metadataTimestamp,
      modeTimestamps: wrapped._modeTimestamps,
    };
  }
  try {
    const parsed = JSON.parse(rawValue) as UserState;
    return {
      hadDeprecatedProgressData: hasDeprecatedTarkovDevProfileData(parsed),
      state: sanitizeOwnedUserState(migrateToGameModeStructure(parsed)),
      storedUserId: null,
      timestamp: null,
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
  return parsePersistedProgressState(safeGetItem(STORAGE_KEYS.progress), userId);
};
export const getPreservedProgressStorageValue = (previousUserId: string | null): string | null => {
  if (!import.meta.client || !previousUserId) {
    return null;
  }
  const rawPersistedState = safeGetItem(STORAGE_KEYS.progress);
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
  readPersistedProgressState
);
