import {
  blockAccountRecoveryRetentionForOwner,
  clearBlockedAccountRecoveryRetention,
  removeAccountRecoveryCopy,
} from '@/stores/tarkov/accountRecovery';
import {
  isLocalStorageInaccessible,
  quarantineAndRemoveUnparseableActiveProgress,
  isUnparseableProgressStorageValue,
  safeRemoveItem,
  removeActiveProgressValue,
  invalidateActiveProgressWrites,
  safeSetItem,
  setActiveProgressWritesBlocked,
} from '@/stores/tarkov/localStorage';
import { removeSupersededProgressCopies } from '@/stores/tarkov/supersededProgress';
import { logger } from '@/utils/logger';
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
/** Owner-scoped envelopes outside progress; guest and unscoped values are left in place. */
const OWNER_SCOPED_KEYS = [
  STORAGE_KEYS.preferences,
  LEGACY_STORAGE_KEYS.preferences,
  STORAGE_KEYS.activityLogManual,
  LEGACY_STORAGE_KEYS.activityLogManual,
  STORAGE_KEYS.activityLogLastRead,
  LEGACY_STORAGE_KEYS.activityLogLastRead,
];
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
/** The active slot is released only once the owner's durable marker is confirmed. */
const quarantineUnattributedActiveProgress = async (
  raw: string,
  userId: string
): Promise<RemovalResult | null> => {
  const released = await quarantineAndRemoveUnparseableActiveProgress(raw, (quarantineKey) =>
    safeSetItem(removalMarkerKey(userId), quarantineKey)
  );
  if (!released && readStorageItem(STORAGE_KEYS.progress) !== raw) return null;
  return { complete: false, released };
};
const removeOwnedActiveProgress = async (
  userId: string,
  raw: string
): Promise<RemovalResult | null> => {
  const removed = await removeIfUnchanged(STORAGE_KEYS.progress, raw, userId);
  return removed === null ? null : { complete: removed, released: removed };
};
const isForeignEnvelope = (envelope: ScopedEnvelope, userId: string): boolean =>
  Boolean(envelope?._userId && envelope._userId !== userId);
/** Malformed active bytes are deleted only when they name this owner; otherwise quarantined. */
const removeMalformedActiveProgress = async (
  raw: string,
  userId: string,
  envelope: ScopedEnvelope
): Promise<RemovalResult | null> => {
  if (isForeignEnvelope(envelope, userId)) return { complete: true, released: true };
  if (envelope?._userId === userId) return removeOwnedActiveProgress(userId, raw);
  return quarantineUnattributedActiveProgress(raw, userId);
};
/** Another tab may replace a shared key between the ownership read and the removal. */
const removeIfUnchanged = async (
  key: string,
  raw: string,
  explicitOwner?: string
): Promise<boolean | null> => {
  if (readStorageItem(key) !== raw) return null;
  const removed =
    key === STORAGE_KEYS.progress
      ? await removeActiveProgressValue(explicitOwner, raw)
      : safeRemoveItem(key);
  return !removed && readStorageItem(key) !== raw ? null : removed;
};
const removeParsedOwnedValue = async (
  key: string,
  raw: string,
  userId: string,
  envelope: ScopedEnvelope,
  explicitProgressRemoval: boolean
): Promise<RemovalResult | null> => {
  // A value without an owner envelope cannot be proven to belong to this owner, so it is kept.
  if (!envelope || envelope._userId !== userId) return { complete: true, released: true };
  const removed = await removeIfUnchanged(key, raw, explicitProgressRemoval ? userId : undefined);
  return removed === null ? null : { complete: removed, released: removed };
};
const isMalformedActiveProgress = (key: string, raw: string, explicitRemoval: boolean): boolean =>
  explicitRemoval && key === STORAGE_KEYS.progress && isUnparseableProgressStorageValue(raw);
/** `null` means the stored value changed during the attempt and ownership must be re-read. */
const attemptOwnedRemoval = async (
  key: string,
  userId: string,
  explicitProgressRemoval: boolean
): Promise<RemovalResult | null> => {
  const raw = readStorageItem(key);
  if (raw === undefined) return { complete: false, released: false };
  if (!raw) return { complete: true, released: true };
  const envelope = parseUserScopedStorage<unknown>(raw);
  if (isMalformedActiveProgress(key, raw, explicitProgressRemoval)) {
    return removeMalformedActiveProgress(raw, userId, envelope);
  }
  return removeParsedOwnedValue(key, raw, userId, envelope, explicitProgressRemoval);
};
const OWNERSHIP_REREAD_ATTEMPTS = 3;
const removeIfOwned = async (
  key: string,
  userId: string,
  explicitProgressRemoval = false
): Promise<RemovalResult> => {
  for (let attempt = 0; attempt < OWNERSHIP_REREAD_ATTEMPTS; attempt += 1) {
    const result = await attemptOwnedRemoval(key, userId, explicitProgressRemoval);
    if (result) return result;
  }
  return { complete: false, released: false };
};
/** Removes every locally stored copy owned by `userId`; other accounts are untouched. */
export const removeAccountDeviceData = async (userId: string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  invalidateActiveProgressWrites(userId);
  removalCleanupCallbacks.forEach((cleanup) => cleanup(userId));
  const keys = listStorageKeys();
  let removed = keys !== null;
  removed = removeAccountRecoveryCopy(userId) && removed;
  removed = removeSupersededProgressCopies(userId) && removed;
  const activeRemoval = await removeIfOwned(STORAGE_KEYS.progress, userId, true);
  removed = activeRemoval.complete && removed;
  for (const key of OWNER_SCOPED_KEYS) {
    removed = (await removeIfOwned(key, userId)).complete && removed;
  }
  for (const key of keys ?? []) {
    if (!isRecognizedBackupKey(key)) continue;
    removed = (await removeIfOwned(key, userId)).complete && removed;
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
 * Owners whose explicit removal already signed out but left data behind. Retries stay bound
 * to those owners, since the signed-out UI can no longer name them; each owner also gets its own
 * stored marker so a reload (for example after account deletion) or another tab can still retry.
 */
const INCOMPLETE_PREFIX = STORAGE_KEYS.deviceDataRemovalIncompletePrefix;
const readIncompleteRemovalOwners = (): string[] =>
  (listStorageKeys() ?? [])
    .filter((key) => key.startsWith(INCOMPLETE_PREFIX))
    .map((key) => key.slice(INCOMPLETE_PREFIX.length));
const incompleteRemovalOwners = ref<string[]>(readIncompleteRemovalOwners());
export const incompleteDeviceDataRemovalOwner = computed(
  () => incompleteRemovalOwners.value[0] ?? null
);
/** Another tab may record or clear a marker after this tab's auth transition ran. */
export const refreshIncompleteDeviceDataRemovals = (): void => {
  incompleteRemovalOwners.value = readIncompleteRemovalOwners();
};
const withoutOwner = (userId: string): string[] =>
  incompleteRemovalOwners.value.filter((owner) => owner !== userId);
export const markDeviceDataRemovalIncomplete = (userId: string): void => {
  incompleteRemovalOwners.value = [...withoutOwner(userId), userId];
  if (!safeSetItem(`${INCOMPLETE_PREFIX}${userId}`, userId)) {
    logger.warn('[DeviceData] Incomplete removal is retryable only until this page reloads');
  }
};
/** The owner stays incomplete until its durable marker is gone; blocked storage holds none. */
const endIncompleteRemoval = (userId: string): void => {
  if (!safeRemoveItem(`${INCOMPLETE_PREFIX}${userId}`) && !isLocalStorageInaccessible()) {
    logger.warn('[DeviceData] Incomplete removal marker could not be cleared');
    return;
  }
  incompleteRemovalOwners.value = withoutOwner(userId);
};
/** The owner signing back in ends the removal intent; nothing is removed from its session. */
export const clearIncompleteDeviceDataRemoval = (userId: string | null): void => {
  if (userId !== null) endIncompleteRemoval(userId);
};
/** Records a removal attempt's outcome for `userId`: failures stay retryable across reloads. */
export const recordDeviceDataRemovalOutcome = (userId: string, removed: boolean): void => {
  if (removed) endIncompleteRemoval(userId);
  else markDeviceDataRemovalIncomplete(userId);
};
/** Retries every owner recorded by any tab; returns `true` once none remains incomplete. */
export const retryIncompleteDeviceDataRemoval = async (): Promise<boolean> => {
  const owners = [...new Set([...incompleteRemovalOwners.value, ...readIncompleteRemovalOwners()])];
  incompleteRemovalOwners.value = owners;
  for (const owner of owners) {
    if (await removeAccountDeviceData(owner)) endIncompleteRemoval(owner);
  }
  return incompleteRemovalOwners.value.length === 0;
};
