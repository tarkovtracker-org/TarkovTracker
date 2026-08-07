import type { TarkovItem, TaskObjective } from '@/types/tarkov';
export const MAX_RENDERED_OBJECTIVE_ITEMS = 24;
export type BuildWeaponRequiredItem = {
  progressId: string;
  item: TarkovItem;
  neededCount: number;
};
export const getBuildWeaponRequiredItems = (
  objective: TaskObjective
): BuildWeaponRequiredItem[] => {
  if (objective.type !== 'buildWeapon') return [];
  const rows: BuildWeaponRequiredItem[] = [];
  const seenItemIds = new Set<TarkovItem['id']>();
  if (objective.item?.id) {
    seenItemIds.add(objective.item.id);
    rows.push({
      progressId: objective.id,
      item: objective.item,
      neededCount: objective.count ?? 1,
    });
  }
  for (const containedItem of objective.containsAll ?? []) {
    if (!containedItem?.id || seenItemIds.has(containedItem.id)) continue;
    seenItemIds.add(containedItem.id);
    rows.push({
      progressId: `${objective.id}:containsAll:${containedItem.id}`,
      item: containedItem,
      neededCount: 1,
    });
  }
  return rows;
};
export const getObjectiveEquipmentItems = (
  objective: TaskObjective,
  mode: 'all' | 'bring' = 'all'
): TarkovItem[] => {
  const items: TarkovItem[] = [];
  const isBringType =
    objective.type &&
    ['plantItem', 'plantQuestItem', 'place', 'useItem', 'sellItem'].includes(objective.type);
  if (objective.markerItem?.id) items.push(objective.markerItem);
  if (objective.items?.length && (mode === 'all' || isBringType)) {
    const cap = objective.type === 'sellItem' ? MAX_RENDERED_OBJECTIVE_ITEMS : Infinity;
    items.push(...objective.items.slice(0, cap));
  }
  if (objective.questItem?.id && (mode === 'all' || isBringType)) {
    items.push(objective.questItem);
  }
  if (mode === 'all') {
    if (objective.useAny?.length) {
      items.push(...objective.useAny.slice(0, MAX_RENDERED_OBJECTIVE_ITEMS));
    }
    if (objective.usingWeapon?.id) items.push(objective.usingWeapon);
    if (objective.usingWeaponMods?.length) items.push(...objective.usingWeaponMods);
    if (objective.wearing?.length) items.push(...objective.wearing);
  }
  const seenItemIds = new Set<TarkovItem['id']>();
  const uniqueItems: TarkovItem[] = [];
  for (const item of items) {
    if (!item?.id || seenItemIds.has(item.id)) continue;
    seenItemIds.add(item.id);
    uniqueItems.push(item);
  }
  return uniqueItems;
};
