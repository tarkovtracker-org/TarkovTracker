<template>
  <div class="relative z-10 space-y-2" :class="wide ? 'w-full' : 'shrink-0'">
    <div
      v-for="row in rows"
      :key="String(row.fir)"
      role="group"
      :aria-label="label(row.fir)"
      class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
    >
      <span class="text-surface-300 text-xs" :class="row.fir ? 'text-warning-300' : ''">
        {{ $t(row.fir ? 'common.fir' : 'needed_items.non_fir') }}
      </span>
      <ItemCountControls
        :size="wide ? 'tile' : 'md'"
        :current-count="row.current"
        :needed-count="row.total"
        :minimum-count="row.minimum"
        :disabled="row.disabled"
        :show-toggle="false"
        :count-label="label(row.fir)"
        :decrease-label="$t('needed_items.inline_counts.decrease', { name: label(row.fir) })"
        :increase-label="$t('needed_items.inline_counts.increase', { name: label(row.fir) })"
        @decrease="$emit('setCount', row.fir, row.current - 1)"
        @increase="$emit('setCount', row.fir, row.current + 1)"
        @set-count="(count) => $emit('setCount', row.fir, count)"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import ItemCountControls from '@/features/neededitems/ItemCountControls.vue';
  defineProps<{
    rows: { fir: boolean; current: number; total: number; minimum: number; disabled: boolean }[];
    wide?: boolean;
    label: (fir: boolean) => string;
  }>();
  defineEmits<{ setCount: [fir: boolean, count: number] }>();
</script>
