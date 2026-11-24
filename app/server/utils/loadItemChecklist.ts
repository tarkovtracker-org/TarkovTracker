import { useGraphBuilder } from '@/composables/useGraphBuilder';
import { neededCountOf } from '@/features/neededitems/neededItemFilters';
import { isCurrencyItemId } from '@/utils/constants';
import { inferNewBeginningPrestigeLevel } from '@/utils/prestige';
import { normalizeTaskObjectives } from '@/utils/taskNormalization';
import type {
  Task,
  TaskObjective,
  NeededItemTaskObjective,
  TarkovHideoutQueryResult,
  TarkovItemsQueryResult,
  TarkovTaskObjectivesQueryResult,
  TarkovTasksCoreQueryResult,
  TarkovItem,
} from '@/types/tarkov';
import { fetchPublicPvpCatalogs } from '~/server/utils/publicPvpCatalog';
interface Row {
  name: string;
  count: number;
  fir?: boolean;
  optional?: boolean;
}
interface Group {
  id: string;
  faction?: string;
  prestige?: number | null;
  source: string;
  level?: number;
  rows: Row[];
}
const bySource = (a: Group, b: Group) =>
  a.source.localeCompare(b.source, 'en') || (a.level ?? 0) - (b.level ?? 0);
type ItemName = (item: TarkovItem) => string | undefined;
function poolLabel(items: TarkovItem[], itemName: ItemName) {
  const names = items.map(itemName).filter(Boolean);
  const examples = names.slice(0, 3).join(' / ');
  return names.length > 3 ? `${examples} / …` : examples;
}
function questItemLabel(
  need: NeededItemTaskObjective,
  description: string | undefined,
  itemName: ItemName
) {
  if (!need.acceptedItems) return itemName(need.item);
  return description?.trim() || poolLabel(need.acceptedItems, itemName) || itemName(need.item);
}
function questRow(
  need: NeededItemTaskObjective,
  objective: TaskObjective | undefined,
  itemName: ItemName
): Row[] {
  // An objective can accept thousands of alternatives. Its description gives
  // the shared condition without listing every eligible item.
  const { description, optional } = objective ?? {};
  const name = questItemLabel(need, description, itemName);
  return name ? [{ name, count: neededCountOf(need), fir: need.foundInRaid, optional }] : [];
}
function questGroup(task: Task, rows: Row[]): Group[] {
  if (!task.name || !rows.length) return [];
  const faction = task.factionName === 'Any' ? undefined : task.factionName;
  return [
    {
      id: task.id,
      source: task.name,
      faction,
      prestige: inferNewBeginningPrestigeLevel(task),
      rows,
    },
  ];
}
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
        return questRow(need, objective, itemName);
      });
      return questGroup(task, rows);
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
      const { id, stationId, level } = requirements[0]!.hideoutModule;
      const source = stationNames.get(stationId);
      const rows = requirements.flatMap((need) => {
        const name = itemName(need.item);
        return name && !isCurrencyItemId(need.item.id)
          ? [{ name, count: neededCountOf(need), fir: need.foundInRaid }]
          : [];
      });
      return source && rows.length ? [{ id, source, level, rows }] : [];
    })
    .sort(bySource);
}
export async function loadItemChecklist() {
  const [core, objectives, items, hideout] = await fetchPublicPvpCatalogs<
    [
      TarkovTasksCoreQueryResult,
      TarkovTaskObjectivesQueryResult,
      TarkovItemsQueryResult,
      TarkovHideoutQueryResult,
    ]
  >(['tasks-core', 'tasks-objectives', 'items-lite', 'hideout']);
  const names = new Map(items.items.map((item) => [item.id, item.name]));
  const itemName = (item: TarkovItem) => names.get(item.id) ?? item.name;
  const tasks = taskChecklist(core, objectives, itemName);
  const stations = hideoutChecklist(hideout, itemName);
  if (!tasks.length || !stations.length) throw new Error('Empty public item checklist');
  return { tasks, hideout: stations };
}
