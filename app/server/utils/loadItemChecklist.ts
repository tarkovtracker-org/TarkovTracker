import { useGraphBuilder } from '@/composables/useGraphBuilder';
import { isCurrencyItemId } from '@/utils/constants';
import { SEO_ORIGIN } from '@/utils/routeSeo';
import { normalizeTaskObjectives } from '@/utils/taskNormalization';
import type {
  TaskObjective,
  TarkovHideoutQueryResult,
  TarkovItemsQueryResult,
  TarkovTaskObjectivesQueryResult,
  TarkovTasksCoreQueryResult,
  TarkovItem,
} from '@/types/tarkov';
interface Row {
  name: string;
  count: number;
  fir?: boolean;
  optional?: boolean;
}
interface Group {
  source: string;
  level?: number;
  rows: Row[];
}
// Builds have no private overlay bindings. Use the corrected public catalogs,
// with no player ID, credentials, or incoming request headers.
async function catalog<T>(path: string) {
  const response = await $fetch<{ data: T }>(`${SEO_ORIGIN}/api/tarkov/${path}`, {
    query: { gameMode: 'pvp', lang: 'en' },
    timeout: 20000,
    retry: 1,
  });
  return response.data;
}
const bySource = (a: Group, b: Group) =>
  a.source.localeCompare(b.source, 'en') || (a.level ?? 0) - (b.level ?? 0);
type ItemName = (item: TarkovItem) => string | undefined;
function taskChecklist(
  core: TarkovTasksCoreQueryResult,
  objectives: TarkovTaskObjectivesQueryResult,
  itemName: ItemName
): Group[] {
  const needs = useGraphBuilder().processTaskRelationships(objectives.tasks).tempNeededObjectives;
  const byTask = Map.groupBy(needs, (need) => need.taskId);
  const details = new Map(
    objectives.tasks.map((task) => [
      task.id,
      normalizeTaskObjectives<TaskObjective>(task.objectives),
    ])
  );
  return core.tasks
    .flatMap((task) => {
      const objectivesById = new Map(
        details.get(task.id)?.map((objective) => [objective.id, objective])
      );
      const rows = (byTask.get(task.id) ?? []).flatMap((need) => {
        const objective = objectivesById.get(need.sourceObjectiveId ?? need.id);
        // Some hand-ins accept thousands of alternatives. The game's objective
        // describes the shared condition and carries its weapon/build restrictions.
        const name = need.acceptedItems ? objective?.description : itemName(need.item);
        return name
          ? [{ name, count: need.count, fir: need.foundInRaid, optional: objective?.optional }]
          : [];
      });
      return task.name && rows.length ? [{ source: task.name, rows }] : [];
    })
    .sort(bySource);
}
function hideoutChecklist(hideout: TarkovHideoutQueryResult, itemName: ItemName): Group[] {
  const stationNames = new Map(
    hideout.hideoutStations.map((station) => [station.id, station.name])
  );
  const needs = useGraphBuilder().processHideoutData(
    hideout.hideoutStations
  ).neededItemHideoutModules;
  const byLevel = Map.groupBy(needs, (need) => need.hideoutModule.id);
  return Array.from(byLevel.values())
    .flatMap((requirements) => {
      const { stationId, level } = requirements[0]!.hideoutModule;
      const source = stationNames.get(stationId);
      const rows = requirements.flatMap((need) => {
        const name = itemName(need.item);
        return name && !isCurrencyItemId(need.item.id)
          ? [{ name, count: need.count, fir: need.foundInRaid }]
          : [];
      });
      return source && rows.length ? [{ source, level, rows }] : [];
    })
    .sort(bySource);
}
export async function loadItemChecklist() {
  const [core, objectives, items, hideout] = await Promise.all([
    catalog<TarkovTasksCoreQueryResult>('tasks-core'),
    catalog<TarkovTaskObjectivesQueryResult>('tasks-objectives'),
    catalog<TarkovItemsQueryResult>('items-lite'),
    catalog<TarkovHideoutQueryResult>('hideout'),
  ]);
  const names = new Map(items.items.map((item) => [item.id, item.name]));
  const itemName = (item: TarkovItem) => names.get(item.id) ?? item.name;
  const tasks = taskChecklist(core, objectives, itemName);
  const stations = hideoutChecklist(hideout, itemName);
  if (!tasks.length || !stations.length) throw new Error('Empty public item checklist');
  return { tasks, hideout: stations };
}
