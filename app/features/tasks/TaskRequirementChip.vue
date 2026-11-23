<template>
  <span
    class="bg-surface-800/80 text-surface-200 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 leading-tight"
    :class="{ 'hover:bg-surface-700': row.to }"
    data-testid="task-requirement-chip"
  >
    <UIcon
      :name="KIND_ICONS[row.kind]"
      aria-hidden="true"
      class="text-error-400 h-3.5 w-3.5 shrink-0"
    />
    <span class="flex min-w-0 items-center gap-1" :class="{ 'flex-wrap': row.pool }">
      <component
        :is="row.to ? RouterLink : 'span'"
        :to="row.to"
        class="min-w-0"
        :class="labelClass"
      >
        {{ row.label }}
      </component>
      <span v-if="row.progress" class="text-surface-400 shrink-0">· {{ row.progress }}</span>
      <TaskRequirementDetail v-if="row.detail" :text="row.detail" />
      <button
        v-if="row.pool"
        type="button"
        class="text-primary-400 focus-visible:ring-primary-500/40 rounded underline underline-offset-2 focus-visible:ring-2"
        @click="emit('showPool', row.pool.id)"
      >
        {{ t('page.tasks.requirements.pool_show_tasks') }}
      </button>
    </span>
  </span>
</template>
<script setup lang="ts">
  import { RouterLink } from 'vue-router';
  import TaskRequirementDetail from '@/features/tasks/TaskRequirementDetail.vue';
  import type {
    TaskRequirementKind,
    TaskRequirementRow,
  } from '@/features/tasks/composables/useTaskRequirements';
  const props = defineProps<{ row: TaskRequirementRow }>();
  const emit = defineEmits<{ showPool: [id: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const KIND_ICONS: Record<TaskRequirementKind, string> = {
    player_level: 'i-mdi-account-star',
    trader_level: 'i-mdi-handshake',
    trader_reputation: 'i-mdi-handshake',
    task: 'i-mdi-clipboard-check-outline',
    task_pool: 'i-mdi-clipboard-list-outline',
    other: 'i-mdi-lock-outline',
  };
  const labelClass = computed(() => [
    props.row.pool ? 'break-words' : 'truncate',
    props.row.to ? 'underline-offset-2 hover:underline' : '',
  ]);
</script>
