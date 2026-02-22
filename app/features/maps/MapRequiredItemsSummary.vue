<template>
  <div
    v-if="aggregatedItems.length > 0 || aggregatedKeys.length > 0"
    class="bg-surface-800/50 mt-4 mb-4 shrink-0 rounded-lg p-4"
  >
    <div v-if="aggregatedItems.length > 0">
      <div class="mb-3 flex items-center gap-2">
        <div
          class="bg-primary-500/15 border-primary-500/25 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
        >
          <UIcon name="i-mdi-briefcase-variant-outline" class="text-primary-300 h-4 w-4" />
        </div>
        <h3 class="text-surface-100 truncate text-[15px] font-semibold">
          {{ $t('page.tasks.map.required_items_summary') }}
        </h3>
      </div>
      <ObjectiveRequiredItems
        class="mt-0!"
        variant="equipment"
        :equipment="summaryEquipment"
        :counts="summaryEquipmentCounts"
      />
    </div>
    <div v-if="aggregatedKeys.length > 0" :class="{ 'mt-6': aggregatedItems.length > 0 }">
      <div class="mb-3 flex items-center gap-2">
        <div
          class="bg-primary-500/15 border-primary-500/25 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
        >
          <UIcon name="i-mdi-key-variant" class="text-primary-300 h-4 w-4" />
        </div>
        <h3 class="text-surface-100 truncate text-[15px] font-semibold">
          {{ $t('page.tasks.map.required_keys_summary') }}
        </h3>
      </div>
      <ObjectiveRequiredItems variant="keys" :required-keys="summaryKeys" />
    </div>
  </div>
</template>
<script setup lang="ts">
  import ObjectiveRequiredItems from '@/features/tasks/ObjectiveRequiredItems.vue';
  import { getObjectiveEquipmentItems } from '@/features/tasks/task-objective-equipment';
  import { useProgressStore } from '@/stores/useProgress';
  import type { TarkovItem, Task } from '@/types/tarkov';
  const props = defineProps<{
    mapId: string;
    tasks: Task[];
  }>();
  const progressStore = useProgressStore();
  const eligibleObjectives = computed(() =>
    props.tasks.flatMap((task) =>
      (task.objectives ?? []).filter(
        (objective) =>
          objective.maps?.some((map) => map.id === props.mapId) &&
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
  const aggregatedKeys = computed(() => {
    const keyGroups = new Map<string, TarkovItem[]>();
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
        if (!keyGroups.has(groupId)) {
          keyGroups.set(groupId, uniqueGroup);
        }
      }
    }
    return Array.from(keyGroups.values()).sort((a, b) =>
      (a[0]?.shortName || a[0]?.name || '').localeCompare(b[0]?.shortName || b[0]?.name || '')
    );
  });
  const summaryEquipment = computed(() => aggregatedItems.value.map((i) => i.item));
  const summaryEquipmentCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const data of aggregatedItems.value) {
      if (data.item.id) {
        counts[data.item.id] = data.count;
      }
    }
    return counts;
  });
  const summaryKeys = computed(() => aggregatedKeys.value);
</script>
