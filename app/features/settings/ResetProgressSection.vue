<template>
  <div class="space-y-5">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <UButton
        icon="i-mdi-shield-sword"
        block
        :ui="{
          base: 'bg-pvp-900 hover:bg-pvp-800 active:bg-pvp-700 text-pvp-200 focus-visible:ring focus-visible:ring-pvp-500',
        }"
        @click="showResetPvPDialog = true"
      >
        {{ $t('common.reset_pvp_data') }}
      </UButton>
      <UButton
        icon="i-mdi-calendar-star"
        color="warning"
        variant="soft"
        block
        @click="showResetSeasonalDialog = true"
      >
        {{ $t('common.reset_seasonal_data', 'Reset Seasonal PvP Data') }}
      </UButton>
      <UButton
        icon="i-mdi-account-group"
        block
        :ui="{
          base: 'bg-pve-900 hover:bg-pve-800 active:bg-pve-700 text-pve-200 focus-visible:ring focus-visible:ring-pve-500',
        }"
        @click="showResetPvEDialog = true"
      >
        {{ $t('common.reset_pve_data') }}
      </UButton>
    </div>
    <div class="border-error-500/25 bg-error-950/15 space-y-3 rounded-lg border p-4">
      <div class="flex items-start gap-2">
        <UIcon name="i-mdi-alert-octagon" class="text-error-400 mt-0.5 h-4 w-4 shrink-0" />
        <div class="space-y-0.5">
          <p class="text-error-300 text-sm font-semibold">
            {{ $t('settings.data_management.danger_zone_title', 'Danger Zone') }}
          </p>
          <p class="text-surface-400 text-xs">
            {{
              $t(
                'settings.data_management.danger_zone_hint',
                'Resetting all progress permanently deletes your data for PvP, PvE, and Seasonal PvP. This cannot be undone.'
              )
            }}
          </p>
        </div>
      </div>
      <UButton
        color="error"
        variant="soft"
        icon="i-mdi-delete-sweep"
        block
        @click="showResetAllDialog = true"
      >
        {{ $t('common.reset_all_data') }}
      </UButton>
    </div>
  </div>
  <UModal v-model:open="showResetPvPDialog">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert" class="text-pvp-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('common.reset_pvp_data') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-3">
        <UAlert
          icon="i-mdi-alert"
          color="pvp"
          variant="subtle"
          :title="$t('settings.data_management.reset_pvp_confirmation')"
        />
        <p class="text-surface-200 text-sm">
          {{ $t('settings.data_management.reset_pvp_warning') }}
        </p>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          @click="resetPvPData"
        >
          {{ $t('settings.data_management.reset_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
  <UModal v-model:open="showResetSeasonalDialog">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert" class="text-warning-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('common.reset_seasonal_data', 'Reset Seasonal PvP Data') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-3">
        <UAlert
          icon="i-mdi-alert"
          color="warning"
          variant="subtle"
          :title="
            $t(
              'settings.data_management.reset_seasonal_confirmation',
              'Are you sure you want to reset your Seasonal PvP progress?'
            )
          "
        />
        <p class="text-surface-200 text-sm">
          {{
            $t(
              'settings.data_management.reset_seasonal_warning',
              'This will permanently delete all your Seasonal PvP progress for the active season. Your persistent PvP and PvE data will not be affected.'
            )
          }}
        </p>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          @click="resetSeasonalData"
        >
          {{ $t('settings.data_management.reset_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
  <UModal v-model:open="showResetPvEDialog">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert" class="text-pve-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('common.reset_pve_data') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-3">
        <UAlert
          icon="i-mdi-alert"
          color="pve"
          variant="subtle"
          :title="$t('settings.data_management.reset_pve_confirmation')"
        />
        <p class="text-surface-200 text-sm">
          {{ $t('settings.data_management.reset_pve_warning') }}
        </p>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          @click="resetPvEData"
        >
          {{ $t('settings.data_management.reset_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
  <UModal v-model:open="showResetAllDialog">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert-octagon" class="text-error-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('common.reset_all_data') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-mdi-alert"
          color="error"
          variant="subtle"
          :title="$t('settings.data_management.reset_all_confirmation')"
        />
        <p class="text-surface-200 text-sm">
          {{ $t('settings.data_management.reset_all_warning') }}
        </p>
        <div class="space-y-2">
          <p class="text-surface-100 text-sm font-medium">
            <i18n-t keypath="settings.danger_zone.confirm_instruction" tag="span">
              <template #word>
                <strong class="text-error-300">
                  {{ $t('settings.danger_zone.confirm_word') }}
                </strong>
              </template>
            </i18n-t>
          </p>
          <UInput
            v-model="resetAllConfirmText"
            :placeholder="$t('settings.danger_zone.confirm_word')"
            class="font-mono"
          />
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          :disabled="resetAllConfirmText !== $t('settings.danger_zone.confirm_word')"
          @click="resetAllData"
        >
          {{ $t('settings.data_management.reset_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import { useTarkovStore } from '@/stores/useTarkov';
  import { logger } from '@/utils/logger';
  interface ResetConfig {
    resetFn: () => Promise<void>;
    successTitle: string;
    successDescription: string;
    errorLogContext: string;
    errorDescription: string;
    dialogRef: Ref<boolean>;
  }
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  const resetting = ref(false);
  const showResetPvPDialog = ref(false);
  const showResetPvEDialog = ref(false);
  const showResetSeasonalDialog = ref(false);
  const showResetAllDialog = ref(false);
  const resetAllConfirmText = ref('');
  watch(showResetAllDialog, (isOpen) => {
    if (!isOpen) {
      resetAllConfirmText.value = '';
    }
  });
  const createResetHandler = (config: ResetConfig) => async () => {
    resetting.value = true;
    try {
      await config.resetFn();
      toast.add({
        title: config.successTitle,
        description: config.successDescription,
        color: 'success',
      });
      config.dialogRef.value = false;
    } catch (error) {
      logger.error(`[DataManagement] Error resetting ${config.errorLogContext}:`, error);
      toast.add({
        title: t('common.reset_failed'),
        description: config.errorDescription,
        color: 'error',
      });
    } finally {
      resetting.value = false;
    }
  };
  const resetPvPData = createResetHandler({
    resetFn: () => tarkovStore.resetPvPData(),
    successTitle: t('settings.reset_pvp.success_title'),
    successDescription: t('settings.reset_pvp.success_description'),
    errorLogContext: 'PvP data',
    errorDescription: t('settings.reset_pvp.error_description'),
    dialogRef: showResetPvPDialog,
  });
  const resetPvEData = createResetHandler({
    resetFn: () => tarkovStore.resetPvEData(),
    successTitle: t('settings.reset_pve.success_title'),
    successDescription: t('settings.reset_pve.success_description'),
    errorLogContext: 'PvE data',
    errorDescription: t('settings.reset_pve.error_description'),
    dialogRef: showResetPvEDialog,
  });
  const resetSeasonalData = createResetHandler({
    resetFn: () => tarkovStore.resetSeasonalData(),
    successTitle: t('settings.reset_seasonal.success_title', 'Seasonal PvP Data Reset'),
    successDescription: t(
      'settings.reset_seasonal.success_description',
      'Your active-season progress has been reset successfully.'
    ),
    errorLogContext: 'Seasonal PvP data',
    errorDescription: t(
      'settings.reset_seasonal.error_description',
      'Failed to reset Seasonal PvP data. Please try again.'
    ),
    dialogRef: showResetSeasonalDialog,
  });
  const resetAllData = createResetHandler({
    resetFn: () => tarkovStore.resetAllData(),
    successTitle: t('settings.reset_all.success_title'),
    successDescription: t('settings.reset_all.success_description'),
    errorLogContext: 'all data',
    errorDescription: t('settings.reset_all.error_description'),
    dialogRef: showResetAllDialog,
  });
</script>
