<template>
  <UModal
    :key="confirmationOwner ?? 'closed'"
    v-model:open="confirmOpen"
    :dismissible="!signingOut"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-content-save-alert-outline" class="text-error-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">{{ t('sign_out_confirm.title') }}</h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-3 text-sm">
        <UAlert
          icon="i-mdi-alert"
          color="error"
          variant="subtle"
          :title="t('sign_out_confirm.risk')"
        />
        <p class="text-surface-200">{{ t('sign_out_confirm.options') }}</p>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full flex-wrap items-center gap-2">
        <UButton color="primary" autofocus data-testid="sign-out-stay" @click="close">
          {{ t('sign_out_confirm.stay_signed_in') }}
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-mdi-cloud-upload-outline"
          :loading="retrying"
          data-testid="sign-out-retry"
          @click="handleRetry"
        >
          {{ t('progress_save_status.retry_button') }}
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-mdi-download"
          data-testid="sign-out-export"
          @click="handleExport"
        >
          {{ t('progress_save_status.export_button') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto"
          :loading="signingOut"
          data-testid="sign-out-discard"
          @click="discardAction"
        >
          {{ t('sign_out_confirm.discard_and_sign_out') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import { useDataBackup } from '@/composables/useDataBackup';
  import { useSignOut } from '@/composables/useSignOut';
  import { hasUnsavedProgressChanges, retryCloudSave } from '@/stores/tarkov/progressSaveStatus';
  import { logger } from '@/utils/logger';
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { exportProgress } = useDataBackup();
  const { confirmOpen, confirmationOwner, signingOut, discardAndSignOut } = useSignOut();
  const discardAction = computed(() => {
    const openingOwner = confirmationOwner.value;
    return () => discardAndSignOut(openingOwner);
  });
  const retrying = ref(false);
  /** Retrying never signs out; a successful save only removes the need to confirm. */
  const handleRetry = async () => {
    retrying.value = true;
    try {
      await retryCloudSave();
    } finally {
      retrying.value = false;
    }
    const saved = !hasUnsavedProgressChanges();
    if (saved) confirmOpen.value = false;
    toast.add({
      title: t(saved ? 'sign_out_confirm.retry_succeeded' : 'progress_save_status.retry_failed'),
      color: saved ? 'success' : 'warning',
    });
  };
  const handleExport = async () => {
    try {
      await exportProgress();
    } catch (error) {
      logger.error('[SignOutConfirm] Export failed:', error);
      toast.add({ title: t('settings.data_management.export_error_title'), color: 'error' });
    }
  };
</script>
