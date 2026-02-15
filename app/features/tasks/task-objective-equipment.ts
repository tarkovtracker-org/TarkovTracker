import type { TarkovItem, TaskObjective } from '@/types/tarkov';
export const MAX_RENDERED_USE_ANY_ITEMS = 24;
export const getObjectiveEquipmentItems = (objective: TaskObjective): TarkovItem[] => {
  const items: TarkovItem[] = [];
  if (objective.markerItem?.id) items.push(objective.markerItem);
  if (objective.items?.length) {
    const shouldRenderItems =
      objective.type !== 'sellItem' || objective.items.length <= MAX_RENDERED_USE_ANY_ITEMS;
    if (shouldRenderItems) {
      items.push(...objective.items);
    }
  }
  if (objective.questItem?.id) items.push(objective.questItem);
  if (objective.useAny?.length && objective.useAny.length <= MAX_RENDERED_USE_ANY_ITEMS) {
    items.push(...objective.useAny);
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
