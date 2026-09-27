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
      </div>
    </template>
  </GenericCard>
  <UModal :key="confirmationOwner ?? 'closed'" v-model:open="confirmOpen" :dismissible="!removing">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert" class="text-error-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">{{ t('settings.device_data.confirm_title') }}</h3>
      </div>
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
          color="error"
          class="ml-auto"
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
    removeAccountDeviceData,
    requestDeviceDataRemoval,
  } from '@/stores/tarkov/deviceData';
  import {
    hasPendingCloudChanges,
    hasUnsavedProgressChanges,
  } from '@/stores/tarkov/progressSaveStatus';
  import { listSupersededProgressCopies } from '@/stores/tarkov/supersededProgress';
  import { logger } from '@/utils/logger';
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { $supabase } = useNuxtApp();
  const { exportProgress, exportSupersededProgress } = useDataBackup();
  const { signOutNow } = useSignOut();
  const confirmOpen = ref(false);
  const confirmationOwner = ref<string | null>(null);
  const removing = ref(false);
  const isLoggedIn = computed(() => Boolean($supabase.user.loggedIn && $supabase.user.id));
  const pendingCloudChanges = computed(
    () => hasPendingCloudChanges() || hasUnsavedProgressChanges()
  );
  const closeRemovalConfirmation = () => {
    confirmationOwner.value = null;
    confirmOpen.value = false;
  };
  const openRemovalConfirmation = () => {
    if (!isLoggedIn.value) return;
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
  onMounted(() =>
    window.addEventListener('tt:superseded-progress-change', refreshSupersededCopies)
  );
  onUnmounted(() =>
    window.removeEventListener('tt:superseded-progress-change', refreshSupersededCopies)
  );
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
  /**
   * The removal request is registered before sign-out so the session transition keeps
   * no recovery copy; stored copies are removed again once the transition has run.
   */
  const signOutAndRemove = async (
    userId: string
  ): Promise<'removed' | 'remove_failed' | 'sign_out_failed'> => {
    requestDeviceDataRemoval(userId);
    if (!(await signOutNow())) {
      clearDeviceDataRemoval();
      return 'sign_out_failed';
    }
    await nextTick();
    const removed = removeAccountDeviceData(userId);
    clearDeviceDataRemoval();
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
  const removeDeviceData = async (openingOwner: string | null) => {
    const userId = confirmedRemovalOwner(openingOwner);
    if (!userId) return;
    removing.value = true;
    const result = await signOutAndRemove(userId).finally(() => {
      removing.value = false;
    });
    if (result === 'sign_out_failed') return;
    if (result === 'remove_failed') {
      confirmOpen.value = false;
      toast.add({ title: t('settings.device_data.remove_error'), color: 'error' });
      return;
    }
    confirmOpen.value = false;
    toast.add({ title: t('settings.device_data.removed'), color: 'success' });
  };
  const removalAction = computed(() => {
    const openingOwner = confirmationOwner.value;
    return () => removeDeviceData(openingOwner);
  });
</script>
