<template>
  <GenericCard
    icon="i-mdi-discord"
    icon-color="primary"
    highlight-color="primary"
    :fill-height="false"
    :title="t('settings.discord_link.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <p class="text-surface-300 text-sm">
          {{ t('settings.discord_link.description') }}
        </p>
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-mdi-alert-circle"
          :title="t('settings.discord_link.error_title')"
          :description="errorMessage"
        />
        <div v-if="link" class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-sm">
            <UIcon name="i-mdi-link-variant" class="text-success-400 size-5" />
            <span class="text-surface-100 font-medium">
              {{ t('settings.discord_link.linked_as', { username: link.discord_username }) }}
            </span>
          </div>
          <UButton
            color="primary"
            variant="soft"
            icon="i-mdi-sync"
            :loading="syncing"
            @click="synchronizeRoles"
          >
            {{ t('settings.discord_link.sync_roles') }}
          </UButton>
        </div>
        <UButton
          v-else
          color="primary"
          icon="i-mdi-discord"
          :loading="linking || loading"
          @click="linkDiscord"
        >
          {{ t('settings.discord_link.link_account') }}
        </UButton>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  interface DiscordAccountLink {
    discord_username: string;
  }
  const { $supabase } = useNuxtApp();
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const router = useRouter();
  const link = ref<DiscordAccountLink | null>(null);
  const loading = ref(false);
  const linking = ref(false);
  const syncing = ref(false);
  const errorMessage = ref<string | null>(null);
  const loadLink = async () => {
    const userId = $supabase.user?.id;
    if (!userId) return;
    loading.value = true;
    errorMessage.value = null;
    try {
      const { data, error } = await $supabase.client
        .from('discord_account_links')
        .select('discord_username')
        .eq('user_id', userId)
        .maybeSingle<DiscordAccountLink>();
      if (error) throw error;
      link.value = data;
    } catch (error) {
      logger.error('[DiscordLinkCard] Failed to load Discord account link', error);
      errorMessage.value = t('settings.discord_link.load_error');
    } finally {
      loading.value = false;
    }
  };
  const synchronizeRoles = async () => {
    if (!link.value || syncing.value) return;
    syncing.value = true;
    errorMessage.value = null;
    try {
      const { error } = await $supabase.client.functions.invoke('discord-role-sync', {
        body: {},
      });
      if (error) throw error;
    } catch (error) {
      logger.error('[DiscordLinkCard] Failed to synchronize Discord roles', error);
      errorMessage.value = t('settings.discord_link.sync_error');
    } finally {
      syncing.value = false;
    }
  };
  const linkDiscord = async () => {
    if (linking.value) return;
    linking.value = true;
    errorMessage.value = null;
    try {
      const redirectTo = `${window.location.origin}/settings?discord_linked=1#account`;
      const { data, error } = await $supabase.client.auth.linkIdentity({
        provider: 'discord',
        options: { redirectTo },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Discord did not return a linking URL');
      window.location.assign(data.url);
    } catch (error) {
      logger.error('[DiscordLinkCard] Failed to start Discord account link', error);
      errorMessage.value = t('settings.discord_link.link_error');
      linking.value = false;
    }
  };
  onMounted(async () => {
    await loadLink();
    if (route.query.discord_linked === '1' && link.value) {
      await synchronizeRoles();
      const query = { ...route.query };
      delete query.discord_linked;
      await router.replace({ query });
    }
  });
</script>
