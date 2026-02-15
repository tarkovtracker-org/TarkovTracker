<template>
  <div class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-5xl space-y-4">
      <ProfileSharingCard />
      <PrivacyCard />
      <GenericCard
        icon="mdi-key-chain"
        icon-color="secondary"
        highlight-color="secondary"
        :fill-height="false"
        :title="$t('page.settings.card.apitokens.title')"
        title-classes="text-lg font-semibold"
      >
        <template #content>
          <div class="relative px-4 py-4">
            <ApiTokens v-if="isLoggedIn" />
            <UAlert
              v-else
              color="warning"
              variant="soft"
              icon="i-mdi-lock"
              :title="$t('page.settings.card.apitokens.not_logged_in')"
            />
          </div>
        </template>
      </GenericCard>
      <AccountDeletionCard
        :show-reset-actions="true"
        @reset-pvp="showResetPvPDialog = true"
        @reset-pve="showResetPvEDialog = true"
        @reset-all="showResetAllDialog = true"
      />
      <div v-if="isAdmin" class="flex justify-center pt-4">
        <NuxtLink
          to="/admin"
          class="hover:text-error-400 text-surface-500 flex items-center gap-1.5 text-xs transition-colors"
        >
          <UIcon name="i-mdi-shield-crown" class="size-3.5" />
          {{ $t('settings.general.admin_panel') }}
        </NuxtLink>
      </div>
    </div>
    <UModal v-model:open="showResetPvPDialog">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-mdi-alert" class="text-pvp-400 h-5 w-5" />
          <h3 class="text-lg font-semibold">
            {{ $t('settings.data_management.reset_pvp_title') }}
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
            {{ $t('settings.data_management.reset_cancel') }}
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
    <UModal v-model:open="showResetPvEDialog">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-mdi-alert" class="text-pve-400 h-5 w-5" />
          <h3 class="text-lg font-semibold">
            {{ $t('settings.data_management.reset_pve_title') }}
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
            {{ $t('settings.data_management.reset_cancel') }}
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
    <UModal v-model:open="showResetAllDialog" @close="resetAllConfirmText = ''">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-mdi-alert-octagon" class="text-error-400 h-5 w-5" />
          <h3 class="text-lg font-semibold">
            {{ $t('settings.data_management.reset_all_title') }}
          </h3>
        </div>
      </template>
      <template #body>
        <div class="space-y-4">
          <UAlert
            icon="i-mdi-alert-octagon"
            color="error"
            variant="subtle"
            :title="$t('settings.data_management.reset_all_confirmation')"
          />
          <p class="text-surface-200 text-sm">
            {{ $t('settings.data_management.reset_all_warning') }}
          </p>
          <div class="space-y-2">
            <p class="text-surface-100 text-sm font-medium">
              <i18n-t keypath="settings.danger_zone.confirm_delete_instruction" tag="span">
                <template #word>
                  <strong class="text-error-400">
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
            {{ $t('settings.data_management.reset_cancel') }}
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
  </div>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import AccountDeletionCard from '@/features/settings/AccountDeletionCard.vue';
  import ApiTokens from '@/features/settings/ApiTokens.vue';
  import PrivacyCard from '@/features/settings/PrivacyCard.vue';
  import ProfileSharingCard from '@/features/settings/ProfileSharingCard.vue';
  import { useSystemStore, useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { logger } from '@/utils/logger';
  useSeoMeta({
    title: 'Account',
    description:
      'Manage your TarkovTracker account options, sharing visibility, and data controls.',
    robots: 'noindex, nofollow',
  });
  const { t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const toast = useToast();
  const { hasInitiallyLoaded } = useSystemStoreWithSupabase();
  const isLoggedIn = computed(() => Boolean($supabase?.user?.loggedIn));
  const systemStore = useSystemStore();
  const tarkovStore = useTarkovStore();
  const resetting = ref(false);
  const showResetPvPDialog = ref(false);
  const showResetPvEDialog = ref(false);
  const showResetAllDialog = ref(false);
  const resetAllConfirmText = ref('');
  const isAdmin = computed(() => hasInitiallyLoaded.value && systemStore.isAdmin);
  interface ResetConfig {
    resetFn: () => Promise<void>;
    successTitle: string;
    successDescription: string;
    errorLogContext: string;
    errorDescription: string;
    dialogRef: Ref<boolean>;
    onSuccess?: () => void;
  }
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
      if (config.onSuccess) {
        config.onSuccess();
      }
    } catch (error) {
      logger.error(`[Account] Error resetting ${config.errorLogContext}:`, error);
      toast.add({
        title: t('settings.reset.error_title'),
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
  const resetAllData = createResetHandler({
    resetFn: () => tarkovStore.resetAllData(),
    successTitle: t('settings.reset_all.success_title'),
    successDescription: t('settings.reset_all.success_description'),
    errorLogContext: 'all data',
    errorDescription: t('settings.reset_all.error_description'),
    dialogRef: showResetAllDialog,
  });
</script>
