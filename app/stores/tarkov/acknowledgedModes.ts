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
const revisions: Partial<Record<GameMode, number>> = {};
const toWire = (progress: UserProgressData): UserProgressData =>
  JSON.parse(JSON.stringify(progress)) as UserProgressData;
export const clearAcknowledgedModes = (): void => {
  generation += 1;
  ownerId = null;
  acknowledged = {};
};
/** Replacing another owner's baseline invalidates that owner's in-flight acknowledgements. */
const claimOwner = (userId: string): void => {
  if (ownerId === userId) return;
  generation += 1;
  ownerId = userId;
  acknowledged = {};
};
/** Records modes the server holds for `userId`; another owner's baseline is replaced. */
export const recordAcknowledgedModes = (userId: string, modes: ModeProgressMap): void => {
  claimOwner(userId);
  for (const mode of GAME_MODE_VALUES) {
    const progress = modes[mode];
    if (!progress) continue;
    acknowledged[mode] = toWire(progress);
    revisions[mode] = (revisions[mode] ?? 0) + 1;
  }
};
/**
 * Starts a multi-request sync. `acknowledge` records each acknowledged batch and returns `false`
 * once the baseline was cleared or claimed by another account, so the sync stops. `unchanged` drops
 * modes acknowledged elsewhere (Realtime) since the sync began, so a stale snapshot never overwrites
 * newer server progress; the store merge that follows schedules the next sync.
 */
export const beginAcknowledgement = (userId: string) => {
  claimOwner(userId);
  const started = generation;
  const startRevisions = { ...revisions };
  const isUnchanged = (mode: string): boolean =>
    revisions[mode as GameMode] === startRevisions[mode as GameMode];
  return {
    unchanged: (modes: ModeProgressMap): ModeProgressMap =>
      Object.fromEntries(Object.entries(modes).filter(([mode]) => isUnchanged(mode))),
    acknowledge: (modes: ModeProgressMap): boolean => {
      if (generation !== started) return false;
      recordAcknowledgedModes(userId, modes);
      return true;
    },
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
