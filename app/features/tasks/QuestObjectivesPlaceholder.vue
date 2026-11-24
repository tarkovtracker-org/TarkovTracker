<template>
  <div v-if="loadFailed" class="flex flex-wrap items-center gap-2 py-2">
    <p class="text-error-600 dark:text-error-400 text-sm" role="status">
      {{ t('page.tasks.questcard.objectives_load_error', 'Could not load objectives.') }}
    </p>
    <UButton
      color="neutral"
      variant="outline"
      size="xs"
      data-testid="retry-task-objectives"
      @click="emit('retry')"
    >
      {{ t('common.retry', 'Retry') }}
    </UButton>
  </div>
  <div v-else class="flex flex-col divide-y divide-white/5" aria-hidden="true">
    <div v-for="row in rows" :key="row" class="py-1">
      <div class="-mx-1.5 flex items-start gap-2 rounded-md px-1.5 py-1">
        <div class="mt-0.5 h-4 w-4 animate-pulse rounded bg-white/10" />
        <div class="flex-1 space-y-2">
          <div class="h-3 w-3/4 animate-pulse rounded bg-white/10" />
          <div class="h-3 w-1/2 animate-pulse rounded bg-white/10" />
        </div>
        <div class="h-7 w-7 rounded-md border border-white/10 bg-white/5" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { TaskObjective } from '@/types/tarkov';
  const props = defineProps<{
    loadFailed: boolean;
    objectives: TaskObjective[];
  }>();
  const emit = defineEmits<{ retry: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const rows = computed(() => Math.min(4, Math.max(2, props.objectives.length)));
</script>
