<template>
  <div v-if="rows.length" data-testid="task-requirements-summary">
    <div class="flex items-baseline gap-1.5 px-3 py-1.5">
      <h3 class="text-surface-400 text-[10px] font-bold tracking-wider uppercase">
        {{ t('page.tasks.requirements.title') }}
      </h3>
      <span class="text-surface-500 text-[11px]">
        {{ t('page.tasks.requirements.met_count', { met: metCount, total: rows.length }) }}
      </span>
      <slot name="actions" />
    </div>
    <ul :id="listId" class="flex flex-col gap-1 px-3 pb-1.5 text-xs">
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
    <p
      v-for="hint in hints"
      :key="hint"
      class="light:text-warning-900 flex items-start gap-1 px-3 pb-1.5 text-[11px] text-amber-400/80"
    >
      <UIcon name="i-mdi-information-outline" aria-hidden="true" class="mt-0.5 h-3 w-3 shrink-0" />
      {{ hint }}
    </p>
  </div>
</template>
<script setup lang="ts">
  import { RouterLink } from 'vue-router';
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
  const listId = computed(() => `task-requirements-${props.id}`);
  const metCount = computed(() => props.rows.filter((row) => row.met).length);
  const hints = computed(() => [
    ...new Set(props.rows.flatMap((row) => (row.hint ? [row.hint] : []))),
  ]);
  const items = computed(() =>
    [...props.rows]
      .sort((a, b) => Number(a.met) - Number(b.met))
      .map((row, index) => {
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
