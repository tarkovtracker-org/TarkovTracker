import type { TarkovItem, TaskObjective } from '@/types/tarkov';
export const MAX_RENDERED_OBJECTIVE_ITEMS = 24;
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
