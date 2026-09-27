import {
  clearBlockedAccountRecoveryRetention,
  removeAccountRecoveryCopy,
} from '@/stores/tarkov/accountRecovery';
import { safeGetItem, safeRemoveItem } from '@/stores/tarkov/localStorage';
import { removeSupersededProgressCopies } from '@/stores/tarkov/supersededProgress';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
/**
 * Explicit removal of one account's data from this browser (see `CONTEXT.md`). It is
 * distinct from ordinary sign-out, which keeps the account recovery copy, and from
 * deleting cloud progress, which this never touches.
 */
let removalPendingFor: string | null = null;
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
const isOwnedBackupKey = (key: string, userId: string): boolean =>
  OWNED_BACKUP_PREFIXES.some((prefix) => key.startsWith(`${prefix}${userId}_`));
const listStorageKeys = (): string[] =>
  Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(
    (key): key is string => key !== null
  );
const removeIfOwned = (key: string, userId: string, explicitProgressRemoval = false): void => {
  const raw = safeGetItem(key);
  if (raw && parseUserScopedStorage<unknown>(raw)?._userId === userId) {
    safeRemoveItem(key, explicitProgressRemoval ? userId : undefined);
  }
};
/** Removes every locally stored copy owned by `userId`; other accounts are untouched. */
export const removeAccountDeviceData = (userId: string): void => {
  if (typeof window === 'undefined') return;
  removeAccountRecoveryCopy(userId);
  removeSupersededProgressCopies(userId);
  removeIfOwned(STORAGE_KEYS.progress, userId, true);
  removeIfOwned(STORAGE_KEYS.preferences, userId);
  listStorageKeys()
    .filter((key) => isOwnedBackupKey(key, userId))
    .forEach((key) => safeRemoveItem(key));
  clearBlockedAccountRecoveryRetention(userId);
};
