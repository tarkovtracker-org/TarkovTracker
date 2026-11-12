import { getObjectiveGlyphKind } from '@/features/maps/utils/objectiveGlyphs';
import type { TarkovItem, Task, TaskObjective } from '@/types/tarkov';
/** The item a player brings, plants or picks up for an objective, with how many alternatives. */
export type ObjectivePopupItem = { item: TarkovItem; alternatives: number };
const firstOf = (items: TarkovItem[] | undefined): ObjectivePopupItem | undefined =>
  items?.[0] ? { item: items[0], alternatives: items.length - 1 } : undefined;
const single = (item: TarkovItem | undefined): ObjectivePopupItem | undefined =>
  item ? { item, alternatives: 0 } : undefined;
/**
 * The item worth showing in a map popup: the MS2000 Marker for a mark, the quest item for a
 * quest pickup or stash, otherwise the accepted items (the first of several, e.g. flares), and
 * last the weapon or gear an elimination must be done with.
 */
export function getObjectivePopupItem(objective: TaskObjective): ObjectivePopupItem | undefined {
  if (objective.type === 'mark') return single(objective.markerItem ?? objective.item);
  return single(objective.questItem) ?? acceptedItem(objective) ?? equipmentItem(objective);
}
const acceptedItem = (objective: TaskObjective) =>
  firstOf(objective.items) ?? firstOf(objective.useAny) ?? single(objective.item);
const equipmentItem = (objective: TaskObjective) =>
  single(objective.usingWeapon) ?? firstOf(objective.wearing);
/** Each required key group as one label; any key in a group opens the way ("A / B"). */
export function getObjectiveKeyLabels(
  objective: TaskObjective,
  itemName: (item: TarkovItem) => string
): string[] {
  return (objective.requiredKeys ?? [])
    .map((group) => group.map(itemName).filter(Boolean).join(' / '))
    .filter(Boolean);
}
export type ObjectivePopupProgress = { current: number; required: number; percent: number };
/** Progress shown as a bar only when the objective counts more than one action or item. */
export function getObjectiveProgress(
  current: number,
  required: number
): ObjectivePopupProgress | null {
  if (required <= 1) return null;
  const clamped = Math.min(Math.max(current, 0), required);
  return { current: clamped, required, percent: Math.round((clamped / required) * 100) };
}
/** The item row's text and icon: name, required count, and how many other items also count. */
export function describeObjectiveItem(
  entry: ObjectivePopupItem,
  name: string,
  count: number
): { label: string; icon: string } {
  const counted = count > 1 ? ` ×${count}` : '';
  const more = entry.alternatives > 0 ? ` +${entry.alternatives}` : '';
  return { label: `${name}${counted}${more}`, icon: entry.item.iconLink ?? '' };
}
type PopupTask = Pick<Task, 'id' | 'name' | 'trader'>;
/** The task giver's name and portrait, empty when the task or its trader is unknown. */
export function getPopupTrader(task: PopupTask | null | undefined): {
  name: string;
  image: string;
} {
  const trader = task?.trader;
  return { name: trader?.name ?? '', image: trader?.imageLink ?? '' };
}
/** One row of the stacked-objectives list. */
export function describeStackEntry(
  id: string,
  objective: TaskObjective | undefined,
  task: PopupTask | undefined,
  fallbackTaskName: string
) {
  const trader = getPopupTrader(task);
  return {
    id,
    taskName: task?.name ?? fallbackTaskName,
    traderName: trader.name,
    traderImage: trader.image,
    glyphKind: getObjectiveGlyphKind(objective?.type),
    description: objective?.description ?? '',
  };
}
