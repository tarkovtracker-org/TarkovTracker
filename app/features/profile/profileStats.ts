import { getEditionStationDefault } from '@/utils/editionHelpers';
import { isTaskCounted } from '@/utils/taskStatus';
import type { UserProgressData } from '@/stores/progressState';
import type { GameEdition, HideoutStation, Task } from '@/types/tarkov';
import type { RawTaskCompletion } from '@/utils/taskStatus';
export const getCountedTasks = (
  tasks: Task[],
  taskStatuses: Record<string, RawTaskCompletion>,
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
    const levels = station.levels ?? [];
    const editionLevel = getEditionStationDefault(station.normalizedName, levels.length, edition);
    for (const level of levels) {
      if (!level?.id) {
        continue;
      }
      const isManualComplete = hideoutModules[level.id]?.complete === true;
      const isAutoCompleteFromEdition = editionLevel !== null && level.level <= editionLevel;
      completionState[level.id] = isManualComplete || isAutoCompleteFromEdition;
    }
  }
  return completionState;
};
