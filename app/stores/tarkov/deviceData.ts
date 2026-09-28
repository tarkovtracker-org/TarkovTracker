import {
  blockAccountRecoveryRetentionForOwner,
  clearBlockedAccountRecoveryRetention,
  removeAccountRecoveryCopy,
} from '@/stores/tarkov/accountRecovery';
import {
  quarantineAndRemoveUnparseableActiveProgress,
  isUnparseableProgressStorageValue,
  safeRemoveItem,
  safeSetItem,
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
type ScopedEnvelope = ReturnType<typeof parseUserScopedStorage<unknown>>;
const removalMarkerKey = (userId: string): string =>
  `${STORAGE_KEYS.progressQuarantineRemovalMarkerPrefix}${userId}`;
/** `undefined` means the browser refused the read, which must not count as absent. */
const readStorageItem = (key: string): string | null | undefined => {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined;
  }
};
/**
 * Unattributable bytes quarantined during this owner's removal keep every later removal
 * incomplete until that quarantine is gone; they are never deleted without proven ownership.
 */
const quarantineRemainsForOwner = (userId: string): boolean => {
  const markerKey = removalMarkerKey(userId);
  const quarantineKey = readStorageItem(markerKey);
  if (quarantineKey === null) return false;
  if (quarantineKey === undefined || readStorageItem(quarantineKey) !== null) return true;
  return !safeRemoveItem(markerKey);
};
const quarantineUnattributedActiveProgress = (raw: string, userId: string): RemovalResult => {
  const quarantineKey = quarantineAndRemoveUnparseableActiveProgress(raw);
  if (quarantineKey) safeSetItem(removalMarkerKey(userId), quarantineKey);
  return { complete: false, released: quarantineKey !== null };
};
const removeOwnedActiveProgress = (userId: string): RemovalResult => {
  const removed = safeRemoveItem(STORAGE_KEYS.progress, userId);
  return { complete: removed, released: removed };
};
const isForeignEnvelope = (envelope: ScopedEnvelope, userId: string): boolean =>
  Boolean(envelope?._userId && envelope._userId !== userId);
/** Malformed active bytes are deleted only when they name this owner; otherwise quarantined. */
const removeMalformedActiveProgress = (
  raw: string,
  userId: string,
  envelope: ScopedEnvelope
): RemovalResult | null => {
  if (isForeignEnvelope(envelope, userId)) return { complete: true, released: true };
  if (!isUnparseableProgressStorageValue(raw)) return null;
  if (envelope?._userId === userId) return removeOwnedActiveProgress(userId);
  return quarantineUnattributedActiveProgress(raw, userId);
};
const removeParsedOwnedValue = (
  key: string,
  userId: string,
  envelope: ScopedEnvelope,
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
  const raw = readStorageItem(key);
  if (raw === undefined) return { complete: false, released: false };
  if (!raw) return { complete: true, released: true };
  const envelope = parseUserScopedStorage<unknown>(raw);
  const malformedRemoval =
    explicitProgressRemoval && key === STORAGE_KEYS.progress
      ? removeMalformedActiveProgress(raw, userId, envelope)
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
  removed = !quarantineRemainsForOwner(userId) && removed;
  // A retained backup is already isolated; only an active copy needs a write barrier.
  if (activeRemoval.released) {
    clearBlockedAccountRecoveryRetention(userId);
  } else {
    blockAccountRecoveryRetentionForOwner(userId);
    setActiveProgressWritesBlocked(true);
  }
  return removed;
};
/**
 * Owner whose explicit removal already signed out but left data behind. The retry stays
 * bound to that owner, since the signed-out UI can no longer name it.
 */
const incompleteRemovalOwner = ref<string | null>(null);
export const incompleteDeviceDataRemovalOwner = readonly(incompleteRemovalOwner);
export const markDeviceDataRemovalIncomplete = (userId: string): void => {
  incompleteRemovalOwner.value = userId;
};
/** The owner signing back in ends the removal intent; nothing is removed from its session. */
export const clearIncompleteDeviceDataRemoval = (userId: string | null): void => {
  if (userId !== null && incompleteRemovalOwner.value === userId) {
    incompleteRemovalOwner.value = null;
  }
};
export const retryIncompleteDeviceDataRemoval = (): boolean => {
  const owner = incompleteRemovalOwner.value;
  if (!owner) return true;
  const removed = removeAccountDeviceData(owner);
  if (removed) incompleteRemovalOwner.value = null;
  return removed;
};
