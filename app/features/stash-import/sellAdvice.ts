import { objectiveEquipmentItems } from '@/utils/objectiveEquipment';
import { overlapsRegion } from '@/utils/stashScan/regions';
import { reviewState } from '@/utils/stashScan/review';
import { SCAN_LIMITS } from '@/utils/stashScan/types';
import type { HideoutModule, TarkovItem, Task, TaskObjective } from '@/types/tarkov';
import type { ReviewedCell, ScanItem } from '@/utils/stashScan/types';
export interface SellProgress {
  isTaskComplete: (id: string) => boolean;
  isTaskFailed: (id: string) => boolean;
  isTaskObjectiveComplete: (id: string) => boolean;
  isHideoutModuleComplete: (id: string) => boolean;
}
export interface SellGroup {
  itemId: string;
  name: string;
  quantity: number;
  cell: ReviewedCell['cell'];
}
const REGULAR_ITEM_OBJECTIVES = ['giveItem', 'findItem', 'plantItem', 'place', 'sellItem'];
const QUEST_ITEM_OBJECTIVES = ['findQuestItem', 'giveQuestItem', 'plantQuestItem'];
const OTHER_OBJECTIVES = new Set([
  'dialogue',
  'experience',
  'extract',
  'globalVariable',
  'hideoutStationLevel',
  'key',
  'playerLevel',
  'shoot',
  'skill',
  'taskStatus',
  'traderLevel',
  'traderStanding',
  'visit',
]);
const regularItems = (objective: TaskObjective) => [
  ...(objective.item ? [objective.item] : []),
  ...(objective.items ?? []),
];
const questItems = (objective: TaskObjective) => (objective.questItem ? [objective.questItem] : []);
const markers = (objective: TaskObjective) => (objective.markerItem ? [objective.markerItem] : []);
const knownId = (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0;
const knownItem = (item: TarkovItem) => knownId(item?.id);
const hasQuestItem = (objective: TaskObjective) =>
  objective.questInventoryOnly === true || questItems(objective).some(knownItem);
const hasRegularItem = (objective: TaskObjective) => regularItems(objective).some(knownItem);
const validItemRequirement = new Map<string, (objective: TaskObjective) => boolean>([
  ...REGULAR_ITEM_OBJECTIVES.map((type) => [type, hasRegularItem] as const),
  ...QUEST_ITEM_OBJECTIVES.map((type) => [type, hasQuestItem] as const),
  ['buildWeapon', (objective) => knownId(objective.item?.id)],
  ['craft', (objective) => (objective.items ?? []).some(knownItem)],
  ['mark', (objective) => markers(objective).some(knownItem)],
  [
    'useItem',
    (objective) => [...regularItems(objective), ...(objective.useAny ?? [])].some(knownItem),
  ],
]);
/** Read all positive references. The presentation helper caps some pools. */
const objectiveItems = (objective: TaskObjective): TarkovItem[] => [
  ...regularItems(objective),
  ...questItems(objective),
  ...(objective.type === 'mark' ? markers(objective) : []),
  ...(objective.containsAll ?? []),
  ...(objective.useAny ?? []),
  ...objectiveEquipmentItems(objective.usingWeapon),
  ...objectiveEquipmentItems(objective.usingWeaponMods),
  ...objectiveEquipmentItems(objective.wearing),
  ...(objective.requiredKeys ?? []).flat(),
];
function knownObjectiveType(objective: TaskObjective, type: string): boolean {
  const validate = validItemRequirement.get(type);
  return validate ? validate(objective) : OTHER_OBJECTIVES.has(type);
}
function knownCategories(categories: string[] | undefined): boolean {
  if (categories === undefined) return true;
  return Array.isArray(categories) && categories.every(knownId);
}
function knownObjective(objective: TaskObjective): boolean {
  if (!objective) return false;
  return [
    knownId(objective.id),
    knownObjectiveType(objective, objective.type ?? ''),
    objectiveItems(objective).every(knownItem),
    knownCategories(objective.containsCategory),
  ].every(Boolean);
}
const knownModule = (module: HideoutModule) => Array.isArray(module.itemRequirements);
const finishedTask = (task: Task, progress: SellProgress) =>
  progress.isTaskComplete(task.id) && !progress.isTaskFailed(task.id);
const remainingObjectives = (task: Task, progress: SellProgress) =>
  progress.isTaskFailed(task.id)
    ? task.objectives!
    : task.objectives!.filter((entry) => !progress.isTaskObjectiveComplete(entry?.id));
const taskKeys = (task: Task): TarkovItem[] =>
  (task.requiredKeys ?? []).flatMap((group) => group?.keys);
const moduleItems = (module: HideoutModule, progress: SellProgress) =>
  progress.isHideoutModuleComplete(module.id)
    ? []
    : module.itemRequirements.map((requirement) => requirement?.item);
function knownTask(task: Task, progress: SellProgress): boolean {
  if (finishedTask(task, progress)) return true;
  if (!Array.isArray(task.objectives) || !task.objectives.length) return false;
  return remainingObjectives(task, progress).every(knownObjective);
}
export const incompleteSellTasks = (tasks: Task[], progress: SellProgress): Task[] =>
  tasks.filter((task) => !knownTask(task, progress));
const knownCatalog = (tasks: Task[], modules: HideoutModule[], progress: SellProgress) =>
  [!incompleteSellTasks(tasks, progress).length, modules.every(knownModule)].every(Boolean);
/**
 * Full catalog membership, independent of Needed Items filters and import eligibility.
 * Collected counts are deliberately ignored: they do not prove hand-in or physical surplus.
 * undefined means evidence is incomplete, never an empty set of requirements.
 */
export function remainingSellUses(
  tasks: Task[],
  modules: HideoutModule[],
  progress: SellProgress
): { itemIds: ReadonlySet<string>; categoryIds: ReadonlySet<string> } | undefined {
  if (!knownCatalog(tasks, modules, progress)) return undefined;
  // Pending, hidden, failed-branch and conditionally eligible tasks all remain protected.
  const unfinishedTasks = tasks.filter((task) => !finishedTask(task, progress));
  const objectives = unfinishedTasks.flatMap((task) => remainingObjectives(task, progress));
  const items = [
    ...objectives.flatMap(objectiveItems),
    ...unfinishedTasks.flatMap(taskKeys),
    ...modules.flatMap((module) => moduleItems(module, progress)),
  ];
  if (!items.every(knownItem)) return undefined;
  return {
    itemIds: new Set(items.map((item) => item.id)),
    categoryIds: new Set(objectives.flatMap((objective) => objective.containsCategory ?? [])),
  };
}
function quantityFits(row: ReviewedCell, item: ScanItem): boolean {
  const maximum = Math.min(SCAN_LIMITS.quantity, item.maxStack);
  return Number(row.quantity) <= maximum;
}
const validCoordinate = (value: number) => Number.isSafeInteger(value) && value >= 0;
const physicalRegion = (row: ReviewedCell) =>
  [row.cell.x, row.cell.y, row.cell.width, row.cell.height].every(validCoordinate) &&
  Math.min(row.cell.width, row.cell.height) > 0;
const reviewedObservation = (row: ReviewedCell) =>
  reviewState(row) === 'ok' && !row.cell.empty && physicalRegion(row);
function settled(row: ReviewedCell, items: ReadonlyMap<string, ScanItem>): boolean {
  if (!reviewedObservation(row)) return false;
  const item = items.get(row.itemId);
  return Boolean(item && quantityFits(row, item));
}
function distinct(row: ReviewedCell, index: number, rows: ReviewedCell[]): boolean {
  return !rows.some((other, otherIndex) => otherIndex !== index && conflicts(row, other));
}
function conflicts(row: ReviewedCell, other: ReviewedCell): boolean {
  if (other.excluded) return false;
  return row.cell.key === other.cell.key || overlapsRegion(row.cell, other.cell);
}
function accumulate(groups: Map<string, SellGroup>, row: ReviewedCell, item: ScanItem) {
  const group = groups.get(item.id) ?? {
    itemId: item.id,
    name: item.name,
    quantity: 0,
    cell: row.cell,
  };
  group.quantity += row.quantity!;
  groups.set(item.id, group);
}
/** One screenshot, whole observations only. No FIR allocation or surplus arithmetic. */
export function sellGroups(
  rows: ReviewedCell[],
  items: ScanItem[],
  remaining: ReadonlySet<string> | undefined
): SellGroup[] {
  if (!remaining) return [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const candidates = rows.filter((row) => settled(row, byId));
  const independent = candidates.filter((row) => distinct(row, rows.indexOf(row), rows));
  const groups = new Map<string, SellGroup>();
  independent
    .filter((row) => !remaining.has(row.itemId))
    .forEach((row) => accumulate(groups, row, byId.get(row.itemId)!));
  // Use the import volume bound for each whole item group so a partial total never appears.
  return [...groups.values()]
    .filter((group) => group.quantity <= SCAN_LIMITS.quantity)
    .sort((a, b) => a.name.localeCompare(b.name));
}
