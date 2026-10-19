<template>
  <span v-if="pool.confirmed" class="text-success-400 ml-1">
    · {{ t('page.tasks.requirements.pool_confirmed') }}
  </span>
  <button
    type="button"
    class="text-primary-400 focus-visible:ring-primary-500/40 ml-2 rounded underline underline-offset-2 focus-visible:ring-2"
    :aria-expanded="open"
    :aria-controls="id"
    @click="open = !open"
  >
    {{ toggleLabel }}
  </button>
  <TaskPoolDetails v-if="open" :id="id" :pool="pool" />
</template>
<script setup lang="ts">
  import TaskPoolDetails from '@/features/tasks/TaskPoolDetails.vue';
  import type { TaskRequirementPool } from '@/features/tasks/task-pool';
  const props = defineProps<{
    id: string;
    pool: TaskRequirementPool;
    requestedPool?: { id: string };
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const open = ref(false);
  const toggleLabel = computed(() =>
    t(`page.tasks.requirements.${open.value ? 'pool_hide_tasks' : 'pool_show_tasks'}`)
  );
  watch(
    () => props.requestedPool,
    (request) => {
      if (request) open.value = request.id === props.pool.id;
    },
    { immediate: true }
  );
</script>
