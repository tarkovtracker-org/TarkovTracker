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
          {{ $t('page.tasks.map.required_items_summary', 'Required items for active tasks') }}
        </h3>
      </div>
      <div class="flex flex-wrap gap-2">
        <ObjectiveRequiredItems
          v-for="item in summaryEquipment"
          :key="item.id"
          class="mt-0!"
          variant="equipment"
          :equipment="[item]"
          :counts="{ [item.id!]: summaryEquipmentCounts[item.id!] || 0 }"
          hide-icon
          hide-disclaimer
        />
      </div>
    </div>
    <div v-if="aggregatedKeys.length > 0" :class="{ 'mt-6': aggregatedItems.length > 0 }">
      <div class="mb-3 flex items-center gap-2">
        <div
          class="bg-primary-500/15 border-primary-500/25 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
        >
          <UIcon name="i-mdi-key-variant" class="text-primary-300 h-4 w-4" />
        </div>
        <h3 class="text-surface-100 truncate text-[15px] font-semibold">
          {{ $t('page.tasks.map.required_keys_summary', 'Required keys for active tasks') }}
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
  const aggregatedItems = computed(() => {
    const itemCounts = new Map<string, { item: TarkovItem; count: number }>();
    for (const task of props.tasks) {
      if (!task.objectives) continue;
      for (const obj of task.objectives) {
        const isForMap = obj.maps?.some((m: { id: string }) => m.id === props.mapId);
        if (!isForMap) continue;
        const isComplete = progressStore.objectiveCompletions[obj.id]?.['self'];
        if (isComplete) continue;
        const equipItems = getObjectiveEquipmentItems(obj, 'bring');
        for (const item of equipItems) {
          if (!item.id) continue;
          const addCount = obj.count || 1;
          const existing = itemCounts.get(item.id);
          if (existing) {
            existing.count += addCount;
          } else {
            itemCounts.set(item.id, { item, count: addCount });
          }
        }
      }
    }
    return Array.from(itemCounts.values()).sort((a, b) =>
      (a.item.shortName || '').localeCompare(b.item.shortName || '')
    );
  });
  const aggregatedKeys = computed(() => {
    const keys = new Map<string, TarkovItem>();
    for (const task of props.tasks) {
      if (!task.objectives) continue;
      for (const obj of task.objectives) {
        const isForMap = obj.maps?.some((m: { id: string }) => m.id === props.mapId);
        if (!isForMap) continue;
        const isComplete = progressStore.objectiveCompletions[obj.id]?.['self'];
        if (isComplete) continue;
        const reqKeys = obj.requiredKeys ?? [];
        for (const group of reqKeys) {
          for (const key of group) {
            if (key.id && !keys.has(key.id)) {
              keys.set(key.id, key);
            }
          }
        }
      }
    }
    return Array.from(keys.values()).sort((a, b) =>
      (a.shortName || '').localeCompare(b.shortName || '')
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
  const summaryKeys = computed(() => aggregatedKeys.value.map((k) => [k]));
</script>
