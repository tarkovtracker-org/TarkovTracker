<template>
  <div
    v-if="equipment.length > 0 || keyGroups.length > 0"
    class="bg-surface-800/50 mt-4 mb-4 shrink-0 rounded-lg p-4"
  >
    <div v-if="equipment.length > 0">
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
        :equipment="equipment"
        :counts="equipmentCounts"
      />
    </div>
    <div v-if="keyGroups.length > 0" :class="{ 'mt-6': equipment.length > 0 }">
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
      <ObjectiveRequiredItems variant="keys" :required-keys="keyGroups" />
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useMapRequiredItems } from '@/features/maps/composables/useMapRequiredItems';
  import ObjectiveRequiredItems from '@/features/tasks/ObjectiveRequiredItems.vue';
  import type { Task } from '@/types/tarkov';
  const props = defineProps<{
    mapId: string;
    tasks: Task[];
  }>();
  const { equipment, equipmentCounts, keyGroups } = useMapRequiredItems({
    mapId: computed(() => props.mapId),
    tasks: computed(() => props.tasks),
  });
</script>
