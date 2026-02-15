import type { TarkovItem, TaskObjective } from '@/types/tarkov';
export const MAX_RENDERED_OBJECTIVE_ITEMS = 24;
export const getObjectiveEquipmentItems = (objective: TaskObjective): TarkovItem[] => {
  const items: TarkovItem[] = [];
  if (objective.markerItem?.id) items.push(objective.markerItem);
  if (objective.items?.length) {
    if (objective.type === 'sellItem') {
      items.push(...objective.items.slice(0, MAX_RENDERED_OBJECTIVE_ITEMS));
    } else {
      items.push(...objective.items);
    }
  }
  if (objective.questItem?.id) items.push(objective.questItem);
  if (objective.useAny?.length) {
    items.push(...objective.useAny.slice(0, MAX_RENDERED_OBJECTIVE_ITEMS));
  }
  if (objective.usingWeapon?.id) items.push(objective.usingWeapon);
  if (objective.usingWeaponMods?.length) items.push(...objective.usingWeaponMods);
  if (objective.wearing?.length) items.push(...objective.wearing);
  const seenItemIds = new Set<TarkovItem['id']>();
  const uniqueItems: TarkovItem[] = [];
  for (const item of items) {
    if (!item?.id || seenItemIds.has(item.id)) continue;
    seenItemIds.add(item.id);
    uniqueItems.push(item);
  }
  return uniqueItems;
};
