import { getObjectiveEquipmentItems } from '@/features/tasks/task-objective-equipment';
import { useProgressStore } from '@/stores/useProgress';
import type { ComputedRef } from '#imports';
import type { TarkovItem, Task, TaskObjective } from '@/types/tarkov';
interface MapRequiredItemsOptions {
  mapId: ComputedRef<string>;
  tasks: ComputedRef<Task[]>;
  objectiveFilter?: (objective: TaskObjective, selfComplete: boolean) => boolean;
}
interface EquipmentCount {
  item: TarkovItem;
  count: number;
}
const itemDisplayName = (item: TarkovItem | undefined): string => {
  if (!item) return '';
  if (item.shortName) return item.shortName;
  return item.name ?? '';
};
const compareByDisplayName = (a: TarkovItem | undefined, b: TarkovItem | undefined): number =>
  itemDisplayName(a).localeCompare(itemDisplayName(b));
const compareByShortName = (a: TarkovItem, b: TarkovItem): number =>
  (a.shortName ?? '').localeCompare(b.shortName ?? '');
const bumpEquipmentCount = (
  itemCounts: Map<string, EquipmentCount>,
  key: string,
  item: TarkovItem,
  addCount: number
): void => {
  const existing = itemCounts.get(key);
  if (existing) {
    existing.count += addCount;
    return;
  }
  itemCounts.set(key, { item, count: addCount });
};
const addObjectiveEquipment = (
  itemCounts: Map<string, EquipmentCount>,
  objective: TaskObjective
): void => {
  const addCount = objective.count ?? 1;
  for (const item of getObjectiveEquipmentItems(objective, 'bring')) {
    if (item.id) {
      bumpEquipmentCount(itemCounts, item.id, item, addCount);
    }
  }
};
const aggregateEquipment = (objectives: TaskObjective[]): EquipmentCount[] => {
  const itemCounts = new Map<string, EquipmentCount>();
  for (const objective of objectives) {
    addObjectiveEquipment(itemCounts, objective);
  }
  return Array.from(itemCounts.values()).sort((a, b) => compareByShortName(a.item, b.item));
};
const dedupeKeyGroup = (group: TarkovItem[]): TarkovItem[] =>
  group.filter((key, index, groupItems) => {
    if (!key.id) return false;
    return groupItems.findIndex((candidate) => candidate.id === key.id) === index;
  });
const normalizeKeyGroup = (group: TarkovItem[]): TarkovItem[] =>
  dedupeKeyGroup(group).sort(compareByDisplayName);
const compareCodeUnits = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};
const keyGroupId = (group: TarkovItem[]): string =>
  group
    .map((key) => key.id ?? '')
    .sort(compareCodeUnits)
    .join('|');
const collectKeyGroups = (objective: TaskObjective): TarkovItem[][] =>
  (objective.requiredKeys ?? []).map(normalizeKeyGroup).filter((group) => group.length > 0);
const addKeyGroup = (groups: Map<string, TarkovItem[]>, group: TarkovItem[]): void => {
  const groupId = keyGroupId(group);
  if (!groups.has(groupId)) {
    groups.set(groupId, group);
  }
};
const aggregateKeyGroups = (objectives: TaskObjective[]): TarkovItem[][] => {
  const groups = new Map<string, TarkovItem[]>();
  for (const objective of objectives) {
    for (const group of collectKeyGroups(objective)) {
      addKeyGroup(groups, group);
    }
  }
  return Array.from(groups.values()).sort((a, b) => compareByDisplayName(a[0], b[0]));
};
export function useMapRequiredItems({ mapId, objectiveFilter, tasks }: MapRequiredItemsOptions): {
  equipment: ComputedRef<TarkovItem[]>;
  equipmentCounts: ComputedRef<Record<string, number>>;
  keyGroups: ComputedRef<TarkovItem[][]>;
  hasContent: ComputedRef<boolean>;
} {
  const progressStore = useProgressStore();
  const eligibleObjectives = computed(() =>
    tasks.value.flatMap((task) =>
      (task.objectives ?? []).filter((objective) => {
        if (!objective.maps?.some((map) => map.id === mapId.value)) return false;
        const selfComplete = progressStore.objectiveCompletions[objective.id]?.['self'] === true;
        return objectiveFilter ? objectiveFilter(objective, selfComplete) : !selfComplete;
      })
    )
  );
  const aggregatedItems = computed(() => aggregateEquipment(eligibleObjectives.value));
  const equipment = computed(() => aggregatedItems.value.map((entry) => entry.item));
  const equipmentCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const entry of aggregatedItems.value) {
      if (entry.item.id) {
        counts[entry.item.id] = entry.count;
      }
    }
    return counts;
  });
  const keyGroups = computed(() => aggregateKeyGroups(eligibleObjectives.value));
  const hasContent = computed(() => equipment.value.length > 0 || keyGroups.value.length > 0);
  return { equipment, equipmentCounts, keyGroups, hasContent };
}
