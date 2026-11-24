<template>
  <GenericCard
    icon="mdi-bug-outline"
    icon-color="warning"
    highlight-color="warning"
    :fill-height="false"
    :title="$t('settings.data_management.bug_report_title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-3 px-4 py-4">
        <p class="text-surface-400 text-sm">
          {{ $t('settings.data_management.bug_report_description') }}
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <UButton
            icon="i-mdi-download"
            block
            :ui="{
              base: 'bg-warning-900 light:bg-warning-50 hover:bg-warning-800 light:hover:bg-warning-100 active:bg-warning-700 light:active:bg-warning-100 text-warning-200 focus-visible:ring focus-visible:ring-warning-500',
            }"
            :loading="running === 'download'"
            :disabled="disabled || running !== null"
            @click="run('download')"
          >
            {{ $t('settings.data_management.bug_report_download') }}
          </UButton>
          <UButton
            icon="i-mdi-content-copy"
            block
            color="neutral"
            variant="soft"
            :loading="running === 'copy'"
            :disabled="disabled || running !== null"
            @click="run('copy')"
          >
            {{ $t('settings.data_management.bug_report_copy') }}
          </UButton>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useCopyToClipboard } from '@/composables/useCopyToClipboard';
  import { logger } from '@/utils/logger';
  import type { UseDataBackupReturn } from '@/composables/useDataBackup';
  type BugReportAction = 'copy' | 'download';
  const props = defineProps<{
    backup: Pick<
      UseDataBackupReturn,
      'debugExportError' | 'exportDebugSnapshot' | 'serializeDebugSnapshot'
    >;
    disabled: boolean;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { copyToClipboard } = useCopyToClipboard();
  /** Both actions share one error ref, so only one may run at a time. */
  const running = ref<BugReportAction | null>(null);
  const actions: Record<BugReportAction, () => Promise<unknown>> = {
    download: () => props.backup.exportDebugSnapshot(),
    // The snapshot holds the player's progress; keep it out of toasts and session replay.
    // It is passed unresolved so the clipboard write starts inside the click.
    copy: () => copyToClipboard(props.backup.serializeDebugSnapshot(), { revealValue: false }),
  };
  function reportFailure(error: unknown) {
    const detail = props.backup.debugExportError.value;
    logger.error('BugReportCard: debug snapshot failed', error, detail);
    if (!detail) return;
    toast.add({
      title: t('settings.data_management.bug_report_error_title'),
      description: detail,
      color: 'error',
    });
  }
  async function run(action: BugReportAction) {
    if (running.value) return;
    running.value = action;
    try {
      await actions[action]();
    } catch (error) {
      reportFailure(error);
    } finally {
      running.value = null;
    }
  }
</script>
