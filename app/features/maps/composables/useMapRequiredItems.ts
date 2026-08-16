import { getObjectiveEquipmentItems } from '@/features/tasks/task-objective-equipment';
import { useProgressStore } from '@/stores/useProgress';
import type { ComputedRef } from '#imports';
import type { TarkovItem, Task } from '@/types/tarkov';
interface MapRequiredItemsOptions {
  mapId: ComputedRef<string>;
  tasks: ComputedRef<Task[]>;
}
export function useMapRequiredItems({ mapId, tasks }: MapRequiredItemsOptions): {
  equipment: ComputedRef<TarkovItem[]>;
  equipmentCounts: ComputedRef<Record<string, number>>;
  keyGroups: ComputedRef<TarkovItem[][]>;
  hasContent: ComputedRef<boolean>;
} {
  const progressStore = useProgressStore();
  const eligibleObjectives = computed(() =>
    tasks.value.flatMap((task) =>
      (task.objectives ?? []).filter(
        (objective) =>
          objective.maps?.some((map) => map.id === mapId.value) &&
          !progressStore.objectiveCompletions[objective.id]?.['self']
      )
    )
  );
  const aggregatedItems = computed(() => {
    const itemCounts = new Map<string, { item: TarkovItem; count: number }>();
    for (const objective of eligibleObjectives.value) {
      const equipItems = getObjectiveEquipmentItems(objective, 'bring');
      for (const item of equipItems) {
        if (!item.id) continue;
        const addCount = objective.count ?? 1;
        const existing = itemCounts.get(item.id);
        if (existing) {
          existing.count += addCount;
        } else {
          itemCounts.set(item.id, { item, count: addCount });
        }
      }
    }
    return Array.from(itemCounts.values()).sort((a, b) =>
      (a.item.shortName || '').localeCompare(b.item.shortName || '')
    );
  });
  const keyGroups = computed(() => {
    const groups = new Map<string, TarkovItem[]>();
    for (const objective of eligibleObjectives.value) {
      for (const group of objective.requiredKeys ?? []) {
        const uniqueGroup = group.filter((key, index, groupItems) => {
          if (!key.id) return false;
          return groupItems.findIndex((candidate) => candidate.id === key.id) === index;
        });
        if (!uniqueGroup.length) continue;
        uniqueGroup.sort((a, b) =>
          (a.shortName || a.name || '').localeCompare(b.shortName || b.name || '')
        );
        const groupId = uniqueGroup
          .map((key) => key.id)
          .sort()
          .join('|');
        if (!groups.has(groupId)) {
          groups.set(groupId, uniqueGroup);
        }
      }
    }
    return Array.from(groups.values()).sort((a, b) =>
      (a[0]?.shortName || a[0]?.name || '').localeCompare(b[0]?.shortName || b[0]?.name || '')
    );
  });
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
  const hasContent = computed(() => equipment.value.length > 0 || keyGroups.value.length > 0);
  return { equipment, equipmentCounts, keyGroups, hasContent };
}
