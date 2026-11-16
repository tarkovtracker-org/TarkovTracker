<template>
  <li class="border-surface-700 bg-surface-850 overflow-hidden rounded-md border">
    <div class="flex items-center gap-3 border-b border-white/5 px-3 py-2">
      <StashCellThumb v-if="thumb" class="size-9" :bitmap="bitmap" :cell="thumb" />
      <span class="min-w-0 flex-1">
        <span class="text-surface-100 block truncate text-sm font-semibold">{{ name }}</span>
        <span class="text-surface-400 block text-xs">{{ found }}</span>
      </span>
    </div>
    <ul>
      <li v-for="row in shown" :key="row.target.key">
        <StashImportTargetRow
          :row="row"
          :locked="locked"
          @toggle="$emit('toggle', row.target.key)"
        />
      </li>
      <li v-if="hidden">
        <button
          type="button"
          class="text-surface-400 hover:text-surface-200 w-full px-3 py-2 text-left text-xs"
          @click="expanded = true"
        >
          {{ $t('stash_import.show_unchanged', { count: hidden }) }}
        </button>
      </li>
    </ul>
  </li>
</template>
<script setup lang="ts">
  import StashCellThumb from '@/features/stash-import/StashCellThumb.vue';
  import StashImportTargetRow, {
    type TargetRow,
  } from '@/features/stash-import/StashImportTargetRow.vue';
  import type { ScanRect } from '@/utils/stashScan/types';
  const props = defineProps<{
    name: string;
    found: string;
    rows: TargetRow[];
    thumb?: ScanRect;
    bitmap?: ImageBitmap;
    locked: boolean;
  }>();
  defineEmits<{ toggle: [key: string] }>();
  const expanded = ref(false);
  /** Requirements this import can change come first; the rest stay one click away. */
  const shown = computed(() => {
    const relevant = props.rows.filter((row) => row.relevant);
    return expanded.value || !relevant.length ? props.rows : relevant;
  });
  const hidden = computed(() => props.rows.length - shown.value.length);
</script>
