<template>
  <div class="space-y-1">
    <div class="flex items-baseline justify-between gap-2 text-xs">
      <span class="text-surface-400">{{ $t('needed_items.total') }}</span>
      <span
        class="font-semibold tabular-nums"
        :class="complete ? 'text-success-300' : 'text-surface-50'"
      >
        {{ formatNumber(current) }}/{{ formatNumber(total) }}
      </span>
    </div>
    <div
      class="bg-surface-700 h-1.5 overflow-hidden rounded-full"
      role="progressbar"
      :aria-valuenow="current"
      :aria-valuemin="0"
      :aria-valuemax="total"
      :aria-label="$t('needed_items.total')"
    >
      <div
        class="h-full rounded-full transition-[width]"
        :class="complete ? 'bg-success-500' : 'bg-primary-500'"
        :style="{ width: `${percent}%` }"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  const props = defineProps<{ current: number; total: number }>();
  const formatNumber = useLocaleNumberFormatter();
  const complete = computed(() => props.total > 0 && props.current >= props.total);
  const percent = computed(() =>
    props.total > 0 ? Math.min(100, Math.round((props.current / props.total) * 100)) : 0
  );
</script>
