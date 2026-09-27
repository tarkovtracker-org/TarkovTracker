import {
  parsePersistedProgressState,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
  setActiveProgressRetentionGuard,
  type PersistedProgressSnapshot,
  setActiveProgressWritesBlocked,
} from '@/stores/tarkov/localStorage';
import { saveSupersededProgressCopy } from '@/stores/tarkov/supersededProgress';
import { ACTIVE_SEASON_NUMBER } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { hasMaterializedProgress } from '@/utils/modeProgressFallback';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
import type { UserProgressData } from '@/stores/progressState';
/**
 * Account recovery copies (see `CONTEXT.md`): locally saved progress retained for its
 * owning account after sign-out or an account switch, restored only for that owner.
 */
const recoveryKey = (userId: string): string => `${STORAGE_KEYS.progressRecoveryPrefix}${userId}`;
let retentionFailure = false;
let blockedAccountOwner: string | null = null;
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
  const retained = hasNewerCopy(ownerId, raw) || writeRecoveryCopy(ownerId, raw);
  if (!retained) {
    retentionFailure = true;
    blockedAccountOwner = ownerId;
  } else if (blockedAccountOwner === ownerId) {
    retentionFailure = false;
    blockedAccountOwner = null;
    setActiveProgressWritesBlocked(false);
  }
  return retained;
};
export const retryBlockedAccountRecoveryRetention = (): boolean => {
  if (!blockedAccountOwner) return true;
  const active = safeGetItem(STORAGE_KEYS.progress);
  if (active && isOwnedBy(active, blockedAccountOwner)) {
    return saveAccountRecoveryCopy(active, blockedAccountOwner);
  }
  const recovery = safeGetItem(recoveryKey(blockedAccountOwner));
  return recovery ? saveAccountRecoveryCopy(recovery, blockedAccountOwner) : false;
};
export const isAccountRecoveryRetentionBlocked = (): boolean => retentionFailure;
export const markAccountRecoveryRetentionBlocked = (): void => {
  retentionFailure = true;
};
export const blockAccountRecoveryRetentionForOwner = (ownerId: string): void => {
  retentionFailure = true;
  blockedAccountOwner = ownerId;
};
export const resetAccountRecoveryRetentionBlock = (): void => {
  retentionFailure = false;
  blockedAccountOwner = null;
};
/** Explicit owner-scoped device-data removal is the only path that can discard a blocked copy. */
export const clearBlockedAccountRecoveryRetention = (ownerId: string): void => {
  if (blockedAccountOwner !== ownerId) return;
  retentionFailure = false;
  blockedAccountOwner = null;
  setActiveProgressWritesBlocked(false);
};
const preserveRawMismatchedSeason = (userId: string, raw: string): boolean => {
  const wrapped = parseUserScopedStorage<Record<string, unknown>>(raw);
  const data = wrapped?.data;
  const seasonal = data?.seasonal;
  const seasonNumber = data?.seasonalSeasonNumber;
  if (
    typeof seasonNumber !== 'number' ||
    seasonNumber === ACTIVE_SEASON_NUMBER ||
    !hasMaterializedProgress(seasonal)
  ) {
    return true;
  }
  const retained = saveSupersededProgressCopy(
    userId,
    'seasonal',
    seasonNumber,
    seasonal as UserProgressData
  );
  if (!retained) blockAccountRecoveryRetentionForOwner(userId);
  return retained !== null;
};
export const readAccountRecoveryCopy = (userId: string): PersistedProgressSnapshot | null => {
  const raw = safeGetItem(recoveryKey(userId));
  if (!raw || !preserveRawMismatchedSeason(userId, raw)) return null;
  const snapshot = parsePersistedProgressState(raw, userId);
  if (snapshot) {
    retentionFailure = false;
    setActiveProgressWritesBlocked(false);
  }
  return snapshot;
};
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
export const preserveForeignActiveCopy = (userId: string | null): boolean => {
  const raw = safeGetItem(STORAGE_KEYS.progress);
  const ownerId = raw ? (parseUserScopedStorage<unknown>(raw)?._userId ?? null) : null;
  if (!ownerId || ownerId === userId) return true;
  const retained = saveAccountRecoveryCopy(raw, ownerId);
  if (!retained) retentionFailure = true;
  return retained;
};
setActiveProgressRetentionGuard((current, next) => {
  if (!current) return true;
  const currentEnvelope = parseUserScopedStorage<unknown>(current);
  if (!currentEnvelope) return parsePersistedProgressState(current, null) !== null;
  const ownerId = currentEnvelope._userId;
  const nextOwnerId = next ? (parseUserScopedStorage<unknown>(next)?._userId ?? null) : null;
  if (!ownerId || ownerId === nextOwnerId) return true;
  const retained = saveAccountRecoveryCopy(current, ownerId);
  if (!retained) {
    retentionFailure = true;
    blockedAccountOwner = ownerId;
    setActiveProgressWritesBlocked(true);
  }
  return retained;
});
