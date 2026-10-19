<template>
  <li class="space-y-1" data-testid="task-pool-group">
    <p v-if="grouped" class="text-surface-400 text-[11px]">{{ groupLabel }}</p>
    <div v-for="task in tasks" :key="task.id" class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <UIcon
        v-if="task.complete"
        name="i-mdi-check-circle"
        class="text-success-400 h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      />
      <component
        :is="task.tag"
        :to="task.to"
        class="text-surface-200 focus-visible:ring-primary-500/40 rounded underline decoration-white/30 underline-offset-2 hover:decoration-white/60 focus-visible:ring-2"
      >
        {{ task.name }}
      </component>
      <span class="text-[11px]" :class="task.statusClass">{{ task.statusLabel }}</span>
    </div>
  </li>
</template>
<script setup lang="ts">
  import { RouterLink } from 'vue-router';
  import type { PoolGroup, PoolTask } from '@/features/tasks/task-pool';
  const props = defineProps<{ group: PoolGroup; verified: boolean }>();
  const { t } = useI18n({ useScope: 'global' });
  const grouped = computed(() => props.group.tasks.length > 1);
  const groupLabel = computed(() => {
    const label = t(`page.tasks.requirements.${props.group.anyOf ? 'pool_any_of' : 'pool_all_of'}`);
    return props.verified && props.group.complete
      ? `${label} · ${t('page.tasks.requirements.pool_credit_earned')}`
      : label;
  });
  const statusLabel = (task: PoolTask): string => {
    const status = t(`page.tasks.requirements.pool_status_${task.status}`);
    return task.current ? `${status} · ${t('page.tasks.requirements.pool_current_task')}` : status;
  };
  const tasks = computed(() =>
    props.group.tasks.map((task) => ({
      ...task,
      tag: task.current ? 'span' : RouterLink,
      to: task.current ? undefined : `/tasks?task=${task.id}`,
      complete: task.status === 'completed',
      statusClass: task.status === 'available' ? 'text-success-400' : 'text-surface-400',
      statusLabel: statusLabel(task),
    }))
  );
</script>
