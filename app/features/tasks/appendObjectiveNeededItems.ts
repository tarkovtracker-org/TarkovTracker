import {
  getBuildWeaponContainedItemProgressId,
  getBuildWeaponItemProgressId,
  getBuildWeaponPrimaryItem,
} from '@/features/tasks/task-objective-build-weapon';
import type { NeededItemTaskObjective, TaskObjective } from '@/types/tarkov';
const isPassiveFindObjective = (objective: TaskObjective): boolean =>
  objective.type === 'findItem' || objective.type === 'findQuestItem';
const getValidObjectiveItems = (objective: TaskObjective) =>
  Array.isArray(objective.items)
    ? objective.items.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry?.id))
    : [];
const appendPrimaryObjectiveNeededItem = (
  objective: TaskObjective,
  taskId: string,
  emittedNeededItemIds: Set<string>,
  tempNeededObjectives: NeededItemTaskObjective[]
): void => {
  if (!objective?.item?.id && !objective?.items?.[0]?.id && !objective?.markerItem?.id) {
    return;
  }
  const validItems = getValidObjectiveItems(objective);
  const primaryItem =
    objective.type === 'buildWeapon'
      ? getBuildWeaponPrimaryItem(objective)
      : (objective.item ?? validItems[0]);
  const acceptedItems = validItems.length > 1 ? validItems : undefined;
  const neededItem = primaryItem ?? objective.markerItem!;
  if (neededItem?.id) {
    emittedNeededItemIds.add(neededItem.id);
  }
  const neededItemProgressId =
    objective.type === 'buildWeapon' && neededItem?.id
      ? getBuildWeaponItemProgressId(objective.id, neededItem.id)
      : objective.id;
  tempNeededObjectives.push({
    id: neededItemProgressId,
    needType: 'taskObjective',
    taskId,
    type: objective.type,
    item: neededItem,
    markerItem: objective.markerItem,
    count: objective.count ?? 1,
    foundInRaid: objective.foundInRaid ?? false,
    ...(acceptedItems ? { acceptedItems } : {}),
  });
};
const appendBuildWeaponContainsAllNeededItems = (
  objective: TaskObjective,
  taskId: string,
  emittedNeededItemIds: Set<string>,
  tempNeededObjectives: NeededItemTaskObjective[]
): void => {
  if (objective.type !== 'buildWeapon' || !Array.isArray(objective.containsAll)) {
    return;
  }
  for (const containedItem of objective.containsAll) {
    if (!containedItem?.id || emittedNeededItemIds.has(containedItem.id)) {
      continue;
    }
    emittedNeededItemIds.add(containedItem.id);
    tempNeededObjectives.push({
      id: getBuildWeaponContainedItemProgressId(objective.id, containedItem.id),
      needType: 'taskObjective',
      taskId,
      type: objective.type,
      item: containedItem,
      count: 1,
      foundInRaid: objective.foundInRaid ?? false,
    });
  }
};
export const appendObjectiveNeededItems = (
  objective: TaskObjective,
  taskId: string,
  tempNeededObjectives: NeededItemTaskObjective[]
): void => {
  if (isPassiveFindObjective(objective)) {
    return;
  }
  const emittedNeededItemIds = new Set<string>();
  appendPrimaryObjectiveNeededItem(objective, taskId, emittedNeededItemIds, tempNeededObjectives);
  appendBuildWeaponContainsAllNeededItems(
    objective,
    taskId,
    emittedNeededItemIds,
    tempNeededObjectives
  );
};
