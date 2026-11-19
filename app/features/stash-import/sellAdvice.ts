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
const ITEM_FIELDS = [
  'item',
  'items',
  'markerItem',
  'questItem',
  'containsAll',
  'useAny',
  'usingWeapon',
  'usingWeaponMods',
  'wearing',
] as const;
/** Unlike presentation helpers, never truncate accepted-item or equipment pools. */
const objectiveItems = (objective: TaskObjective): TarkovItem[] =>
  [
    ...ITEM_FIELDS.flatMap<TarkovItem>((field) => objective[field] ?? []),
    ...(objective.requiredKeys ?? []).flat(),
  ].flat();
const knownItem = (item: TarkovItem) => Boolean(item?.id);
const ITEM_OBJECTIVES = new Set(['giveItem', 'findItem', 'plantItem', 'buildWeapon']);
function knownObjective(objective: TaskObjective): boolean {
  if (!objective?.id || !objective.type) return false;
  const items = objectiveItems(objective);
  return [!ITEM_OBJECTIVES.has(objective.type) || items.length > 0, items.every(knownItem)].every(
    Boolean
  );
}
const knownModule = (module: HideoutModule) => Array.isArray(module.itemRequirements);
const finishedTask = (task: Task, progress: SellProgress) =>
  progress.isTaskComplete(task.id) && !progress.isTaskFailed(task.id);
const remainingObjectives = (task: Task, progress: SellProgress) =>
  progress.isTaskFailed(task.id)
    ? task.objectives!
    : task.objectives!.filter((entry) => !progress.isTaskObjectiveComplete(entry.id));
function taskItems(task: Task, progress: SellProgress): TarkovItem[] {
  if (finishedTask(task, progress)) return [];
  // Pending, hidden, failed-branch and conditionally eligible tasks all remain protected.
  return [
    ...remainingObjectives(task, progress).flatMap(objectiveItems),
    ...(task.requiredKeys ?? []).flatMap((group) => group.keys),
  ];
}
const moduleItems = (module: HideoutModule, progress: SellProgress) =>
  progress.isHideoutModuleComplete(module.id)
    ? []
    : module.itemRequirements.map((requirement) => requirement.item);
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
): ReadonlySet<string> | undefined {
  if (!knownCatalog(tasks, modules, progress)) return undefined;
  const items = [
    ...tasks.flatMap((task) => taskItems(task, progress)),
    ...modules.flatMap((module) => moduleItems(module, progress)),
  ];
  if (items.some((item) => !item?.id)) return undefined;
  return new Set(items.map((item) => item.id));
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
  return [...groups.values()]
    .filter((group) => group.quantity <= SCAN_LIMITS.quantity)
    .sort((a, b) => a.name.localeCompare(b.name));
}
