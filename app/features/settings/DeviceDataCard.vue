<template>
  <GenericCard
    icon="mdi-cellphone-remove"
    icon-color="warning"
    highlight-color="warning"
    :fill-height="false"
    :title="t('settings.device_data.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-3 px-4 py-4 text-sm">
        <p class="text-surface-300">{{ t('settings.device_data.description') }}</p>
        <p class="text-surface-400">{{ t('settings.device_data.cloud_unaffected') }}</p>
        <div v-if="supersededCopies.length" class="bg-surface-900/60 space-y-2 rounded-md p-3">
          <p class="text-surface-300">
            {{ t('settings.device_data.superseded_available', { count: supersededCopies.length }) }}
          </p>
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-mdi-download"
            data-testid="superseded-progress-export"
            @click="handleSupersededExport"
          >
            {{ t('settings.device_data.superseded_export') }}
          </UButton>
        </div>
        <UButton
          color="error"
          variant="soft"
          size="sm"
          icon="i-mdi-delete-outline"
          :disabled="!isLoggedIn"
          data-testid="device-data-remove"
          @click="openRemovalConfirmation"
        >
          {{ t('settings.device_data.remove_button') }}
        </UButton>
        <UAlert
          v-if="showsIncompleteRemoval"
          icon="i-mdi-alert-circle"
          color="error"
          variant="subtle"
          role="alert"
          :title="t('settings.device_data.remove_incomplete')"
          data-testid="device-data-remove-incomplete"
        >
          <template #actions>
            <UButton
              color="error"
              variant="solid"
              size="sm"
              :loading="retryingRemoval"
              data-testid="device-data-retry-removal"
              @click="handleRetryRemoval"
            >
              {{ t('settings.device_data.retry_removal') }}
            </UButton>
          </template>
        </UAlert>
      </div>
    </template>
  </GenericCard>
  <UModal
    :key="confirmationOwner ?? 'closed'"
    v-model:open="confirmOpen"
    :dismissible="!removing"
    :close="!removing"
  >
    <template #title>
      <span class="flex items-center gap-2 text-lg font-semibold">
        <UIcon name="i-mdi-alert" class="text-error-400 h-5 w-5" />
        {{ t('settings.device_data.confirm_title') }}
      </span>
    </template>
    <template #body>
      <div class="space-y-3 text-sm">
        <p class="text-surface-200">{{ t('settings.device_data.confirm_description') }}</p>
        <UAlert
          v-if="pendingCloudChanges"
          icon="i-mdi-cloud-alert"
          color="error"
          variant="subtle"
          :title="t('settings.device_data.pending_warning')"
          data-testid="device-data-pending-warning"
        />
        <UAlert
          v-if="deviceOnlyAvailable"
          icon="i-mdi-cloud-off-outline"
          color="warning"
          variant="subtle"
          role="alert"
          :title="t('settings.device_data.revocation_unavailable')"
          data-testid="device-data-revocation-unavailable"
        />
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full flex-wrap items-center gap-2">
        <UButton color="primary" autofocus @click="close">{{ t('common.cancel') }}</UButton>
        <UButton
          v-if="pendingCloudChanges"
          color="neutral"
          variant="soft"
          icon="i-mdi-download"
          data-testid="device-data-export"
          @click="handleExport"
        >
          {{ t('progress_save_status.export_button') }}
        </UButton>
        <UButton
          v-if="deviceOnlyAvailable"
          color="warning"
          variant="soft"
          class="ml-auto"
          :loading="removing"
          data-testid="device-data-confirm-device-only"
          @click="deviceOnlyRemovalAction"
        >
          {{ t('settings.device_data.confirm_device_only_button') }}
        </UButton>
        <UButton
          color="error"
          :class="deviceOnlyAvailable ? undefined : 'ml-auto'"
          :loading="removing"
          data-testid="device-data-confirm"
          @click="removalAction"
        >
          {{ t('settings.device_data.confirm_button') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useDataBackup } from '@/composables/useDataBackup';
  import { useSignOut } from '@/composables/useSignOut';
  import {
    clearDeviceDataRemoval,
    incompleteDeviceDataRemovalOwner,
    markDeviceDataRemovalIncomplete,
    refreshIncompleteDeviceDataRemovals,
    removeAccountDeviceData,
    requestDeviceDataRemoval,
    isDeviceDataRemovalPending,
    retryIncompleteDeviceDataRemoval,
  } from '@/stores/tarkov/deviceData';
  import {
    hasPendingCloudChanges,
    hasUnsavedProgressChanges,
  } from '@/stores/tarkov/progressSaveStatus';
  import { listSupersededProgressCopies } from '@/stores/tarkov/supersededProgress';
  import { logger } from '@/utils/logger';
  import { STORAGE_KEYS } from '@/utils/storageKeys';
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { $supabase } = useNuxtApp();
  const { exportProgress, exportSupersededProgress } = useDataBackup();
  const { signOutNow, signOutThisDevice, lastFailure } = useSignOut();
  const confirmOpen = ref(false);
  const confirmationOwner = ref<string | null>(null);
  const removing = ref(false);
  const retryingRemoval = ref(false);
  /** Set when global sign-out could not reach the server and the session is still active. */
  const deviceOnlyAvailable = ref(false);
  const isLoggedIn = computed(() => Boolean($supabase.user.loggedIn && $supabase.user.id));
  const pendingCloudChanges = computed(
    () => hasPendingCloudChanges() || hasUnsavedProgressChanges()
  );
  /** The failed removal's owner is signed out; its retry must not run inside its own session. */
  const showsIncompleteRemoval = computed(
    () =>
      incompleteDeviceDataRemovalOwner.value !== null &&
      incompleteDeviceDataRemovalOwner.value !== $supabase.user.id
  );
  const closeRemovalConfirmation = () => {
    confirmationOwner.value = null;
    confirmOpen.value = false;
    deviceOnlyAvailable.value = false;
  };
  const openRemovalConfirmation = () => {
    if (!isLoggedIn.value) return;
    deviceOnlyAvailable.value = false;
    confirmationOwner.value = $supabase.user.id;
    confirmOpen.value = true;
  };
  const supersededCopies = ref(
    $supabase.user.id ? listSupersededProgressCopies($supabase.user.id) : []
  );
  const refreshSupersededCopies = () => {
    supersededCopies.value = $supabase.user.id
      ? listSupersededProgressCopies($supabase.user.id)
      : [];
  };
  watch(
    () => [$supabase.user.id, $supabase.user.loggedIn],
    () => {
      closeRemovalConfirmation();
      refreshSupersededCopies();
    },
    { flush: 'sync' }
  );
  /** Other tabs report superseded-copy and removal-marker changes only through storage events. */
  const refreshOnSupersededStorageChange = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) {
      refreshSupersededCopies();
    }
    if (
      event.key === null ||
      event.key.startsWith(STORAGE_KEYS.deviceDataRemovalIncompletePrefix)
    ) {
      refreshIncompleteDeviceDataRemovals();
    }
  };
  onMounted(() => {
    window.addEventListener('tt:superseded-progress-change', refreshSupersededCopies);
    window.addEventListener('storage', refreshOnSupersededStorageChange);
  });
  onUnmounted(() => {
    window.removeEventListener('tt:superseded-progress-change', refreshSupersededCopies);
    window.removeEventListener('storage', refreshOnSupersededStorageChange);
  });
  const handleExport = async () => {
    try {
      await exportProgress();
    } catch (error) {
      logger.error('[DeviceData] Export failed:', error);
      toast.add({ title: t('settings.data_management.export_error_title'), color: 'error' });
    }
  };
  const handleSupersededExport = async () => {
    try {
      await exportSupersededProgress();
    } catch (error) {
      logger.error('[DeviceData] Superseded progress export failed:', error);
      toast.add({ title: t('settings.device_data.superseded_export_error'), color: 'error' });
    }
  };
  const tryRemoveAccountDeviceData = async (userId: string): Promise<boolean> => {
    try {
      return await removeAccountDeviceData(userId);
    } catch (error) {
      logger.error('[DeviceData] Removing device data failed:', error);
      return false;
    }
  };
  type SignOutMode = 'global' | 'device';
  const signOutOwner = (userId: string, mode: SignOutMode): Promise<boolean> =>
    mode === 'device'
      ? signOutThisDevice(userId)
      : signOutNow(userId, { offerDeviceOnlyFallback: false });
  /**
   * The removal request is registered before sign-out so the session transition keeps
   * no recovery copy; stored copies are removed again once the transition has run.
   */
  const signOutAndRemove = async (
    userId: string,
    mode: SignOutMode
  ): Promise<'removed' | 'remove_failed' | 'sign_out_failed' | 'session_changed'> => {
    const removalRevision = requestDeviceDataRemoval(userId);
    if (!(await signOutOwner(userId, mode))) {
      clearDeviceDataRemoval(removalRevision);
      return 'sign_out_failed';
    }
    await nextTick();
    if (!isDeviceDataRemovalPending(userId, removalRevision)) {
      if (!isCurrentLoggedInOwner(userId)) markDeviceDataRemovalIncomplete(userId);
      return 'session_changed';
    }
    const removed = await tryRemoveAccountDeviceData(userId);
    if (!isDeviceDataRemovalPending(userId, removalRevision)) {
      if (!removed && !isCurrentLoggedInOwner(userId)) markDeviceDataRemovalIncomplete(userId);
      return 'session_changed';
    }
    clearDeviceDataRemoval(removalRevision);
    if (!removed) markDeviceDataRemovalIncomplete(userId);
    return removed ? 'removed' : 'remove_failed';
  };
  const isCurrentLoggedInOwner = (owner: string | null): boolean =>
    Boolean(owner) && owner === $supabase.user.id && isLoggedIn.value;
  const confirmedRemovalOwner = (userId: string | null): string | null => {
    if (userId !== confirmationOwner.value) return null;
    if (!isCurrentLoggedInOwner(userId)) {
      closeRemovalConfirmation();
      return null;
    }
    return userId;
  };
  const reportRemovalResult = (result: 'removed' | 'remove_failed') => {
    confirmOpen.value = false;
    const removed = result === 'removed';
    toast.add({
      title: t(removed ? 'settings.device_data.removed' : 'settings.device_data.remove_error'),
      color: removed ? 'success' : 'error',
    });
  };
  const removeDeviceData = async (openingOwner: string | null, mode: SignOutMode) => {
    const userId = confirmedRemovalOwner(openingOwner);
    if (!userId) return;
    removing.value = true;
    const result = await signOutAndRemove(userId, mode).finally(() => {
      removing.value = false;
    });
    if (result === 'session_changed') return;
    if (result === 'sign_out_failed') {
      deviceOnlyAvailable.value = lastFailure.value === 'revocation_unavailable';
      return;
    }
    reportRemovalResult(result);
  };
  const removalAction = computed(() => {
    const openingOwner = confirmationOwner.value;
    return () => removeDeviceData(openingOwner, 'global');
  });
  const deviceOnlyRemovalAction = computed(() => {
    const openingOwner = confirmationOwner.value;
    return () => removeDeviceData(openingOwner, 'device');
  });
  const handleRetryRemoval = async () => {
    retryingRemoval.value = true;
    try {
      const removed = await retryIncompleteDeviceDataRemoval();
      toast.add({
        title: t(removed ? 'settings.device_data.removed' : 'settings.device_data.remove_error'),
        color: removed ? 'success' : 'error',
      });
    } catch (error) {
      logger.error('[DeviceData] Retrying device data removal failed:', error);
      toast.add({ title: t('settings.device_data.remove_error'), color: 'error' });
    } finally {
      retryingRemoval.value = false;
    }
  };
</script>
