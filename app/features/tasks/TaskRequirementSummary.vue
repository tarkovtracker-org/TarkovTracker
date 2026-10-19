<template>
  <div v-if="rows.length" data-testid="task-requirements-summary">
    <TaskCardSectionHeader
      :label="t('page.tasks.requirements.title')"
      :meta="t('page.tasks.requirements.met_count', { met: metCount, total: rows.length })"
      :expanded="expanded"
      :controls="listId"
      @toggle="expanded = !expanded"
    >
      <template #actions>
        <slot name="actions" />
      </template>
    </TaskCardSectionHeader>
    <ul v-if="expanded" :id="listId" class="flex flex-col gap-1 px-3 pb-1.5 text-xs">
      <li v-for="item in items" :key="item.key" class="flex items-start gap-2">
        <UIcon
          :name="item.icon"
          aria-hidden="true"
          class="h-4 w-4 shrink-0"
          :class="item.iconClass"
        />
        <span class="sr-only">{{ item.status }}:</span>
        <div class="min-w-0 flex-1">
          <component :is="item.tag" :to="item.to" class="text-surface-200" :class="item.linkClass">
            {{ item.label }}
          </component>
          <span v-if="item.pending" class="text-surface-400 ml-1">· {{ item.pending }}</span>
          <TaskPoolDisclosure
            v-if="item.pool"
            :id="`${listId}-${item.pool.id}`"
            :pool="item.pool"
            :requested-pool="requestedPool"
          />
        </div>
      </li>
    </ul>
  </div>
</template>
<script setup lang="ts">
  import { RouterLink } from 'vue-router';
  import TaskCardSectionHeader from '@/features/tasks/TaskCardSectionHeader.vue';
  import TaskPoolDisclosure from '@/features/tasks/TaskPoolDisclosure.vue';
  import type { TaskRequirementRow } from '@/features/tasks/composables/useTaskRequirements';
  const props = defineProps<{
    rows: TaskRequirementRow[];
    id: string;
    requestedPool?: { id: string };
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const LINK_CLASS =
    'underline decoration-white/30 underline-offset-2 hover:decoration-white/60 light:decoration-surface-900/30 light:hover:decoration-surface-900/60';
  const MET_STATE = {
    met: { icon: 'i-mdi-check-circle', iconClass: 'text-success-400', key: 'met' },
    unmet: { icon: 'i-mdi-close-circle', iconClass: 'text-error-400', key: 'unmet' },
  } as const;
  const expanded = ref(false);
  watch(
    () => props.requestedPool,
    (request) => {
      if (!request) return;
      expanded.value = true;
    },
    { immediate: true }
  );
  const listId = computed(() => `task-requirements-${props.id}`);
  const metCount = computed(() => props.rows.filter((row) => row.met).length);
  const items = computed(() =>
    props.rows.map((row, index) => {
      const state = MET_STATE[row.met ? 'met' : 'unmet'];
      return {
        ...row,
        ...state,
        key: `${row.kind}-${index}-${row.label}`,
        status: t(`page.tasks.requirements.${state.key}`),
        tag: row.to ? RouterLink : 'span',
        linkClass: row.to ? LINK_CLASS : '',
        pending: row.pool || !row.met ? row.progress : undefined,
      };
    })
  );
</script>
