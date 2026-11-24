import { removeActiveProgressValue } from '@/stores/tarkov/localStorage';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
export const isSupabaseAuthStorageKey = (key: string): boolean => {
  return key.endsWith('-auth-token') || key.endsWith('-code-verifier');
};
type StorageKeyReader = Pick<Storage, 'key' | 'length'>;
type StorageKeySource = StorageKeyReader | Record<string, unknown>;
const isStorageKeyReader = (storage: StorageKeySource): storage is StorageKeyReader =>
  'key' in storage && typeof storage.key === 'function' && typeof storage.length === 'number';
export const getStorageKeys = (storage: StorageKeyReader | null): string[] => {
  const keys: string[] = [];
  if (!storage) return keys;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
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
  const keys = isStorageKeyReader(storage) ? getStorageKeys(storage) : Object.keys(storage);
  return keys.some(isSupabaseAuthStorageKey);
};
const clearSessionMigrationKeys = (sessionStorageArea: Storage | null): void => {
  sessionStorageArea?.removeItem(STORAGE_KEYS.sessionDataMigrated);
  sessionStorageArea?.removeItem(LEGACY_STORAGE_KEYS.sessionDataMigrated);
};
export const clearProgressStorage = async (storage?: Storage | null): Promise<void> => {
  storage ??= getDefaultLocalStorageArea();
  if (!storage) {
    return;
  }
  await removeActiveProgressValue(undefined, undefined, storage);
  storage.removeItem(LEGACY_STORAGE_KEYS.progress);
  getStorageKeys(storage)
    .filter(
      (key) =>
        key.startsWith(STORAGE_KEYS.progressBackupPrefix) ||
        key.startsWith(LEGACY_STORAGE_KEYS.progressBackupPrefix)
    )
    .forEach((key) => storage.removeItem(key));
};
export const clearPreferencesStorage = (storage?: Storage | null): void => {
  storage ??= getDefaultLocalStorageArea();
  if (!storage) {
    return;
  }
  storage.removeItem(STORAGE_KEYS.preferences);
  storage.removeItem(LEGACY_STORAGE_KEYS.preferences);
};
const clearSessionScopedStorage = async (
  localStorageArea: Storage | null = getDefaultLocalStorageArea(),
  sessionStorageArea: Storage | null = getDefaultSessionStorageArea()
): Promise<void> => {
  await clearProgressStorage(localStorageArea);
  clearPreferencesStorage(localStorageArea);
  clearSessionMigrationKeys(sessionStorageArea);
};
type ClearUserScopedAppStorageOptions = {
  includeAuthSessions?: boolean;
  sessionStorageArea?: Storage | null;
};
export const clearUserScopedAppStorage = async (
  storage: Storage | null = getDefaultLocalStorageArea(),
  options: ClearUserScopedAppStorageOptions = {}
): Promise<void> => {
  const { includeAuthSessions = false, sessionStorageArea = getDefaultSessionStorageArea() } =
    options;
  if (!storage) {
    clearSessionMigrationKeys(sessionStorageArea);
    return;
  }
  await clearSessionScopedStorage(storage, sessionStorageArea);
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
  getStorageKeys(storage)
    .filter(isSupabaseAuthStorageKey)
    .forEach((key) => storage.removeItem(key));
};
