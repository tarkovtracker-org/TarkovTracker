<template>
  <div>
    <div v-if="title" class="mb-3 flex items-center gap-2">
      <div
        v-if="accent"
        class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
        :style="{
          backgroundColor: `color-mix(in srgb, ${accent} 15%, transparent)`,
          borderColor: `color-mix(in srgb, ${accent} 25%, transparent)`,
        }"
      >
        <UIcon name="i-mdi-pin" class="h-4 w-4" :style="{ color: accent }" />
      </div>
      <h3 class="text-surface-100 truncate text-[15px] font-semibold">{{ title }}</h3>
    </div>
    <div v-if="equipment.length > 0">
      <div class="mb-3 flex items-center gap-2">
        <div
          class="bg-primary-500/15 border-primary-500/25 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
        >
          <UIcon name="i-mdi-briefcase-variant-outline" class="text-primary-300 h-4 w-4" />
        </div>
        <h3 class="text-surface-100 truncate text-[15px] font-semibold">
          {{
            $t(
              scope === 'pinned'
                ? 'page.tasks.map.required_items'
                : 'page.tasks.map.required_items_summary'
            )
          }}
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
          {{
            $t(
              scope === 'pinned'
                ? 'page.tasks.map.required_keys'
                : 'page.tasks.map.required_keys_summary'
            )
          }}
        </h3>
      </div>
      <ObjectiveRequiredItems class="mt-0!" variant="keys" :required-keys="keyGroups" />
    </div>
  </div>
</template>
<script setup lang="ts">
  import ObjectiveRequiredItems from '@/features/tasks/ObjectiveRequiredItems.vue';
  import type { TarkovItem } from '@/types/tarkov';
  defineProps<{
    scope: 'active' | 'pinned';
    title?: string;
    accent?: string;
    equipment: TarkovItem[];
    equipmentCounts: Record<string, number>;
    keyGroups: TarkovItem[][];
  }>();
</script>
