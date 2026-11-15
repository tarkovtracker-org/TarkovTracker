<template>
  <label
    class="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-white/5"
    :class="row.selected ? '' : 'opacity-60'"
  >
    <input
      type="checkbox"
      :value="row.target.key"
      :checked="row.selected"
      :disabled="locked"
      class="accent-primary-500 size-4 shrink-0"
      @change="$emit('toggle')"
    />
    <UIcon :name="kindIcon" class="text-surface-400 size-4 shrink-0" />
    <span class="min-w-0 flex-1">
      <span class="text-surface-200 block truncate">{{ row.target.label }}</span>
      <span
        v-if="row.target.need.foundInRaid"
        class="text-warning-300 text-xs font-semibold uppercase"
      >
        {{ $t('stash_import.fir_required') }}
      </span>
    </span>
    <span class="ml-auto flex shrink-0 items-center gap-2 tabular-nums">
      <span class="text-surface-400">{{ row.before }}</span>
      <UIcon name="i-mdi-arrow-right" class="text-surface-500 size-3.5" />
      <span class="font-semibold" :class="afterTone">{{ row.after }}</span>
      <span class="text-surface-500">/ {{ row.target.need.count }}</span>
      <span
        class="min-w-14 rounded-sm px-1.5 py-0.5 text-center text-xs font-semibold"
        :class="badge.tone"
      >
        {{ badge.label }}
      </span>
    </span>
  </label>
</template>
<script setup lang="ts">
  import type { ImportTarget } from '@/features/stash-import/useStashImport';
  export interface TargetRow {
    target: ImportTarget;
    isTask: boolean;
    selected: boolean;
    before: number;
    after: number;
    delta: number;
  }
  const props = defineProps<{ row: TargetRow; locked: boolean }>();
  defineEmits<{ toggle: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const kindIcon = computed(() =>
    props.row.isTask ? 'i-mdi-clipboard-text-outline' : 'i-mdi-home-outline'
  );
  const afterTone = computed(() => (props.row.delta < 0 ? 'text-warning-300' : 'text-surface-100'));
  const muted = 'bg-surface-700 text-surface-400';
  function unchangedLabel(row: TargetRow) {
    if (!row.selected) return t('stash_import.delta_skipped');
    return row.before >= row.target.need.count
      ? t('stash_import.delta_complete')
      : t('stash_import.delta_none');
  }
  const badge = computed(() => {
    const { delta } = props.row;
    if (!props.row.selected || delta === 0)
      return { label: unchangedLabel(props.row), tone: muted };
    if (delta > 0) return { label: `+${delta}`, tone: 'bg-success-500/15 text-success-300' };
    return { label: `−${-delta}`, tone: 'bg-warning-500/15 text-warning-300' };
  });
</script>
