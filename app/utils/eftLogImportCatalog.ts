import { isFetchSuccess, type FetchResponse } from '@/stores/tarkov/fetchResponse';
import { API_GAME_MODES, type GameMode } from '@/utils/constants';
import { dedupeTaskObjectiveIds, normalizeTaskObjectives } from '@/utils/taskNormalization';
import type {
  Task,
  TaskObjective,
  TarkovTaskObjectivesQueryResult,
  TarkovTasksCoreQueryResult,
} from '@/types/tarkov';
/** Rejects failed or malformed metadata responses before any progress can be changed. */
function requireCatalogTasks<T extends { tasks: unknown[] }>(
  response: FetchResponse<T>
): T['tasks'] {
  if (!isFetchSuccess<T>(response) || !Array.isArray(response.data?.tasks)) {
    throw new Error('Task metadata could not be loaded for log import.');
  }
  return response.data.tasks;
}
// Read isolated snapshots: switching the UI mode does not await metadata hydration.
/** Loads an isolated destination catalog and normalizes objective IDs exactly as metadata hydration does. */
export async function loadEftImportTaskCatalog(mode: GameMode): Promise<Task[]> {
  const query = { gameMode: API_GAME_MODES[mode], lang: 'en' };
  const [core, objectives] = await Promise.all([
    $fetch<FetchResponse<TarkovTasksCoreQueryResult>>('/api/tarkov/tasks-core', {
      query,
      timeout: 15000,
    }),
    $fetch<FetchResponse<TarkovTaskObjectivesQueryResult>>('/api/tarkov/tasks-objectives', {
      query: { ...query, version: 'json-v3' },
      timeout: 15000,
    }),
  ]);
  const coreTasks = requireCatalogTasks(core);
  const objectiveTasks = requireCatalogTasks(objectives);
  if (!coreTasks.length) throw new Error('Task metadata could not be loaded for log import.');
  const byId = new Map(objectiveTasks.map((task) => [task.id, task]));
  const tasks = coreTasks.map((task) => {
    const details = byId.get(task.id);
    if (!details) throw new Error('Task objectives are incomplete for log import.');
    return {
      ...task,
      ...details,
      objectives: normalizeTaskObjectives<TaskObjective>(details.objectives),
    };
  });
  return dedupeTaskObjectiveIds(tasks).tasks;
}
