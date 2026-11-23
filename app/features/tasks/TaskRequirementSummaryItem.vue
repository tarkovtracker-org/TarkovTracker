<template>
  <li class="flex items-start gap-2">
    <UIcon
      :name="state.icon"
      aria-hidden="true"
      class="h-4 w-4 shrink-0"
      :class="state.iconClass"
    />
    <span class="sr-only">{{ statusLabel }}</span>
    <div class="min-w-0 flex-1">
      <component
        :is="row.to ? RouterLink : 'span'"
        :to="row.to"
        class="text-surface-200"
        :class="linkClass"
      >
        {{ row.label }}
      </component>
      <span v-if="pending" class="text-surface-400 ml-1">· {{ pending }}</span>
      <TaskRequirementDetail v-if="row.detail" :text="row.detail" />
      <TaskPoolDisclosure
        v-if="row.pool"
        :id="`${listId}-${row.pool.id}`"
        :pool="row.pool"
        :requested-pool="requestedPool"
      />
    </div>
  </li>
</template>
<script setup lang="ts">
  import { RouterLink } from 'vue-router';
  import TaskPoolDisclosure from '@/features/tasks/TaskPoolDisclosure.vue';
  import TaskRequirementDetail from '@/features/tasks/TaskRequirementDetail.vue';
  import type { TaskRequirementRow } from '@/features/tasks/composables/useTaskRequirements';
  const props = defineProps<{
    row: TaskRequirementRow;
    listId: string;
    requestedPool?: { id: string };
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const LINK_CLASS =
    'underline decoration-white/30 underline-offset-2 hover:decoration-white/60 light:decoration-surface-900/30 light:hover:decoration-surface-900/60';
  const MET_STATE = {
    met: { icon: 'i-mdi-check-circle', iconClass: 'text-success-400', key: 'met' },
    unmet: { icon: 'i-mdi-close-circle', iconClass: 'text-error-400', key: 'unmet' },
  } as const;
  const state = computed(() => MET_STATE[props.row.met ? 'met' : 'unmet']);
  const statusLabel = computed(() =>
    t('page.tasks.requirements.status_prefix', {
      status: t(`page.tasks.requirements.${state.value.key}`),
    })
  );
  const linkClass = computed(() => (props.row.to ? LINK_CLASS : ''));
  // Met rows drop their progress unless a pool still needs its tracked count.
  const pending = computed(() =>
    props.row.pool || !props.row.met ? props.row.progress : undefined
  );
</script>
