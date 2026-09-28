<template>
  <!-- Always rendered so screen readers announce status changes, not only when opened. -->
  <span class="sr-only" role="status" aria-live="polite" data-testid="progress-save-status-live">
    {{ announcement }}
  </span>
  <UPopover v-if="kind" :content="{ align: 'end', side: 'bottom', sideOffset: 10 }">
    <AppTooltip :text="label">
      <UButton
        color="neutral"
        variant="ghost"
        size="md"
        :icon="presentation.icon"
        :aria-label="t('progress_save_status.indicator_aria', { status: label })"
        :class="['h-9 w-9', presentation.iconClass]"
        data-testid="progress-save-status"
        :data-status="kind"
      />
    </AppTooltip>
    <template #content>
      <div class="w-80 space-y-3 p-4 text-sm">
        <p class="font-semibold" :class="presentation.titleClass">{{ label }}</p>
        <p class="text-surface-300">{{ t(`progress_save_status.${kind}_description`) }}</p>
        <p v-if="localNoteKey" class="text-surface-300">{{ t(localNoteKey) }}</p>
        <p v-if="kind === 'cloud_retrying'" class="text-surface-400">
          {{
            t('progress_save_status.retry_scheduled', { attempt: retryAttempt, total: retryTotal })
          }}
        </p>
        <p v-if="causeKey" class="text-surface-400">{{ t(causeKey) }}</p>
        <p v-if="showsQuotaGuidance" class="text-warning-400">
          {{ t('progress_save_status.quota_guidance') }}
        </p>
        <div class="flex flex-wrap gap-2 pt-1">
          <UButton
            v-if="cloudPending"
            size="sm"
            color="primary"
            icon="i-mdi-cloud-upload-outline"
            :loading="retrying"
            :disabled="!canRetry"
            data-testid="progress-save-retry"
            @click="handleRetry"
          >
            {{ t('progress_save_status.retry_button') }}
          </UButton>
          <UButton
            v-if="kind !== 'cloud_pending'"
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-mdi-download"
            data-testid="progress-save-export"
            @click="handleExport"
          >
            {{ t('progress_save_status.export_button') }}
          </UButton>
        </div>
        <p v-if="kind !== 'cloud_pending'" class="text-surface-500 text-xs">
          {{ t('progress_save_status.export_hint') }}
        </p>
      </div>
    </template>
  </UPopover>
</template>
<script setup lang="ts">
  import { useDataBackup } from '@/composables/useDataBackup';
  import {
    useProgressSaveStatus,
    type ProgressSaveStatusKind,
  } from '@/composables/useProgressSaveStatus';
  import { logger } from '@/utils/logger';
  type Presentation = { icon: string; iconClass: string; titleClass: string };
  const PRESENTATION: Record<ProgressSaveStatusKind, Presentation> = {
    cloud_pending: {
      icon: 'i-mdi-cloud-upload-outline',
      iconClass: 'text-surface-400',
      titleClass: 'text-surface-100',
    },
    cloud_retrying: {
      icon: 'i-mdi-cloud-sync',
      iconClass: 'text-warning-500 light:text-warning-800',
      titleClass: 'text-warning-400',
    },
    cloud_failed: {
      icon: 'i-mdi-cloud-alert',
      iconClass: 'text-warning-500 light:text-warning-800',
      titleClass: 'text-warning-400',
    },
    local_failed: {
      icon: 'i-mdi-content-save-alert-outline',
      iconClass: 'text-error-500 light:text-error-800',
      titleClass: 'text-error-400',
    },
  };
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { exportProgress } = useDataBackup();
  const {
    kind,
    cloudPending,
    locallySaved,
    causeKey,
    showsQuotaGuidance,
    canRetry,
    retrying,
    retryAttempt,
    retryTotal,
    retry,
  } = useProgressSaveStatus();
  const presentation = computed(() => PRESENTATION[kind.value ?? 'cloud_pending']);
  const label = computed(() => t(`progress_save_status.${kind.value ?? 'cloud_pending'}_label`));
  /** Routine pending saves follow every edit; only warnings are announced. */
  const announcement = computed(() =>
    kind.value && kind.value !== 'cloud_pending' ? label.value : ''
  );
  /** Only a confirmed local write may be described as locally saved. */
  const localNoteKey = computed(() => {
    if (kind.value === 'local_failed') {
      return cloudPending.value ? 'progress_save_status.cloud_also_pending_note' : null;
    }
    return locallySaved.value ? 'progress_save_status.local_saved_note' : null;
  });
  const handleRetry = async () => {
    const saved = await retry();
    toast.add({
      title: t(
        saved ? 'progress_save_status.retry_succeeded' : 'progress_save_status.retry_failed'
      ),
      color: saved ? 'success' : 'warning',
    });
  };
  const handleExport = async () => {
    try {
      await exportProgress();
    } catch (error) {
      logger.error('[ProgressSaveStatus] Export failed:', error);
      toast.add({ title: t('settings.data_management.export_error_title'), color: 'error' });
    }
  };
</script>
