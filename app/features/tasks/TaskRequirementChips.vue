<template>
  <div
    v-if="rows.length"
    class="flex flex-col gap-1 text-xs"
    data-testid="task-requirements-blocking"
  >
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-surface-500 text-[10px] font-bold tracking-wider uppercase">
        {{ t('page.tasks.requirements.title') }}
      </span>
      <TaskRequirementChip
        v-for="chip in chips"
        :key="chip.key"
        :row="chip.row"
        @show-pool="emit('showPool', $event)"
      />
      <button
        v-if="toggleLabel"
        type="button"
        class="text-surface-400 hover:text-surface-200 focus-visible:ring-primary-500/40 rounded px-1 focus:outline-none focus-visible:ring-2"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ toggleLabel }}
      </button>
    </div>
    <p
      v-for="hint in hints"
      :key="hint"
      class="light:text-warning-900 flex items-start gap-1 text-[11px] text-amber-400/80"
    >
      <UIcon name="i-mdi-information-outline" aria-hidden="true" class="mt-0.5 h-3 w-3 shrink-0" />
      <span>{{ hint }}</span>
    </p>
  </div>
</template>
<script setup lang="ts">
  import { COMPACT_REQUIREMENT_LIMIT } from '@/features/tasks/task-requirement-helpers';
  import TaskRequirementChip from '@/features/tasks/TaskRequirementChip.vue';
  import type { TaskRequirementRow } from '@/features/tasks/composables/useTaskRequirements';
  const props = defineProps<{ rows: TaskRequirementRow[] }>();
  const emit = defineEmits<{ showPool: [id: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const expanded = defineModel<boolean>('expanded', { default: false });
  const hiddenCount = computed(() => Math.max(0, props.rows.length - COMPACT_REQUIREMENT_LIMIT));
  const chips = computed(() =>
    (expanded.value ? props.rows : props.rows.slice(0, COMPACT_REQUIREMENT_LIMIT)).map(
      (row, index) => ({ row, key: `${row.kind}-${index}-${row.label}` })
    )
  );
  const toggleLabel = computed(() => {
    if (expanded.value && hiddenCount.value > 0) return t('page.tasks.requirements.show_less');
    return hiddenCount.value > 0
      ? t('page.tasks.requirements.show_more', { count: hiddenCount.value })
      : '';
  });
  const hints = computed(() => [
    ...new Set(chips.value.flatMap(({ row }) => (row.hint ? [row.hint] : []))),
  ]);
</script>
