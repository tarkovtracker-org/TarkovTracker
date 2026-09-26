import { safeGetItem, safeRemoveItem } from '@/stores/tarkov/localStorage';
import { logger } from '@/utils/logger';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
const ESTIMATED_QUOTA_BYTES = 5 * 1024 * 1024;
const QUOTA_SAFETY_BUFFER_BYTES = 512 * 1024;
type StoredEntry = { key: string; value: string };
type BackupEntry = StoredEntry & { createdAt: number };
const BACKUP_PREFIXES = [
  STORAGE_KEYS.progressBackupPrefix,
  LEGACY_STORAGE_KEYS.progressBackupPrefix,
];
const isBackupKey = (key: string): boolean =>
  BACKUP_PREFIXES.some((prefix) => key.startsWith(prefix));
/** Copies that are never removed automatically; they may be the only copy of changes. */
const isRetainedCopyKey = (key: string): boolean =>
  key === STORAGE_KEYS.progress || key.startsWith(STORAGE_KEYS.progressRecoveryPrefix);
const listStoredEntries = (): StoredEntry[] =>
  Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => key !== null)
    .map((key) => ({ key, value: safeGetItem(key) ?? '' }));
const estimateUsage = (entries: StoredEntry[]): number =>
  entries.reduce((total, entry) => total + entry.key.length + entry.value.length, 0);
/** Backup keys end in `_<epoch ms>` (or an ISO date in the oldest format). */
const backupCreatedAt = (key: string): number => {
  const suffix = key.slice(key.lastIndexOf('_') + 1);
  const numeric = Number.parseInt(suffix, 10);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(suffix);
  return Number.isNaN(parsed) ? 0 : parsed;
};
/**
 * Legacy backups proven redundant: byte-identical to a retained copy or to a newer
 * backup. A backup with unique content may be the only copy and is never selected.
 */
export const findRedundantProgressBackups = (entries: StoredEntry[]): string[] => {
  const seen = new Set(entries.filter((entry) => isRetainedCopyKey(entry.key)).map((e) => e.value));
  const backups: BackupEntry[] = entries
    .filter((entry) => isBackupKey(entry.key))
    .map((entry) => ({ ...entry, createdAt: backupCreatedAt(entry.key) }))
    .sort((left, right) => right.createdAt - left.createdAt);
  return backups.flatMap((entry) => {
    if (seen.has(entry.value)) return [entry.key];
    seen.add(entry.value);
    return [];
  });
};
const removeRedundantBackups = (entries: StoredEntry[]): void => {
  const redundant = findRedundantProgressBackups(entries);
  redundant.forEach((key) => safeRemoveItem(key));
  logger.warn('[TarkovStore] localStorage quota low; removed only redundant progress backups', {
    removed: redundant.length,
  });
};
/**
 * Frees space before a progress write without deleting the only copy of any changes.
 * A write that still fails is reported through the local save status instead.
 */
export const relieveProgressStoragePressure = (neededBytes: number): void => {
  try {
    const entries = listStoredEntries();
    const limit = ESTIMATED_QUOTA_BYTES - QUOTA_SAFETY_BUFFER_BYTES;
    if (estimateUsage(entries) + neededBytes > limit) removeRedundantBackups(entries);
  } catch (error) {
    logger.error('[TarkovStore] Error managing localStorage quota:', error);
  }
};
