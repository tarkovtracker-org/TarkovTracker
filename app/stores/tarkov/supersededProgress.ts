import { safeGetItem, safeRemoveItem, safeSetItem } from '@/stores/tarkov/localStorage';
import { ACTIVE_SEASON_NUMBER, GAME_MODES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type { UserProgressData } from '@/stores/progressState';
export type SupersededProgressCopy = {
  id: string;
  ownerId: string;
  mode: GameMode;
  seasonNumber: number | null;
  supersededAt: number;
  progress: UserProgressData;
};
const ownerPrefix = (ownerId: string): string =>
  `${STORAGE_KEYS.progressSupersededPrefix}${ownerId}_`;
const copyKey = (copy: SupersededProgressCopy): string => `${ownerPrefix(copy.ownerId)}${copy.id}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const hasIdentity = (copy: Record<string, unknown>, ownerId: string): boolean =>
  copy.ownerId === ownerId && typeof copy.id === 'string';
const hasModeAndSeason = (copy: Record<string, unknown>): boolean =>
  (copy.mode === 'pvp' || copy.mode === 'pve' || copy.mode === 'seasonal') &&
  (copy.seasonNumber === null || typeof copy.seasonNumber === 'number');
const hasTimestampAndProgress = (copy: Record<string, unknown>): boolean =>
  typeof copy.supersededAt === 'number' && isRecord(copy.progress);
const isCopy = (value: unknown, ownerId: string): value is SupersededProgressCopy =>
  isRecord(value) &&
  hasIdentity(value, ownerId) &&
  hasModeAndSeason(value) &&
  hasTimestampAndProgress(value);
const storageKeys = (): string[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    return Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    ).filter((key): key is string => key !== null);
  } catch (error) {
    logger.error('[ProgressRecovery] Could not list superseded progress copies', error);
    return null;
  }
};
const notifyCopyChange = (): void => {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event('tt:superseded-progress-change'));
};
/** Reset clocks change on every restore, so two copies differing only in them hold the same progress. */
const comparableProgress = (progress: UserProgressData): string => {
  const { progressEpoch: _epoch, manualActivityEpoch: _manualEpoch, ...rest } = progress;
  return JSON.stringify(rest);
};
/**
 * Retains progress displaced by an intentional reset or a season change. Copies are never restored
 * automatically; the owner may export, restore (see isRestorableSupersededCopy) or discard them.
 */
export const saveSupersededProgressCopy = (
  ownerId: string,
  mode: GameMode,
  seasonNumber: number | null,
  progress: UserProgressData,
  supersededAt = Date.now()
): SupersededProgressCopy | null => {
  const existing = listSupersededProgressCopies(ownerId).find(
    (copy) =>
      copy.mode === mode &&
      copy.seasonNumber === (mode === 'seasonal' ? seasonNumber : null) &&
      comparableProgress(copy.progress) === comparableProgress(progress)
  );
  if (existing) return existing;
  const copy: SupersededProgressCopy = {
    id: `${supersededAt}_${Math.random().toString(36).slice(2)}`,
    ownerId,
    mode,
    seasonNumber: mode === 'seasonal' ? seasonNumber : null,
    supersededAt,
    progress,
  };
  if (safeSetItem(copyKey(copy), JSON.stringify(copy))) {
    notifyCopyChange();
    return copy;
  }
  logger.error('[ProgressRecovery] Could not retain superseded progress');
  return null;
};
/** Superseded copies are listed only for their owning account. */
export const listSupersededProgressCopies = (ownerId: string): SupersededProgressCopy[] =>
  (storageKeys() ?? [])
    .filter((key) => key.startsWith(ownerPrefix(ownerId)))
    .flatMap((key) => {
      const value = safeGetItem(key);
      try {
        const copy = value ? JSON.parse(value) : null;
        return isCopy(copy, ownerId) ? [copy] : [];
      } catch {
        return [];
      }
    })
    .sort((left, right) => left.supersededAt - right.supersededAt);
export const removeSupersededProgressCopies = (ownerId: string): boolean => {
  const keys = storageKeys();
  if (!keys) return false;
  const removed = keys
    .filter((key) => key.startsWith(ownerPrefix(ownerId)))
    .map((key) => safeRemoveItem(key))
    .every(Boolean);
  notifyCopyChange();
  return removed;
};
/** Deletes one of the owner's copies; true when it is gone (including when it was already gone). */
export const removeSupersededProgressCopy = (ownerId: string, copyId: string): boolean => {
  const removed = safeRemoveItem(`${ownerPrefix(ownerId)}${copyId}`);
  notifyCopyChange();
  return removed;
};
/** A Seasonal copy can only return to the season it was captured in; other modes have no season. */
export const isRestorableSupersededCopy = (
  copy: Pick<SupersededProgressCopy, 'mode' | 'seasonNumber'>
): boolean => copy.mode !== GAME_MODES.SEASONAL || copy.seasonNumber === ACTIVE_SEASON_NUMBER;
