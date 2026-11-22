<template>
  <div v-if="rows.length" data-testid="task-requirements-summary">
    <TaskCardSectionHeader
      :label="t('page.tasks.requirements.title')"
      :meta="t('page.tasks.requirements.met_count', { met: metCount, total: rows.length })"
      :expanded="expanded"
      :controls="listId"
      test-id="task-requirements-header"
      @toggle="expanded = !expanded"
    >
      <template #actions>
        <slot name="actions" />
      </template>
    </TaskCardSectionHeader>
    <div v-if="expanded" :id="listId" class="pb-1.5">
      <ul class="flex flex-col gap-1 px-3 text-xs">
        <TaskRequirementSummaryItem
          v-for="item in items"
          :key="item.key"
          :row="item.row"
          :list-id="listId"
          :requested-pool="requestedPool"
        />
      </ul>
      <p
        v-for="hint in hints"
        :key="hint"
        class="light:text-warning-900 flex items-start gap-1 px-3 pt-1 text-[11px] text-amber-400/80"
      >
        <UIcon
          name="i-mdi-information-outline"
          aria-hidden="true"
          class="mt-0.5 h-3 w-3 shrink-0"
        />
        {{ hint }}
      </p>
    </div>
  </div>
</template>
<script setup lang="ts">
  import TaskCardSectionHeader from '@/features/tasks/TaskCardSectionHeader.vue';
  import TaskRequirementSummaryItem from '@/features/tasks/TaskRequirementSummaryItem.vue';
  import type { TaskRequirementRow } from '@/features/tasks/composables/useTaskRequirements';
  const props = defineProps<{
    rows: TaskRequirementRow[];
    id: string;
    requestedPool?: { id: string };
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const listId = computed(() => `task-requirements-${props.id}`);
  const metCount = computed(() => props.rows.filter((row) => row.met).length);
  const allMet = computed(() => metCount.value === props.rows.length);
  // Open while something blocks the task; fold away once everything is met.
  const expanded = ref(!allMet.value);
  watch(allMet, (met) => {
    expanded.value = !met;
  });
  watch(
    () => props.requestedPool,
    (request) => {
      if (request) expanded.value = true;
    },
    { immediate: true }
  );
  const hints = computed(() => [
    ...new Set(props.rows.flatMap((row) => (row.hint ? [row.hint] : []))),
  ]);
  const items = computed(() =>
    props.rows
      .map((row, index) => ({ row, key: row.pool?.id ?? `${row.kind}-${index}-${row.label}` }))
      .sort((a, b) => Number(a.row.met) - Number(b.row.met))
  );
</script>
