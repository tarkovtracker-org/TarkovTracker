import {
  parsePersistedProgressState,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
  type PersistedProgressSnapshot,
} from '@/stores/tarkov/localStorage';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
/**
 * Account recovery copies (see `CONTEXT.md`): locally saved progress retained for its
 * owning account after sign-out or an account switch, restored only for that owner.
 */
const recoveryKey = (userId: string): string => `${STORAGE_KEYS.progressRecoveryPrefix}${userId}`;
const envelopeTimestamp = (raw: string | null): number | null => {
  const parsed = raw ? parseUserScopedStorage<unknown>(raw) : null;
  return parsed?._timestamp ?? null;
};
const isOwnedBy = (raw: string, ownerId: string): boolean =>
  parseUserScopedStorage<unknown>(raw)?._userId === ownerId;
/** An existing copy with a newer clock holds later changes and must not be replaced. */
const hasNewerCopy = (ownerId: string, raw: string): boolean => {
  const existing = envelopeTimestamp(safeGetItem(recoveryKey(ownerId)));
  return existing !== null && existing > (envelopeTimestamp(raw) ?? 0);
};
const writeRecoveryCopy = (ownerId: string, raw: string): boolean => {
  const saved = safeSetItem(recoveryKey(ownerId), raw);
  if (!saved) logger.error('[AccountRecovery] Could not retain the account recovery copy');
  return saved;
};
const isRetainable = (raw: string | null, ownerId: string | null): ownerId is string =>
  Boolean(raw && ownerId && isOwnedBy(raw, ownerId));
/**
 * Retains `raw` as `ownerId`'s recovery copy. Returns `true` when a confirmed copy
 * exists afterwards (written now or already newer), so callers may drop their copy.
 */
export const saveAccountRecoveryCopy = (raw: string | null, ownerId: string | null): boolean => {
  if (!raw || !isRetainable(raw, ownerId)) return false;
  return hasNewerCopy(ownerId, raw) || writeRecoveryCopy(ownerId, raw);
};
export const readAccountRecoveryCopy = (userId: string): PersistedProgressSnapshot | null =>
  parsePersistedProgressState(safeGetItem(recoveryKey(userId)), userId);
export const hasAccountRecoveryCopy = (userId: string): boolean =>
  safeGetItem(recoveryKey(userId)) !== null;
export const removeAccountRecoveryCopy = (userId: string): void => {
  safeRemoveItem(recoveryKey(userId));
};
/**
 * Chooses the local snapshot to reconcile at sign-in: the recovery copy wins only when
 * it is newer than the owner's active copy, because both descend from this browser.
 */
export const selectRecoverySnapshot = (
  recovery: PersistedProgressSnapshot | null,
  active: PersistedProgressSnapshot | null
): PersistedProgressSnapshot | null => {
  if (!recovery) return null;
  if (!active) return recovery;
  return (recovery.timestamp ?? 0) > (active.timestamp ?? 0) ? recovery : null;
};
/** Retains the active copy for its owner when it belongs to an account other than `userId`. */
export const preserveForeignActiveCopy = (userId: string | null): void => {
  const raw = safeGetItem(STORAGE_KEYS.progress);
  const ownerId = raw ? (parseUserScopedStorage<unknown>(raw)?._userId ?? null) : null;
  if (ownerId && ownerId !== userId) saveAccountRecoveryCopy(raw, ownerId);
};
