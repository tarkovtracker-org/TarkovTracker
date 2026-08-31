<script setup lang="ts">
  import { usePromotedTwitch, type PromotedTwitchConfig } from '@/composables/usePromotedTwitch';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import {
    ADMIN_ERROR_CODES,
    ADMIN_ERROR_LOCALE_KEYS,
    getAdminErrorCode,
  } from '@/utils/adminErrors';
  import { logger } from '@/utils/logger';
  const { $supabase } = useNuxtApp();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { systemStore } = useSystemStoreWithSupabase();
  const { applyConfig: applySharedConfig } = usePromotedTwitch();
  const CHANNEL_MAX_LENGTH = 25;
  const DISPLAY_NAME_MAX_LENGTH = 50;
  type TwitchConfig = Omit<PromotedTwitchConfig, 'version'>;
  interface TwitchConfigSaveResult {
    cacheInvalidated: boolean;
    config: TwitchConfig;
    version: number;
  }
  const channel = ref('');
  const displayName = ref('');
  const enabled = ref(true);
  const isLoading = ref(true);
  const isSaving = ref(false);
  const canSave = computed(
    () => systemStore.isAdmin && channel.value.trim().length > 0 && !isSaving.value
  );
  const applyConfig = (config: TwitchConfig): void => {
    channel.value = config.channel;
    displayName.value = config.displayName;
    enabled.value = config.enabled;
  };
  const loadConfig = async () => {
    isLoading.value = true;
    try {
      applyConfig(await $fetch<TwitchConfig>('/api/twitch/config', { cache: 'no-store' }));
    } catch (error) {
      logger.warn('[AdminTwitchConfigCard] Failed to load Twitch config', error);
      toast.add({
        title: t('admin.twitch_config_load_failed_title', 'Twitch config unavailable'),
        description: t(
          'admin.twitch_config_load_failed_description',
          'Could not load the current Twitch config.'
        ),
        color: 'error',
        icon: 'i-mdi-alert-circle',
      });
    } finally {
      isLoading.value = false;
    }
  };
  const getAuthToken = async (): Promise<string | null | undefined> => {
    const sessionResp = await $supabase.client.auth.getSession();
    const token = sessionResp.data.session?.access_token;
    if (token) return token;
    const refreshed = await $supabase.client.auth.refreshSession();
    return refreshed.data.session?.access_token;
  };
  const errorMessage = (error: unknown): string => {
    const code = getAdminErrorCode(error);
    if (code) {
      return t(ADMIN_ERROR_LOCALE_KEYS[code], 'Could not update Twitch config.');
    }
    return t('admin.twitch_config_failed_description', 'Could not update Twitch config.');
  };
  const showSaveResult = (saved: TwitchConfigSaveResult): void => {
    if (saved.cacheInvalidated) {
      toast.add({
        title: t('admin.twitch_config_saved_title', 'Twitch config updated'),
        description: t(
          'admin.twitch_config_saved_description',
          { channel: channel.value },
          'Promoted stream is now {channel}.'
        ),
        color: 'success',
        icon: 'i-mdi-check-circle',
      });
      return;
    }
    toast.add({
      title: t('admin.twitch_config_saved_with_warning_title', 'Twitch config saved'),
      description: t(
        'admin.twitch_config_saved_with_warning_description',
        'The config was saved, but cached visitors may still see the previous value.'
      ),
      color: 'warning',
      icon: 'i-mdi-alert',
    });
  };
  const saveConfig = async () => {
    if (!canSave.value) return;
    isSaving.value = true;
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.add({
          title: t('common.update_failed', 'Update failed'),
          description: t(
            ADMIN_ERROR_LOCALE_KEYS[ADMIN_ERROR_CODES.AUTHENTICATION_REQUIRED],
            'You must be signed in to continue.'
          ),
          color: 'error',
          icon: 'i-mdi-alert-circle',
        });
        return;
      }
      const saved = await $fetch<TwitchConfigSaveResult>('/api/admin/twitch-config', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          channel: channel.value.trim().toLowerCase(),
          displayName: displayName.value.trim(),
          enabled: enabled.value,
        },
      });
      applyConfig(saved.config);
      applySharedConfig({ ...saved.config, version: saved.version });
      showSaveResult(saved);
    } catch (error) {
      logger.warn('[AdminTwitchConfigCard] Failed to save Twitch config', error);
      toast.add({
        title: t('common.update_failed', 'Update failed'),
        description: errorMessage(error),
        color: 'error',
        icon: 'i-mdi-alert-circle',
      });
    } finally {
      isSaving.value = false;
    }
  };
  onMounted(loadConfig);
</script>
<template>
  <GenericCard
    icon="i-mdi-twitch"
    icon-color="primary"
    highlight-color="primary"
    :fill-height="false"
    :title="t('admin.twitch_config_title', 'Twitch Stream')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <p class="text-surface-300 text-sm">
          {{
            t(
              'admin.twitch_config_description',
              'Set the Twitch channel promoted in the corner of the site. Visitors pick up the change within five minutes.'
            )
          }}
        </p>
        <div v-if="isLoading" class="flex items-center justify-center py-6">
          <UIcon name="i-mdi-loading" class="text-surface-400 size-6 animate-spin" />
        </div>
        <template v-else>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField name="twitchChannel" :label="t('admin.twitch_channel_label', 'Channel')">
              <UInput
                v-model="channel"
                class="w-full"
                :maxlength="CHANNEL_MAX_LENGTH"
                :placeholder="t('admin.twitch_channel_placeholder', 'Twitch channel name')"
              />
            </UFormField>
            <UFormField
              name="twitchDisplayName"
              :label="t('admin.twitch_display_name_label', 'Display name')"
            >
              <UInput
                v-model="displayName"
                class="w-full"
                :maxlength="DISPLAY_NAME_MAX_LENGTH"
                :placeholder="t('admin.twitch_display_name_placeholder', 'Channel display name')"
              />
            </UFormField>
          </div>
          <div class="flex items-end">
            <USwitch
              v-model="enabled"
              :label="enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')"
            />
          </div>
          <div class="flex justify-end">
            <UButton
              color="primary"
              icon="i-mdi-content-save"
              :disabled="!canSave"
              :loading="isSaving"
              @click="saveConfig"
            >
              {{ t('common.apply', 'Apply') }}
            </UButton>
          </div>
        </template>
      </div>
    </template>
  </GenericCard>
</template>
