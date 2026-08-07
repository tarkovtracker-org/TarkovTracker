import type { TarkovItem, TaskObjective } from '@/types/tarkov';
export type BuildWeaponRequiredItem = {
  progressId: string;
  item: TarkovItem;
  neededCount: number;
};
export const getBuildWeaponItemProgressId = (objectiveId: string, itemId: string): string =>
  `${objectiveId}:item:${itemId}`;
export const getBuildWeaponContainedItemProgressId = (
  objectiveId: string,
  itemId: string
): string => `${objectiveId}:containsAll:${itemId}`;
export const getBuildWeaponPrimaryItem = (objective: TaskObjective): TarkovItem | undefined => {
  const validItems = Array.isArray(objective.items)
    ? objective.items.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry?.id))
    : [];
  return objective.item ?? validItems[0] ?? objective.markerItem ?? undefined;
};
const appendBuildWeaponPrimaryRow = (
  objective: TaskObjective,
  rows: BuildWeaponRequiredItem[],
  seenItemIds: Set<TarkovItem['id']>
): void => {
  const primaryItem = getBuildWeaponPrimaryItem(objective);
  if (!primaryItem?.id || seenItemIds.has(primaryItem.id)) {
    return;
  }
  seenItemIds.add(primaryItem.id);
  rows.push({
    progressId: getBuildWeaponItemProgressId(objective.id, primaryItem.id),
    item: primaryItem,
    neededCount: objective.count ?? 1,
  });
};
const appendBuildWeaponContainsAllRows = (
  objective: TaskObjective,
  rows: BuildWeaponRequiredItem[],
  seenItemIds: Set<TarkovItem['id']>
): void => {
  for (const containedItem of objective.containsAll ?? []) {
    if (!containedItem?.id || seenItemIds.has(containedItem.id)) continue;
    seenItemIds.add(containedItem.id);
    rows.push({
      progressId: getBuildWeaponContainedItemProgressId(objective.id, containedItem.id),
      item: containedItem,
      neededCount: 1,
    });
  }
};
export const getBuildWeaponRequiredItems = (
  objective: TaskObjective
): BuildWeaponRequiredItem[] => {
  if (objective.type !== 'buildWeapon') return [];
  const rows: BuildWeaponRequiredItem[] = [];
  const seenItemIds = new Set<TarkovItem['id']>();
  appendBuildWeaponPrimaryRow(objective, rows, seenItemIds);
  appendBuildWeaponContainsAllRows(objective, rows, seenItemIds);
  return rows;
};
