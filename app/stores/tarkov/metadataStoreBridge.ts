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
let knownDuplicateObjectiveIds = new Map<string, string[]>();
let progressHydrated = false;
const mergeDuplicateObjectiveIds = (
  target: Map<string, string[]>,
  source: Map<string, string[]>
): void => {
  source.forEach((newIds, originalId) => {
    const existing = target.get(originalId) ?? [];
    target.set(originalId, [...new Set([...existing, ...newIds])]);
  });
};
const flushPendingDuplicateObjectiveProgress = (): void => {
  if (!progressHydrated || !progressHooks || pendingDuplicateObjectiveIds.size === 0) return;
  mergeDuplicateObjectiveIds(knownDuplicateObjectiveIds, pendingDuplicateObjectiveIds);
  pendingDuplicateObjectiveIds = new Map();
  progressHooks.migrateDuplicateObjectiveProgress(new Map(knownDuplicateObjectiveIds));
};
export const registerTarkovMetadataHooks = (hooks: TarkovMetadataHooks): void => {
  tarkovHooks = hooks;
};
export const registerProgressMetadataHooks = (hooks: ProgressMetadataHooks): void => {
  progressHooks = hooks;
  flushPendingDuplicateObjectiveProgress();
};
export const markProgressMetadataHydrated = (): void => {
  const hadPendingMigrations = pendingDuplicateObjectiveIds.size > 0;
  progressHydrated = true;
  flushPendingDuplicateObjectiveProgress();
  if (!hadPendingMigrations && progressHooks && knownDuplicateObjectiveIds.size > 0) {
    progressHooks.migrateDuplicateObjectiveProgress(new Map(knownDuplicateObjectiveIds));
  }
};
export const resetProgressMetadataHydration = (options?: { preserveMetadata?: boolean }): void => {
  progressHydrated = false;
  pendingDuplicateObjectiveIds = new Map();
  if (options?.preserveMetadata === false) knownDuplicateObjectiveIds = new Map();
};
export const replayProgressMetadataMigration = (): void => {
  if (!progressHydrated || !progressHooks || knownDuplicateObjectiveIds.size === 0) return;
  progressHooks.migrateDuplicateObjectiveProgress(new Map(knownDuplicateObjectiveIds));
};
export const getMetadataGameMode = (): GameMode => tarkovHooks.getCurrentGameMode();
export const repairMetadataCompletedTaskObjectives = (): void =>
  tarkovHooks.repairCompletedTaskObjectives();
export const repairMetadataFailedTaskStates = (): void => tarkovHooks.repairFailedTaskStates();
export const migrateMetadataDuplicateObjectiveProgress = (
  duplicateObjectiveIds: Map<string, string[]>
): void => {
  mergeDuplicateObjectiveIds(knownDuplicateObjectiveIds, duplicateObjectiveIds);
  if (progressHooks && progressHydrated) {
    progressHooks.migrateDuplicateObjectiveProgress(new Map(knownDuplicateObjectiveIds));
    return;
  }
  duplicateObjectiveIds.forEach((newIds, originalId) => {
    const pendingIds = pendingDuplicateObjectiveIds.get(originalId) ?? [];
    pendingDuplicateObjectiveIds.set(originalId, [...new Set([...pendingIds, ...newIds])]);
  });
};
