import {
  blockAccountRecoveryRetentionForOwner,
  clearBlockedAccountRecoveryRetention,
  removeAccountRecoveryCopy,
} from '@/stores/tarkov/accountRecovery';
import {
  quarantineAndRemoveUnparseableActiveProgress,
  isUnparseableProgressStorageValue,
  safeRemoveItem,
  setActiveProgressWritesBlocked,
} from '@/stores/tarkov/localStorage';
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
type RemovalResult = { complete: boolean; released: boolean };
const preserveMalformedActiveRemoval = (
  raw: string,
  userId: string,
  envelope: ReturnType<typeof parseUserScopedStorage<unknown>>
): RemovalResult | null => {
  if (envelope?._userId && envelope._userId !== userId) {
    return { complete: true, released: true };
  }
  if (!isUnparseableProgressStorageValue(raw)) return null;
  return {
    complete: false,
    released: quarantineAndRemoveUnparseableActiveProgress(raw),
  };
};
const removeParsedOwnedValue = (
  key: string,
  userId: string,
  envelope: ReturnType<typeof parseUserScopedStorage<unknown>>,
  explicitProgressRemoval: boolean
): RemovalResult => {
  if (!envelope) return { complete: false, released: false };
  if (envelope._userId !== userId) return { complete: true, released: true };
  const removed = safeRemoveItem(key, explicitProgressRemoval ? userId : undefined);
  return { complete: removed, released: removed };
};
const removeIfOwned = (
  key: string,
  userId: string,
  explicitProgressRemoval = false
): RemovalResult => {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { complete: false, released: false };
  }
  if (!raw) return { complete: true, released: true };
  const envelope = parseUserScopedStorage<unknown>(raw);
  const malformedRemoval =
    explicitProgressRemoval && key === STORAGE_KEYS.progress
      ? preserveMalformedActiveRemoval(raw, userId, envelope)
      : null;
  return malformedRemoval ?? removeParsedOwnedValue(key, userId, envelope, explicitProgressRemoval);
};
/** Removes every locally stored copy owned by `userId`; other accounts are untouched. */
export const removeAccountDeviceData = (userId: string): boolean => {
  if (typeof window === 'undefined') return false;
  removalCleanupCallbacks.forEach((cleanup) => cleanup(userId));
  const keys = listStorageKeys();
  let removed = keys !== null;
  removed = removeAccountRecoveryCopy(userId) && removed;
  removed = removeSupersededProgressCopies(userId) && removed;
  const activeRemoval = removeIfOwned(STORAGE_KEYS.progress, userId, true);
  removed = activeRemoval.complete && removed;
  removed = removeIfOwned(STORAGE_KEYS.preferences, userId).complete && removed;
  for (const key of keys ?? []) {
    if (!isRecognizedBackupKey(key)) continue;
    removed = removeIfOwned(key, userId).complete && removed;
  }
  // A retained backup is already isolated; only an active copy needs a write barrier.
  if (activeRemoval.released) {
    clearBlockedAccountRecoveryRetention(userId);
  } else {
    blockAccountRecoveryRetentionForOwner(userId);
    setActiveProgressWritesBlocked(true);
  }
  return removed;
};
