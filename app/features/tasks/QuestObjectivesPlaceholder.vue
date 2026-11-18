<template>
  <div v-if="error" class="flex items-center gap-2">
    <span role="status">{{ t('page.tasks.questcard.objectives_load_error') }}</span>
    <UButton size="xs" variant="soft" @click.stop="emit('retry')">{{ t('common.retry') }}</UButton>
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
  const { t } = useI18n({ useScope: 'global' });
  const emit = defineEmits<{ retry: [] }>();
  const props = defineProps<{
    error: Error | null;
    objectives: TaskObjective[];
  }>();
  const rows = computed(() => Math.min(4, Math.max(2, props.objectives.length)));
</script>
