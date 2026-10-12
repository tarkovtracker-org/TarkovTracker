<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <h3 :class="STORYLINE_LABEL_CLASS">{{ label }}</h3>
      <span class="text-surface-300 text-xs font-semibold tabular-nums">
        {{ completed }}/{{ total }}
      </span>
    </div>
    <div
      v-if="total"
      role="progressbar"
      class="bg-surface-800/60 h-1.5 overflow-hidden rounded-full"
      aria-valuemin="0"
      :aria-valuemax="total"
      :aria-valuenow="completed"
      :aria-label="label"
    >
      <div
        class="h-full rounded-full transition-[width] duration-300"
        :class="complete ? 'bg-success-500/70' : 'bg-primary-500/70'"
        :style="{ width: `${(completed / total) * 100}%` }"
      ></div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { STORYLINE_LABEL_CLASS } from '@/features/storyline/storylineClasses';
  defineProps<{ label: string; completed: number; total: number; complete: boolean }>();
</script>
