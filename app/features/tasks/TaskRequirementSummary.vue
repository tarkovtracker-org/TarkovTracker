<template>
  <div v-if="rows.length" data-testid="task-requirements-summary">
    <button
      type="button"
      class="hover:bg-surface-700/20 focus-visible:ring-primary-500/40 focus-visible:ring-offset-surface-900 flex w-full cursor-pointer items-center justify-between rounded-sm px-3 py-1.5 text-left transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      :aria-expanded="expanded"
      :aria-controls="listId"
      @click="expanded = !expanded"
    >
      <span class="text-surface-400 text-[10px] font-bold tracking-wider uppercase">
        {{ t('page.tasks.requirements.title') }}
        <span class="text-surface-500 ml-1 font-normal tracking-normal normal-case">
          {{ t('page.tasks.requirements.met_count', { met: metCount, total: rows.length }) }}
        </span>
      </span>
      <UIcon
        name="i-mdi-chevron-down"
        aria-hidden="true"
        class="pointer-events-none h-4 w-4 transition-transform duration-200"
        :class="{ 'rotate-180': expanded }"
      />
    </button>
    <ul v-if="expanded" :id="listId" class="flex flex-col gap-1 px-3 pt-1 pb-2 text-xs">
      <li v-for="item in items" :key="item.key" class="flex items-start gap-1.5">
        <UIcon
          :name="item.icon"
          aria-hidden="true"
          class="mt-0.5 h-3.5 w-3.5 shrink-0"
          :class="item.iconClass"
        />
        <span class="sr-only">{{ item.status }}:</span>
        <span class="min-w-0">
          <component :is="item.tag" :to="item.to" class="text-surface-200" :class="item.linkClass">
            {{ item.label }}
          </component>
          <span v-if="item.pending" class="text-surface-400 ml-1">· {{ item.pending }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>
<script setup lang="ts">
  import { RouterLink } from 'vue-router';
  import type { TaskRequirementRow } from '@/features/tasks/composables/useTaskRequirements';
  const props = defineProps<{ rows: TaskRequirementRow[]; id: string }>();
  const { t } = useI18n({ useScope: 'global' });
  const LINK_CLASS = 'underline decoration-white/30 underline-offset-2 hover:decoration-white/60';
  const MET_STATE = {
    met: { icon: 'i-mdi-check-circle', iconClass: 'text-success-400', key: 'met' },
    unmet: { icon: 'i-mdi-close-circle', iconClass: 'text-error-400', key: 'unmet' },
  } as const;
  const expanded = ref(false);
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
        pending: row.met ? undefined : row.progress,
      };
    })
  );
</script>
