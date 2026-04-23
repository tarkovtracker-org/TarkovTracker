import { migrateToGameModeStructure, type UserState } from '@/stores/progressState';
import { clearProgressStorage } from '@/utils/clientStorage';
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
      state: sanitizeOwnedUserState(migrateToGameModeStructure(wrapped.data)),
      storedUserId: wrapped._userId,
      timestamp: wrapped._timestamp ?? null,
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
  });
};
