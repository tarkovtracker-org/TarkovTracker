import { deepEqual } from '@/stores/tarkov/deepEqual';
import { GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import type { UserProgressData } from '@/stores/progressState';
export type ModeProgressMap = Partial<Record<GameMode, UserProgressData>>;
/**
 * Per-mode progress the server is known to hold for one account: loaded at startup or
 * acknowledged by a sync. A sync sends only modes that differ, so unchanged modes are never
 * re-uploaded and the payload stays within the server's size cap.
 */
let ownerId: string | null = null;
let acknowledged: ModeProgressMap = {};
let generation = 0;
const toWire = (progress: UserProgressData): UserProgressData =>
  JSON.parse(JSON.stringify(progress)) as UserProgressData;
export const clearAcknowledgedModes = (): void => {
  generation += 1;
  ownerId = null;
  acknowledged = {};
};
/** Records modes the server holds for `userId`; another owner's baseline is replaced. */
export const recordAcknowledgedModes = (userId: string, modes: ModeProgressMap): void => {
  if (ownerId !== userId) {
    ownerId = userId;
    acknowledged = {};
  }
  for (const mode of GAME_MODE_VALUES) {
    const progress = modes[mode];
    if (progress) acknowledged[mode] = toWire(progress);
  }
};
/**
 * Starts a multi-request sync: the returned callback records each acknowledged batch and returns
 * `false` once the baseline was cleared (sign-out, account switch, reload), so the sync stops.
 */
export const beginAcknowledgement = (userId: string) => {
  const started = generation;
  return (modes: ModeProgressMap): boolean => {
    if (generation !== started) return false;
    recordAcknowledgedModes(userId, modes);
    return true;
  };
};
/** Modes whose progress differs from what the server is known to hold; unknown modes differ. */
export const selectChangedModes = (userId: string, modes: ModeProgressMap): ModeProgressMap => {
  const known = ownerId === userId ? acknowledged : {};
  const differs = (mode: GameMode): boolean => {
    const progress = modes[mode];
    return progress !== undefined && !deepEqual(known[mode], toWire(progress));
  };
  return Object.fromEntries(GAME_MODE_VALUES.filter(differs).map((mode) => [mode, modes[mode]]));
};
