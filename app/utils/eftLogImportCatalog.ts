import { API_GAME_MODES, type GameMode } from '@/utils/constants';
import { tarkovApiFetch } from '@/utils/tarkovApiFetch';
import { isTaskImportCatalog, type TaskImportCatalogPayload } from '@/utils/taskImportCatalog';
import { dedupeTaskObjectiveIds, normalizeTaskObjectives } from '@/utils/taskNormalization';
import type { Task, TaskObjective } from '@/types/tarkov';
/** Loads a whole destination snapshot independently of UI hydration and mode switches. */
export async function loadEftImportTaskCatalog(mode: GameMode): Promise<Task[]> {
  const gameMode = API_GAME_MODES[mode];
  const response = await tarkovApiFetch<TaskImportCatalogPayload>('/api/tarkov/tasks-import', {
    query: { gameMode },
    cache: 'no-store',
    timeout: 15000,
  });
  if (!isTaskImportCatalog(response, gameMode))
    throw new Error('Task metadata could not be loaded for log import.');
  const tasks = response.data.tasks.map((task) => ({
    ...task,
    objectives: normalizeTaskObjectives<TaskObjective>(task.objectives),
  }));
  return dedupeTaskObjectiveIds(tasks).tasks;
}
