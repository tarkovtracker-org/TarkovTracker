<template>
  <div v-if="label" data-testid="task-time-gate" class="text-surface-400 text-xs">
    <AppTooltip :text="t('page.tasks.questcard.time_gate_tooltip')">
      <span class="inline-flex items-center gap-1">
        <UIcon name="i-mdi-timer-sand" aria-hidden="true" class="h-4 w-4 shrink-0" />
        {{ label }}
      </span>
    </AppTooltip>
  </div>
</template>
<script setup lang="ts">
  import { useTaskState } from '@/composables/useTaskState';
  import { formatDelayDuration, resolveTaskTimeGate } from '@/features/tasks/task-time-gate';
  import type { Task } from '@/types/tarkov';
  const props = defineProps<{
    task: Pick<Task, 'availableDelaySecondsMax' | 'availableDelaySecondsMin' | 'id'>;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { isComplete, isFailed } = useTaskState(() => props.task.id);
  const duration = (seconds: number): string => {
    const message = formatDelayDuration(seconds);
    return t(message.key, message.params);
  };
  // A finished task no longer waits on its gate, so the note is only shown while it matters.
  const gate = computed(() =>
    isComplete.value || isFailed.value ? null : resolveTaskTimeGate(props.task)
  );
  const label = computed(() => {
    if (!gate.value) return '';
    const min = duration(gate.value.min);
    const max = duration(gate.value.max);
    if (min === max) return t('page.tasks.questcard.time_gate', { duration: max });
    return t('page.tasks.questcard.time_gate_range', { min, max });
  });
</script>
