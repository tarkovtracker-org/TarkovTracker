<template>
  <UAlert
    v-if="showPrompt"
    class="mb-4"
    color="primary"
    variant="soft"
    icon="i-mdi-folder-upload-outline"
    :title="$t(promptTitle)"
    :description="$t('setup.entry_description')"
  >
    <template #actions>
      <UButton to="/setup" color="primary" size="sm">{{ $t(promptTitle) }}</UButton>
    </template>
    <template #close>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-mdi-close"
        :aria-label="$t('setup.dashboard_dismiss')"
        @click="dismiss"
      />
    </template>
  </UAlert>
</template>
<script setup lang="ts">
  import { useSetupCheckpoint } from '@/features/setup/useSetupCheckpoint';
  import { hasRetainableModeProgress } from '@/stores/tarkov/progressMerge';
  import { useTarkovStore } from '@/stores/useTarkov';
  const tarkov = useTarkovStore();
  const { step, dismissed, dismiss } = useSetupCheckpoint();
  const promptTitle = computed(() => (step.value === 'start' ? 'setup.title' : 'setup.resume'));
  const showPrompt = computed(() => {
    if (dismissed.value || step.value === 'done') return false;
    return step.value !== 'start' || !hasRetainableModeProgress(tarkov.getCurrentProgressData());
  });
</script>
