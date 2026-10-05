import { defaultState, migrateToGameModeStructure, type UserState } from '@/stores/progressState';
import {
  blockAccountRecoveryRetentionForOwner,
  markAccountRecoveryRetentionBlocked,
  saveAccountRecoveryCopy,
} from '@/stores/tarkov/accountRecovery';
import {
  clearActiveProgressStorage,
  cloneStateSnapshot,
  progressPersistStorage,
  progressStorageSerializer,
  setActiveProgressWritesBlocked,
} from '@/stores/tarkov/localStorage';
import { hasRetainableModeProgress } from '@/stores/tarkov/progressMerge';
import { relieveProgressStoragePressure } from '@/stores/tarkov/storageQuota';
import { saveSupersededProgressCopy } from '@/stores/tarkov/supersededProgress';
import { ACTIVE_SEASON_NUMBER, GAME_MODES } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { sanitizeOwnedUserState } from '@/utils/progressSanitizers';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { getCurrentSupabaseUserId, parseUserScopedStorage } from '@/utils/userScopedStorage';
import type { StateTree } from 'pinia';
const QUOTA_CHECK_INTERVAL_MS = 60000;
let lastQuotaCheckTime = 0;
/** Throttled to one check per minute; the local save status reports any actual save failure. */
const manageQuota = (now: number, neededSpace: number): void => {
  if (now - lastQuotaCheckTime <= QUOTA_CHECK_INTERVAL_MS || typeof window === 'undefined') return;
  lastQuotaCheckTime = now;
  relieveProgressStoragePressure(neededSpace);
};
const hasMismatchedSeasonalProgress = (state: UserState): boolean =>
  typeof state.seasonalSeasonNumber === 'number' &&
  state.seasonalSeasonNumber !== ACTIVE_SEASON_NUMBER &&
  hasRetainableModeProgress(state.seasonal);
/** Retain stale-season progress before sanitizing drops it; throws when it cannot be kept. */
const preserveMismatchedSeasonalCopy = (ownerId: string | null, state: UserState): void => {
  if (!ownerId || !hasMismatchedSeasonalProgress(state)) return;
  const saved = saveSupersededProgressCopy(
    ownerId,
    GAME_MODES.SEASONAL,
    state.seasonalSeasonNumber as number,
    cloneStateSnapshot(state.seasonal)
  );
  if (saved) return;
  blockAccountRecoveryRetentionForOwner(ownerId);
  setActiveProgressWritesBlocked(true);
  throw new Error('Could not retain stale-season progress before sanitizing it');
};
const retainOrBlockForeignCopy = (raw: string, ownerId: string): void => {
  if (saveAccountRecoveryCopy(raw, ownerId)) {
    setActiveProgressWritesBlocked(false);
    void clearActiveProgressStorage();
    return;
  }
  markAccountRecoveryRetentionBlocked();
  setActiveProgressWritesBlocked(true);
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
      `Retaining it as that account's recovery copy and clearing the active copy.`
  );
  retainOrBlockForeignCopy(value, storedUserId);
  return structuredClone(defaultState);
};
const restoreScopedState = (value: string): UserState => {
  const wrapped = parseUserScopedStorage<UserState>(value);
  const currentUserId = getCurrentSupabaseUserId();
  if (!wrapped) return restoreLegacyFormat(value, currentUserId);
  const storedUserId = wrapped._userId;
  preserveMismatchedSeasonalCopy(storedUserId, wrapped.data);
  if (storedUserId === currentUserId) {
    return sanitizeOwnedUserState(migrateToGameModeStructure(wrapped.data));
  }
  // Until the session hydrates, an owned copy is not known to be foreign.
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
  storage: typeof window !== 'undefined' ? progressPersistStorage : undefined,
  serializer: { serialize, deserialize },
};
