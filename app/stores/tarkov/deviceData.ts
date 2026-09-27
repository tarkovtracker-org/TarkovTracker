import {
  blockAccountRecoveryRetentionForOwner,
  clearBlockedAccountRecoveryRetention,
  removeAccountRecoveryCopy,
} from '@/stores/tarkov/accountRecovery';
import { safeRemoveItem, setActiveProgressWritesBlocked } from '@/stores/tarkov/localStorage';
import { removeSupersededProgressCopies } from '@/stores/tarkov/supersededProgress';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
/**
 * Explicit removal of one account's data from this browser (see `CONTEXT.md`). It is
 * distinct from ordinary sign-out, which keeps the account recovery copy, and from
 * deleting cloud progress, which this never touches.
 */
let removalPendingFor: string | null = null;
const removalCleanupCallbacks = new Set<(userId: string) => void>();
export const registerDeviceDataRemovalCleanup = (cleanup: (userId: string) => void): void => {
  removalCleanupCallbacks.add(cleanup);
};
/** Session transitions for this owner must not retain copies while removal is pending. */
export const requestDeviceDataRemoval = (userId: string): void => {
  removalPendingFor = userId;
};
export const isDeviceDataRemovalPending = (userId: string | null): boolean =>
  userId !== null && removalPendingFor === userId;
export const clearDeviceDataRemoval = (): void => {
  removalPendingFor = null;
};
const OWNED_BACKUP_PREFIXES = [
  STORAGE_KEYS.progressBackupPrefix,
  LEGACY_STORAGE_KEYS.progressBackupPrefix,
];
const isRecognizedBackupKey = (key: string): boolean =>
  OWNED_BACKUP_PREFIXES.some((prefix) => key.startsWith(prefix));
const listStorageKeys = (): string[] | null => {
  try {
    return Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    ).filter((key): key is string => key !== null);
  } catch {
    return null;
  }
};
const removeIfOwned = (key: string, userId: string, explicitProgressRemoval = false): boolean => {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return false;
  }
  if (!raw) return true;
  const envelope = parseUserScopedStorage<unknown>(raw);
  if (!envelope) return false;
  if (envelope._userId !== userId) return true;
  return safeRemoveItem(key, explicitProgressRemoval ? userId : undefined);
};
/** Removes every locally stored copy owned by `userId`; other accounts are untouched. */
export const removeAccountDeviceData = (userId: string): boolean => {
  if (typeof window === 'undefined') return false;
  removalCleanupCallbacks.forEach((cleanup) => cleanup(userId));
  const keys = listStorageKeys();
  let removed = keys !== null;
  removed = removeAccountRecoveryCopy(userId) && removed;
  removed = removeSupersededProgressCopies(userId) && removed;
  const activeRemoved = removeIfOwned(STORAGE_KEYS.progress, userId, true);
  removed = activeRemoved && removed;
  removed = removeIfOwned(STORAGE_KEYS.preferences, userId) && removed;
  for (const key of keys ?? []) {
    if (!isRecognizedBackupKey(key)) continue;
    removed = removeIfOwned(key, userId) && removed;
  }
  // A retained backup is already isolated; only an active copy needs a write barrier.
  if (activeRemoved) {
    clearBlockedAccountRecoveryRetention(userId);
  } else {
    blockAccountRecoveryRetentionForOwner(userId);
    setActiveProgressWritesBlocked(true);
  }
  return removed;
};
