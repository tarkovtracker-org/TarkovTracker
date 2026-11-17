<template>
  <button
    type="button"
    class="flex w-full items-center gap-2.5 rounded-md border px-2 py-1.5 text-left text-sm transition-colors"
    :class="
      selected
        ? 'border-primary-400 bg-primary-500/15 text-surface-50'
        : 'border-surface-700 hover:bg-surface-700 text-surface-200'
    "
    :aria-pressed="selected"
    @click="$emit('choose')"
  >
    <span
      class="bg-surface-950 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm"
      aria-hidden="true"
    >
      <img v-if="icon" :src="icon" alt="" loading="lazy" class="size-full object-contain" />
    </span>
    <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
    <UIcon v-if="selected" name="i-mdi-check" class="text-primary-300 shrink-0" />
  </button>
</template>
<script setup lang="ts">
  import type { ScanItem } from '@/utils/stashScan/types';
  defineProps<{
    item: ScanItem;
    selected: boolean;
    icon?: string;
  }>();
  defineEmits<{ choose: [] }>();
</script>
