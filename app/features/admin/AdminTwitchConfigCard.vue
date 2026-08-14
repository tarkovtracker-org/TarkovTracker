<script setup lang="ts">
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  const { $supabase } = useNuxtApp();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { systemStore } = useSystemStoreWithSupabase();
  interface TwitchConfig {
    channel: string;
    displayName: string;
    enabled: boolean;
  }
  const channel = ref('');
  const displayName = ref('');
  const enabled = ref(true);
  const isLoading = ref(true);
  const isSaving = ref(false);
  const canSave = computed(
    () => systemStore.isAdmin && channel.value.trim().length > 0 && !isSaving.value
  );
  const loadConfig = async () => {
    isLoading.value = true;
    try {
      const data = await $fetch<TwitchConfig>('/api/twitch/config');
      channel.value = data.channel;
      displayName.value = data.displayName;
      enabled.value = data.enabled;
    } catch {
      toast.add({
        title: t('admin.twitch_config_failed_title'),
        description: t('admin.twitch_config_failed_description'),
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
  const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : t('admin.twitch_config_failed_description');
  const saveConfig = async () => {
    if (!canSave.value) return;
    isSaving.value = true;
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error(t('admin.twitch_config_login_required'));
      }
      await $fetch('/api/admin/twitch-config', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          channel: channel.value.trim().toLowerCase(),
          displayName: displayName.value.trim(),
          enabled: enabled.value,
        },
      });
      toast.add({
        title: t('admin.twitch_config_saved_title'),
        description: t('admin.twitch_config_saved_description', {
          channel: channel.value.trim().toLowerCase(),
        }),
        color: 'success',
        icon: 'i-mdi-check-circle',
      });
    } catch (error) {
      toast.add({
        title: t('admin.twitch_config_failed_title'),
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
    :title="t('admin.twitch_config_title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <p class="text-surface-300 text-sm">
          {{ t('admin.twitch_config_description') }}
        </p>
        <div v-if="isLoading" class="flex items-center justify-center py-6">
          <UIcon name="i-mdi-loading" class="text-surface-400 size-6 animate-spin" />
        </div>
        <template v-else>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField name="twitchChannel" :label="t('admin.twitch_channel_label')">
              <UInput
                v-model="channel"
                class="w-full"
                :placeholder="t('admin.twitch_channel_placeholder')"
              />
            </UFormField>
            <UFormField name="twitchDisplayName" :label="t('admin.twitch_display_name_label')">
              <UInput
                v-model="displayName"
                class="w-full"
                :placeholder="t('admin.twitch_display_name_placeholder')"
              />
            </UFormField>
          </div>
          <div class="flex items-end">
            <USwitch
              v-model="enabled"
              :label="enabled ? t('admin.twitch_enabled_label') : t('admin.twitch_disabled_label')"
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
              {{ t('common.apply') }}
            </UButton>
          </div>
        </template>
      </div>
    </template>
  </GenericCard>
</template>
