import { GAME_MODES, type GameMode } from '@/utils/constants';
type TarkovMetadataHooks = {
  getCurrentGameMode: () => GameMode;
  repairCompletedTaskObjectives: () => void;
  repairFailedTaskStates: () => void;
};
type ProgressMetadataHooks = {
  migrateDuplicateObjectiveProgress: (duplicateObjectiveIds: Map<string, string[]>) => void;
};
let tarkovHooks: TarkovMetadataHooks = {
  getCurrentGameMode: () => GAME_MODES.PVP,
  repairCompletedTaskObjectives: () => undefined,
  repairFailedTaskStates: () => undefined,
};
let progressHooks: ProgressMetadataHooks | null = null;
let pendingDuplicateObjectiveIds = new Map<string, string[]>();
let progressHydrated = false;
const flushPendingDuplicateObjectiveProgress = (): void => {
  if (!progressHydrated || !progressHooks || pendingDuplicateObjectiveIds.size === 0) return;
  const pending = pendingDuplicateObjectiveIds;
  pendingDuplicateObjectiveIds = new Map();
  progressHooks.migrateDuplicateObjectiveProgress(pending);
};
export const registerTarkovMetadataHooks = (hooks: TarkovMetadataHooks): void => {
  tarkovHooks = hooks;
};
export const registerProgressMetadataHooks = (hooks: ProgressMetadataHooks): void => {
  progressHooks = hooks;
  flushPendingDuplicateObjectiveProgress();
};
export const markProgressMetadataHydrated = (): void => {
  progressHydrated = true;
  flushPendingDuplicateObjectiveProgress();
};
export const getMetadataGameMode = (): GameMode => tarkovHooks.getCurrentGameMode();
export const repairMetadataCompletedTaskObjectives = (): void =>
  tarkovHooks.repairCompletedTaskObjectives();
export const repairMetadataFailedTaskStates = (): void => tarkovHooks.repairFailedTaskStates();
export const migrateMetadataDuplicateObjectiveProgress = (
  duplicateObjectiveIds: Map<string, string[]>
): void => {
  if (progressHooks && progressHydrated) {
    progressHooks.migrateDuplicateObjectiveProgress(duplicateObjectiveIds);
    return;
  }
  duplicateObjectiveIds.forEach((newIds, originalId) => {
    const pendingIds = pendingDuplicateObjectiveIds.get(originalId) ?? [];
    pendingDuplicateObjectiveIds.set(originalId, [...new Set([...pendingIds, ...newIds])]);
  });
};
