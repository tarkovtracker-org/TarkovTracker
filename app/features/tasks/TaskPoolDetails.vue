<template>
  <div class="border-surface-700/60 mt-2 space-y-2 border-l pl-3" data-testid="task-pool-details">
    <p class="text-surface-400">{{ explanation }}</p>
    <p v-if="pool.candidate" class="text-warning-400" data-testid="task-pool-caveat">
      {{ t('page.tasks.requirements.pool_caveat') }}
    </p>
    <p class="text-surface-300 font-semibold">{{ title }}</p>
    <ul class="space-y-2">
      <TaskPoolGroup
        v-for="group in pool.groups"
        :key="group.key"
        :group="group"
        :verified="!pool.candidate"
      />
    </ul>
    <p class="text-surface-400">{{ t('page.tasks.requirements.pool_confirmation_hint') }}</p>
  </div>
</template>
<script setup lang="ts">
  import TaskPoolGroup from '@/features/tasks/TaskPoolGroup.vue';
  import type { TaskRequirementPool } from '@/features/tasks/task-pool';
  const props = defineProps<{ pool: TaskRequirementPool }>();
  const { t } = useI18n({ useScope: 'global' });
  const explanation = computed(() =>
    t(
      `page.tasks.requirements.${props.pool.candidate ? 'pool_candidate_explanation' : 'pool_explanation'}`
    )
  );
  const title = computed(() =>
    t(`page.tasks.requirements.${props.pool.candidate ? 'pool_candidates' : 'pool_tasks'}`)
  );
</script>
