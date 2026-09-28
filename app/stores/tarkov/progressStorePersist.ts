import { defaultState, migrateToGameModeStructure, type UserState } from '@/stores/progressState';
import {
  backupProgressStorageValue,
  clearActiveProgressStorage,
  cloneStateSnapshot,
  progressStorageSerializer,
  safeRemoveItem,
} from '@/stores/tarkov/localStorage';
import { logger } from '@/utils/logger';
import { sanitizeOwnedUserState } from '@/utils/progressSanitizers';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { getCurrentSupabaseUserId, parseUserScopedStorage } from '@/utils/userScopedStorage';
import type { StateTree } from 'pinia';
const QUOTA_CHECK_INTERVAL_MS = 60000;
const ESTIMATED_QUOTA_BYTES = 5 * 1024 * 1024;
const QUOTA_SAFETY_BUFFER_BYTES = 512 * 1024;
const QUOTA_LIMIT_BYTES = ESTIMATED_QUOTA_BYTES - QUOTA_SAFETY_BUFFER_BYTES;
let lastQuotaCheckTime = 0;
const entrySize = (key: string): number => localStorage[key].length + key.length;
const estimateStorageUsage = (): number =>
  Object.keys(localStorage).reduce((total, key) => total + entrySize(key), 0);
/** Backup keys are `prefix_isoString` or `prefix_userId_timestamp`. */
const backupTimestamp = (key: string): number => {
  const suffix = key.substring(STORAGE_KEYS.progressBackupPrefix.length);
  const isoDate = Date.parse(suffix);
  if (!isNaN(isoDate)) return isoDate;
  const numericTimestamp = parseInt(suffix.split('_').at(-1) ?? '', 10);
  return isNaN(numericTimestamp) ? 0 : numericTimestamp;
};
const oldestBackupsFirst = (): string[] =>
  Object.keys(localStorage)
    .filter((key) => key.startsWith(STORAGE_KEYS.progressBackupPrefix))
    .sort((a, b) => backupTimestamp(a) - backupTimestamp(b));
const toKb = (bytes: number): string => Math.round(bytes / 1024) + 'KB';
/** Remove the oldest progress backups until `neededSpace` fits under the estimated quota. */
const freeSpaceForProgress = (neededSpace: number): void => {
  let usage = estimateStorageUsage();
  if (usage + neededSpace <= QUOTA_LIMIT_BYTES) return;
  logger.warn('[TarkovStore] localStorage quota low, cleaning up old backups', {
    currentUsage: toKb(usage),
    needed: toKb(neededSpace),
    quota: toKb(ESTIMATED_QUOTA_BYTES),
  });
  let removedCount = 0;
  for (const key of oldestBackupsFirst()) {
    if (usage + neededSpace <= QUOTA_LIMIT_BYTES) break;
    const keySize = entrySize(key);
    if (!safeRemoveItem(key)) continue;
    usage -= keySize;
    removedCount++;
    logger.debug(`[TarkovStore] Removed old backup: ${key}`);
  }
  if (removedCount > 0) {
    logger.info(`[TarkovStore] Cleaned up ${removedCount} old backups to free space`);
  }
};
/** Throttled to one check per minute; the persist plugin reports any actual save failure. */
const manageQuota = (now: number, neededSpace: number): void => {
  if (now - lastQuotaCheckTime <= QUOTA_CHECK_INTERVAL_MS || typeof window === 'undefined') return;
  lastQuotaCheckTime = now;
  try {
    freeSpaceForProgress(neededSpace);
  } catch (quotaError) {
    logger.error('[TarkovStore] Error managing localStorage quota:', quotaError);
  }
};
const serialize = (state: StateTree): string => {
  const now = Date.now();
  const sanitizedState = sanitizeOwnedUserState(state as UserState);
  const serialized = progressStorageSerializer.serialize(
    cloneStateSnapshot(sanitizedState),
    getCurrentSupabaseUserId(),
    now
  );
  manageQuota(now, serialized.length);
  return serialized;
};
const restoreLegacyFormat = (value: string, currentUserId: string | null): UserState => {
  if (import.meta.dev) {
    logger.debug('[TarkovStore] Restoring legacy localStorage format', { currentUserId });
  }
  return sanitizeOwnedUserState(migrateToGameModeStructure(JSON.parse(value) as UserState));
};
const discardForeignState = (value: string, storedUserId: string, currentUserId: string) => {
  logger.warn(
    `[TarkovStore] localStorage userId mismatch! ` +
      `Stored: ${storedUserId}, Current: ${currentUserId}. ` +
      `Backing up and clearing localStorage to prevent data corruption.`
  );
  backupProgressStorageValue(value, storedUserId);
  clearActiveProgressStorage();
  return structuredClone(defaultState);
};
const restoreScopedState = (value: string): UserState => {
  const wrapped = parseUserScopedStorage<UserState>(value);
  const currentUserId = getCurrentSupabaseUserId();
  if (!wrapped) return restoreLegacyFormat(value, currentUserId);
  const storedUserId = wrapped._userId;
  if (storedUserId === currentUserId) {
    return sanitizeOwnedUserState(migrateToGameModeStructure(wrapped.data));
  }
  if (storedUserId && currentUserId) return discardForeignState(value, storedUserId, currentUserId);
  logger.debug('[TarkovStore] Ignoring scoped progress until matching auth state loads', {
    currentUserId,
    storedUserId,
  });
  return structuredClone(defaultState);
};
const deserialize = (value: string): UserState => {
  progressStorageSerializer.reset();
  try {
    return restoreScopedState(value);
  } catch (e) {
    logger.error('[TarkovStore] Error deserializing localStorage:', e);
    return structuredClone(defaultState);
  }
};
/** User-scoped localStorage persistence; the userId wrapper prevents cross-user contamination. */
export const progressStorePersist = {
  key: STORAGE_KEYS.progress,
  storage: typeof window !== 'undefined' ? localStorage : undefined,
  serializer: { serialize, deserialize },
};
