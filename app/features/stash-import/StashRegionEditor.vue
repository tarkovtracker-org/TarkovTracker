<template>
  <div class="bg-surface-800 space-y-2 rounded p-3">
    <p class="text-sm">{{ $t('stash_import.region_help') }}</p>
    <div class="flex flex-wrap items-end gap-2">
      <label class="text-sm">
        {{ $t('stash_import.columns') }}
        <input
          v-model.number="rect.slotsWide"
          type="number"
          min="1"
          max="10"
          class="bg-surface-950 block w-20 rounded p-2"
        />
      </label>
      <label class="text-sm">
        {{ $t('stash_import.rows') }}
        <input
          v-model.number="rect.slotsHigh"
          type="number"
          min="1"
          max="10"
          class="bg-surface-950 block w-20 rounded p-2"
        />
      </label>
      <UButton :disabled="!validRegion" @click="$emit('apply')">
        {{ $t('stash_import.match_region') }}
      </UButton>
      <UButton variant="ghost" @click="$emit('cancel')">
        {{ $t('common.cancel') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { ScanRect } from '@/utils/stashScan/types';
  const rect = defineModel<ScanRect>({ required: true });
  const validRegion = computed(() =>
    [rect.value.slotsWide, rect.value.slotsHigh].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 10
    )
  );
  defineEmits<{ apply: []; cancel: [] }>();
</script>
