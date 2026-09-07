import { isFetchSuccess, type FetchResponse } from '@/stores/tarkov/fetchResponse';
import { API_GAME_MODES, type GameMode } from '@/utils/constants';
import { dedupeTaskObjectiveIds, normalizeTaskObjectives } from '@/utils/taskNormalization';
import type {
  Task,
  TaskObjective,
  TarkovTaskObjectivesQueryResult,
  TarkovTasksCoreQueryResult,
} from '@/types/tarkov';
// Read isolated snapshots: switching the UI mode does not await metadata hydration.
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
  if (
    !isFetchSuccess<TarkovTasksCoreQueryResult>(core) ||
    !Array.isArray(core.data?.tasks) ||
    !core.data.tasks.length ||
    !isFetchSuccess<TarkovTaskObjectivesQueryResult>(objectives) ||
    !Array.isArray(objectives.data?.tasks)
  ) {
    throw new Error('Task metadata could not be loaded for log import.');
  }
  const byId = new Map(objectives.data.tasks.map((task) => [task.id, task]));
  const tasks = core.data.tasks.map((task) => {
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
