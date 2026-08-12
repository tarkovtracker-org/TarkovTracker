import { computeInvalidProgress } from './invalidation';
import type {
  UserProgressData,
  UserProgressModeRow,
  TarkovTask,
  TarkovHideoutStation,
  ProgressResponseData,
  ProgressResponseTask,
  ProgressResponseObjective,
  ProgressResponseHideoutModule,
  ProgressResponseHideoutPart,
} from '../types';
const STASH_STATION_ID = '5d484fc0654e76006657e0ab';
const CULTIST_CIRCLE_STATION_ID = '667298e75ea6b4493c08f266';
/**
 * Extract game mode specific data from user progress row
 */
export function extractGameModeData(row: UserProgressModeRow | null): UserProgressData | null {
  if (!row) return null;
  return row.progress_data ?? null;
}
/**
 * Apply hideout auto-complete based on game edition
 */
function applyHideoutAutoComplete(
  hideoutModules: ProgressResponseHideoutModule[],
  hideoutParts: ProgressResponseHideoutPart[],
  hideoutStations: TarkovHideoutStation[],
  gameEdition: number
): void {
  const stashStation = hideoutStations.find((s) => s.id === STASH_STATION_ID);
  stashStation?.levels?.forEach((level) => {
    if (level.level <= gameEdition) {
      markModuleComplete(hideoutModules, level.id);
      level.itemRequirements?.forEach((item) => {
        markPartComplete(hideoutParts, item.id, item.count);
      });
    }
  });
  // Unheard Edition (5 or 6) gets Cultist Circle
  if (gameEdition >= 5) {
    const cultistCircle = hideoutStations.find((s) => s.id === CULTIST_CIRCLE_STATION_ID);
    cultistCircle?.levels?.forEach((level) => {
      markModuleComplete(hideoutModules, level.id);
      level.itemRequirements?.forEach((item) => {
        markPartComplete(hideoutParts, item.id, item.count);
      });
    });
  }
}
function markModuleComplete(modules: ProgressResponseHideoutModule[], id: string): void {
  const existing = modules.find((m) => m.id === id);
  if (existing) {
    existing.complete = true;
  } else {
    modules.push({ id, complete: true });
  }
}
function markPartComplete(parts: ProgressResponseHideoutPart[], id: string, count: number): void {
  const existing = parts.find((p) => p.id === id);
  if (existing) {
    existing.complete = true;
    existing.count = count;
  } else {
    parts.push({ id, complete: true, count });
  }
}
/**
 * Transform user progress to API response format
 */
export function transformProgress(
  progressData: UserProgressData | null,
  userId: string,
  gameEdition: number,
  tasks: TarkovTask[],
  hideoutStations: TarkovHideoutStation[],
  fallbackDisplayName?: string | null
): ProgressResponseData {
  const pmcFaction = progressData?.pmcFaction ?? 'USEC';
  const taskCompletions = progressData?.taskCompletions ?? {};
  // Compute invalid tasks/objectives
  const { invalidTasks, invalidObjectives } = computeInvalidProgress({
    tasks,
    taskCompletions,
    pmcFaction,
  });
  // Transform tasks to array format
  const tasksProgress: ProgressResponseTask[] = Object.entries(taskCompletions).map(
    ([id, data]) => {
      const entry: ProgressResponseTask = {
        id,
        complete: data.complete === true && data.failed !== true,
      };
      if (invalidTasks[id]) {
        entry.invalid = true;
      }
      if (data.failed === true) {
        entry.failed = true;
      }
      if (typeof data.active === 'boolean') {
        entry.active = data.active;
      } else if (data.complete === true || data.failed === true) {
        entry.active = false;
      }
      return entry;
    }
  );
  // Transform objectives to array format
  const taskObjectivesProgress: ProgressResponseObjective[] = Object.entries(
    progressData?.taskObjectives ?? {}
  ).map(([id, data]) => {
    const entry: ProgressResponseObjective = {
      id,
      complete: data.complete === true,
    };
    if (typeof data.count === 'number' && data.count > 0) {
      entry.count = data.count;
    }
    if (invalidObjectives[id]) {
      entry.invalid = true;
    }
    return entry;
  });
  // Transform hideout modules
  const hideoutModulesProgress: ProgressResponseHideoutModule[] = Object.entries(
    progressData?.hideoutModules ?? {}
  ).map(([id, data]) => ({
    id,
    complete: data.complete === true,
  }));
  // Transform hideout parts
  const hideoutPartsProgress: ProgressResponseHideoutPart[] = Object.entries(
    progressData?.hideoutParts ?? {}
  ).map(([id, data]) => {
    const entry: ProgressResponseHideoutPart = {
      id,
      complete: data.complete === true,
    };
    if (typeof data.count === 'number' && data.count > 0) {
      entry.count = data.count;
    }
    return entry;
  });
  // Apply hideout auto-complete based on game edition
  applyHideoutAutoComplete(
    hideoutModulesProgress,
    hideoutPartsProgress,
    hideoutStations,
    gameEdition
  );
  const displayName =
    (typeof progressData?.displayName === 'string' && progressData.displayName.trim()
      ? progressData.displayName.trim()
      : null) ||
    fallbackDisplayName ||
    userId.substring(0, 6);
  return {
    tasksProgress,
    taskObjectivesProgress,
    hideoutModulesProgress,
    hideoutPartsProgress,
    displayName,
    userId,
    playerLevel: progressData?.level ?? 1,
    gameEdition,
    pmcFaction,
  };
}
