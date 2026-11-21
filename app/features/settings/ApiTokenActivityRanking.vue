<template>
  <div class="min-w-0 rounded-lg border border-white/10 p-3">
    <h4 class="text-sm font-semibold">{{ title }}</h4>
    <p class="text-surface-400 mb-1 text-xs">{{ text('rank_legend') }}</p>
    <button
      v-for="row in rows"
      :key="row.value"
      type="button"
      class="flex w-full items-start justify-between gap-2 rounded px-1 py-1.5 text-left text-xs wrap-anywhere hover:bg-white/10 aria-pressed:bg-white/10"
      :aria-pressed="selected === row.value"
      @click="emit('select', row.value)"
    >
      <span>{{ row.label }}</span>
      <span class="text-surface-300 shrink-0 tabular-nums">
        {{ number(row.counted) }} / {{ number(row.throttled) }}
      </span>
    </button>
  </div>
</template>
<script setup lang="ts">
  import { useApiActivityLabels } from '@/features/settings/useApiActivityLabels';
  import type { ActivityGroup } from '@/features/settings/useApiTokenActivity';
  defineProps<{
    title: string;
    selected: string | null;
    rows: (ActivityGroup & { label: string })[];
  }>();
  const emit = defineEmits<{ select: [value: string] }>();
  const { text, number } = useApiActivityLabels();
</script>
