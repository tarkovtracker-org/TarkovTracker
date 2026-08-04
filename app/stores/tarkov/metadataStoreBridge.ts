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
let progressHooks: ProgressMetadataHooks = {
  migrateDuplicateObjectiveProgress: () => undefined,
};
export const registerTarkovMetadataHooks = (hooks: TarkovMetadataHooks): void => {
  tarkovHooks = hooks;
};
export const registerProgressMetadataHooks = (hooks: ProgressMetadataHooks): void => {
  progressHooks = hooks;
};
export const getMetadataGameMode = (): GameMode => tarkovHooks.getCurrentGameMode();
export const repairMetadataCompletedTaskObjectives = (): void =>
  tarkovHooks.repairCompletedTaskObjectives();
export const repairMetadataFailedTaskStates = (): void => tarkovHooks.repairFailedTaskStates();
export const migrateMetadataDuplicateObjectiveProgress = (
  duplicateObjectiveIds: Map<string, string[]>
): void => progressHooks.migrateDuplicateObjectiveProgress(duplicateObjectiveIds);
