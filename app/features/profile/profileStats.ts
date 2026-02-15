import { SPECIAL_STATIONS } from '@/utils/constants';
import type { UserProgressData } from '@/stores/progressState';
import type { GameEdition, HideoutStation, Task } from '@/types/tarkov';
type TaskStatus = {
  complete?: boolean;
  failed?: boolean;
};
const isTaskStatusSuccessful = (status: TaskStatus | undefined): boolean =>
  status?.complete === true && status?.failed !== true;
const isTaskStatusFailed = (status: TaskStatus | undefined): boolean => status?.failed === true;
const isTaskCounted = (status: TaskStatus | undefined, isInvalid: boolean): boolean => {
  if (isTaskStatusSuccessful(status)) {
    return true;
  }
  if (isTaskStatusFailed(status)) {
    return false;
  }
  return !isInvalid;
};
export const getCountedTasks = (
  tasks: Task[],
  taskStatuses: Record<string, TaskStatus>,
  invalidTasks: Record<string, boolean>
): Task[] =>
  tasks.filter((task) => isTaskCounted(taskStatuses[task.id], invalidTasks[task.id] === true));
export const buildHideoutModuleCompletionState = (
  stations: HideoutStation[],
  hideoutModules: UserProgressData['hideoutModules'],
  edition: Pick<GameEdition, 'defaultCultistCircleLevel' | 'defaultStashLevel'> | undefined
): Record<string, boolean> => {
  const completionState: Record<string, boolean> = {};
  for (const station of stations) {
    const maxLevel = station.levels?.length ?? 0;
    const defaultStashLevel =
      station.normalizedName === SPECIAL_STATIONS.STASH
        ? Math.min(edition?.defaultStashLevel ?? 0, maxLevel)
        : 0;
    const defaultCultistCircleLevel =
      station.normalizedName === SPECIAL_STATIONS.CULTIST_CIRCLE
        ? Math.min(edition?.defaultCultistCircleLevel ?? 0, maxLevel)
        : 0;
    for (const level of station.levels ?? []) {
      if (!level?.id) {
        continue;
      }
      const isManualComplete = hideoutModules[level.id]?.complete === true;
      const isAutoCompleteFromEdition =
        (station.normalizedName === SPECIAL_STATIONS.STASH && level.level <= defaultStashLevel) ||
        (station.normalizedName === SPECIAL_STATIONS.CULTIST_CIRCLE &&
          level.level <= defaultCultistCircleLevel);
      completionState[level.id] = isManualComplete || isAutoCompleteFromEdition;
    }
  }
  return completionState;
};
