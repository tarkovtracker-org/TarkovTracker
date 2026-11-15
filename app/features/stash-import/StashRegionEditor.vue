<template>
  <div ref="editor" class="bg-surface-800 space-y-2 rounded p-3">
    <p class="text-sm">{{ $t('stash_import.region_help') }}</p>
    <div class="flex flex-wrap items-end gap-2">
      <label v-for="field in coordinates" :key="field" class="text-sm">
        {{ $t(`stash_import.region_${field}`) }}
        <input
          v-model.number="rect[field]"
          :data-coordinate="field"
          type="number"
          :min="coordinateMinimum(field)"
          step="1"
          class="bg-surface-950 block w-24 rounded p-2"
        />
      </label>
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
  import { validateRect } from '@/utils/stashScan/decodeImage';
  import type { ScanRect } from '@/utils/stashScan/types';
  const editor = ref<HTMLElement>();
  onMounted(() => editor.value?.querySelector('input')?.focus());
  const props = defineProps<{ width: number; height: number }>();
  const coordinates = ['x', 'y', 'width', 'height'] as const;
  const coordinateMinimum = (field: string) => (['width', 'height'].includes(field) ? 8 : 0);
  const rect = defineModel<ScanRect>({ required: true });
  const validRegion = computed(() => {
    try {
      validateRect(rect.value, props);
      return true;
    } catch {
      return false;
    }
  });
  defineEmits<{ apply: []; cancel: [] }>();
</script>
