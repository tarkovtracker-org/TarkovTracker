<template>
  <GenericCard
    icon="mdi-bug-outline"
    icon-color="warning"
    highlight-color="warning"
    :fill-height="false"
    :title="t('settings.debug_state.title', 'Debug State')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-3 px-4 py-4">
        <p class="text-surface-400 text-sm">
          {{
            t(
              'settings.debug_state.description',
              'Capture a JSON snapshot of your current tracker state for bug reports. Includes game mode, level, task completion states, and prerequisite chains.'
            )
          }}
        </p>
        <UButton
          icon="i-mdi-content-copy"
          color="neutral"
          variant="soft"
          size="sm"
          :loading="isCopying"
          @click="handleCopyDebugState"
        >
          {{ t('settings.debug_state.copy_button', 'Copy Debug State') }}
        </UButton>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useCopyToClipboard } from '@/composables/useCopyToClipboard';
  import { useDebugStateExport } from '@/composables/useDebugStateExport';
  const { t } = useI18n({ useScope: 'global' });
  const { exportDebugState } = useDebugStateExport();
  const { copyToClipboard } = useCopyToClipboard();
  const isCopying = ref(false);
  const handleCopyDebugState = async () => {
    isCopying.value = true;
    try {
      const json = exportDebugState();
      await copyToClipboard(json);
    } finally {
      isCopying.value = false;
    }
  };
</script>
