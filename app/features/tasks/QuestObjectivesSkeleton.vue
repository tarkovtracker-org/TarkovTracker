<template>
  <div class="divide-border-muted flex flex-col divide-y" aria-hidden="true">
    <div v-for="row in rows" :key="row" class="py-2">
      <div class="flex items-start gap-4 rounded-md px-2 py-2">
        <div class="bg-shell mt-0.5 h-4 w-4 animate-pulse rounded" />
        <div class="flex-1 space-y-2">
          <div class="bg-shell h-3 w-3/4 animate-pulse rounded" />
          <div class="bg-shell h-3 w-1/2 animate-pulse rounded" />
        </div>
        <div class="bg-shell border-border-muted h-7 w-7 rounded-md border" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { TaskObjective } from '@/types/tarkov';
  const props = defineProps<{
    objectives: TaskObjective[];
  }>();
  const rows = computed(() => Math.min(4, Math.max(2, props.objectives.length)));
</script>
