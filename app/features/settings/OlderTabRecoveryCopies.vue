<template>
  <div class="space-y-2">
    <p
      v-if="backup.legacyProgressRecoveryOverflow.value"
      class="text-warning-300 text-sm"
      data-testid="older-tab-recovery-overflow"
    >
      {{ $t('settings.data_management.older_tab_recovery_full') }}
    </p>
    <p v-if="backup.legacyProgressRecoveryCount.value" class="text-warning-300 text-sm">
      {{
        $t('settings.data_management.older_tab_recovery_available', {
          count: backup.legacyProgressRecoveryCount.value,
        })
      }}
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="index in backup.legacyProgressRecoveryCount.value"
        :key="index"
        color="neutral"
        variant="soft"
        :data-testid="`older-tab-review-${index}`"
        :disabled="parsing"
        @click="backup.reviewOlderTabProgress(index - 1)"
      >
        {{ $t('settings.data_management.review_older_edit', { index }) }}
      </UButton>
      <UButton
        icon="i-mdi-download"
        color="neutral"
        variant="soft"
        data-testid="device-progress-recovery-export"
        @click="handleExport"
      >
        {{ $t('settings.data_management.export_device_recovery') }}
      </UButton>
      <UButton
        v-if="!confirmCleanup"
        color="neutral"
        variant="soft"
        data-testid="older-tab-cleanup"
        @click="confirmCleanup = true"
      >
        {{ $t('settings.data_management.clear_older_copies') }}
      </UButton>
    </div>
    <div v-if="confirmCleanup" class="space-y-2">
      <p class="text-surface-400 text-sm">
        {{ $t('settings.data_management.clear_older_copies_confirmation') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          color="warning"
          :loading="cleanupRunning"
          :disabled="cleanupRunning"
          data-testid="older-tab-cleanup-confirm"
          @click="handleExport"
        >
          {{ $t('settings.data_management.export_device_recovery') }}
        </UButton>
        <UButton
          v-if="backup.recoveryExportPending.value"
          color="warning"
          :disabled="cleanupRunning"
          data-testid="older-tab-cleanup-saved-confirm"
          @click="handleCleanup"
        >
          {{ $t('settings.data_management.saved_recovery_archive_confirmation') }}
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          :disabled="cleanupRunning"
          @click="confirmCleanup = false"
        >
          {{ $t('common.cancel') }}
        </UButton>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useRecoveryArchiveExport } from '@/features/settings/useRecoveryCopies';
  import { logger } from '@/utils/logger';
  import type { UseDataBackupReturn } from '@/composables/useDataBackup';
  const props = defineProps<{
    backup: Pick<
      UseDataBackupReturn,
      | 'confirmRecoveryArchiveSaved'
      | 'exportDeviceProgressRecovery'
      | 'legacyProgressRecoveryCount'
      | 'legacyProgressRecoveryOverflow'
      | 'recoveryExportPending'
      | 'reviewOlderTabProgress'
    >;
    parsing: boolean;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const exportRecoveryArchive = useRecoveryArchiveExport(props.backup);
  const confirmCleanup = ref(false);
  const cleanupRunning = ref(false);
  /** Downloading the archive is the first step of clearing the copies it now holds. */
  async function handleExport() {
    if (await exportRecoveryArchive()) confirmCleanup.value = true;
  }
  async function handleCleanup() {
    cleanupRunning.value = true;
    try {
      await props.backup.confirmRecoveryArchiveSaved();
      confirmCleanup.value = false;
    } catch (error) {
      logger.error('OlderTabRecoveryCopies: recovery cleanup failed', error);
      const ownerChanged =
        error instanceof Error &&
        error.message === t('settings.data_management.recovery_owner_changed');
      toast.add({
        title: t('settings.data_management.export_error_title'),
        description: ownerChanged
          ? error.message
          : t('settings.data_management.recovery_cleanup_failed'),
        color: 'error',
      });
    } finally {
      cleanupRunning.value = false;
    }
  }
</script>
