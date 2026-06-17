import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
const isSupabaseAuthStorageKey = (key: string): boolean => {
  return key.endsWith('-auth-token') || key.endsWith('-code-verifier');
};
type StorageKeySource = Pick<Storage, 'key' | 'length'> | Record<string, unknown>;
const getStorageKeys = (storage: StorageKeySource): string[] => {
  if ('key' in storage && typeof storage.key === 'function' && typeof storage.length === 'number') {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) {
        keys.push(key);
      }
    }
    return keys;
  }
  return Object.keys(storage);
};
const getProgressBackupKeys = (storage: Storage): string[] => {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (
      key &&
      (key.startsWith(STORAGE_KEYS.progressBackupPrefix) ||
        key.startsWith(LEGACY_STORAGE_KEYS.progressBackupPrefix))
    ) {
      keys.push(key);
    }
  }
  return keys;
};
const getDefaultSessionStorageArea = (): Storage | null =>
  typeof globalThis.sessionStorage !== 'undefined' ? globalThis.sessionStorage : null;
const getDefaultLocalStorageArea = (): Storage | null =>
  typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
export const hasSupabaseAuthSessionHint = (
  storage: StorageKeySource | null = getDefaultLocalStorageArea()
): boolean => {
  if (!storage) {
    return false;
  }
  return getStorageKeys(storage).some((key) => isSupabaseAuthStorageKey(key));
};
const clearSessionMigrationKeys = (sessionStorageArea: Storage | null): void => {
  sessionStorageArea?.removeItem(STORAGE_KEYS.sessionDataMigrated);
  sessionStorageArea?.removeItem(LEGACY_STORAGE_KEYS.sessionDataMigrated);
};
export const clearProgressStorage = (storage?: Storage | null): void => {
  storage ??= getDefaultLocalStorageArea();
  if (!storage) {
    return;
  }
  storage.removeItem(STORAGE_KEYS.progress);
  storage.removeItem(LEGACY_STORAGE_KEYS.progress);
  getProgressBackupKeys(storage).forEach((key) => storage.removeItem(key));
};
export const clearPreferencesStorage = (storage?: Storage | null): void => {
  storage ??= getDefaultLocalStorageArea();
  if (!storage) {
    return;
  }
  storage.removeItem(STORAGE_KEYS.preferences);
  storage.removeItem(LEGACY_STORAGE_KEYS.preferences);
};
export const clearSessionScopedStorage = (
  localStorageArea: Storage | null = getDefaultLocalStorageArea(),
  sessionStorageArea: Storage | null = getDefaultSessionStorageArea()
): void => {
  clearProgressStorage(localStorageArea);
  clearPreferencesStorage(localStorageArea);
  clearSessionMigrationKeys(sessionStorageArea);
};
type ClearUserScopedAppStorageOptions = {
  includeAuthSessions?: boolean;
  sessionStorageArea?: Storage | null;
};
export const clearUserScopedAppStorage = (
  storage: Storage | null = getDefaultLocalStorageArea(),
  options: ClearUserScopedAppStorageOptions = {}
): void => {
  const { includeAuthSessions = false, sessionStorageArea = getDefaultSessionStorageArea() } =
    options;
  if (!storage) {
    clearSessionMigrationKeys(sessionStorageArea);
    return;
  }
  clearSessionScopedStorage(storage, sessionStorageArea);
  storage.removeItem(STORAGE_KEYS.analyticsConsent);
  storage.removeItem(LEGACY_STORAGE_KEYS.analyticsConsent);
  storage.removeItem(STORAGE_KEYS.adminLastPurge);
  storage.removeItem(LEGACY_STORAGE_KEYS.adminLastPurge);
  storage.removeItem(STORAGE_KEYS.cachePurgeAt);
  storage.removeItem(LEGACY_STORAGE_KEYS.cachePurgeAt);
  storage.removeItem(STORAGE_KEYS.cachePurgeCheckAt);
  storage.removeItem(LEGACY_STORAGE_KEYS.cachePurgeCheckAt);
  storage.removeItem(STORAGE_KEYS.activityLogManual);
  storage.removeItem(LEGACY_STORAGE_KEYS.activityLogManual);
  storage.removeItem(STORAGE_KEYS.activityLogLastRead);
  storage.removeItem(LEGACY_STORAGE_KEYS.activityLogLastRead);
  if (!includeAuthSessions) {
    return;
  }
  const authKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isSupabaseAuthStorageKey(key)) {
      authKeys.push(key);
    }
  }
  authKeys.forEach((key) => storage.removeItem(key));
};
