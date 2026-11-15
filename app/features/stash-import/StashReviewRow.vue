<template>
  <div class="rounded-md border transition-colors" :class="rowTone">
    <button
      type="button"
      class="flex w-full items-center gap-3 px-2.5 py-2 text-left"
      :aria-expanded="open"
      @click="$emit('toggle')"
    >
      <StashCellThumb class="size-10" :bitmap="bitmap" :cell="row.cell" />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm" :class="look.name">{{ title }}</span>
        <span class="text-surface-400 block text-xs">{{ detail }}</span>
      </span>
      <UIcon :name="look.icon" class="size-5 shrink-0" :class="look.tone" />
    </button>
    <div v-if="open" class="border-t border-white/10 p-3">
      <StashCellEditor
        :row="row"
        :items="items"
        @next="$emit('next')"
        @split="(columns, rows) => $emit('split', columns, rows)"
        @change="$emit('change', $event)"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import StashCellEditor from '@/features/stash-import/StashCellEditor.vue';
  import StashCellThumb from '@/features/stash-import/StashCellThumb.vue';
  import { needsReview } from '@/utils/stashScan/review';
  import type { ReviewedCell, ScanItem } from '@/utils/stashScan/types';
  const props = defineProps<{
    row: ReviewedCell;
    items: ScanItem[];
    open: boolean;
    bitmap?: ImageBitmap;
    itemName: (id: string) => string;
  }>();
  defineEmits<{
    toggle: [];
    next: [];
    split: [columns: number, rows: number];
    change: [patch: Partial<ReviewedCell>];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const title = computed(() =>
    props.row.itemId ? props.itemName(props.row.itemId) : t('stash_import.unidentified')
  );
  const amount = (row: ReviewedCell) =>
    row.quantity === null
      ? t('stash_import.quantity_missing')
      : t('stash_import.units', { count: row.quantity });
  const detail = computed(() =>
    props.row.excluded
      ? t('stash_import.removed')
      : `${amount(props.row)} · ${t(`stash_import.${props.row.raidStatus}`)}`
  );
  const nameClass = (row: ReviewedCell) =>
    row.itemId ? 'text-surface-100' : 'text-warning-300 italic';
  const look = computed(() => {
    if (props.row.excluded)
      return {
        row: 'border-surface-700 bg-surface-850 hover:bg-surface-800',
        name: 'text-surface-500 line-through',
        icon: 'i-mdi-minus-circle-outline',
        tone: 'text-surface-500',
      };
    const flagged = needsReview(props.row);
    return {
      row: flagged
        ? 'border-warning-400/40 bg-warning-500/5 hover:bg-surface-800'
        : 'border-surface-700 bg-surface-850 hover:bg-surface-800',
      name: nameClass(props.row),
      icon: flagged ? 'i-mdi-alert-circle-outline' : 'i-mdi-check-circle',
      tone: flagged ? 'text-warning-400' : 'text-success-400',
    };
  });
  const rowTone = computed(() =>
    props.open ? 'border-primary-400/70 bg-surface-800' : look.value.row
  );
</script>
