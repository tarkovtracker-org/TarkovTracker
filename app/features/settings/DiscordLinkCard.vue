<template>
  <GenericCard
    icon="i-mdi-discord"
    icon-color="primary"
    highlight-color="primary"
    :fill-height="false"
    :title="t('settings.discord_link.title', 'Discord Account')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <p class="text-surface-300 text-sm">
          {{
            t(
              'settings.discord_link.description',
              'Link your Discord account to receive the Linked role and keep supporter perks synchronized.'
            )
          }}
        </p>
        <UAlert
          v-if="errorMessage"
          :color="alertTone"
          variant="soft"
          icon="i-mdi-alert-circle"
          :title="alertTitle"
          :description="errorMessage"
        />
        <div v-if="link" class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-sm">
            <UIcon name="i-mdi-link-variant" class="text-success-400 size-5" />
            <span class="text-surface-100 font-medium">
              {{
                t(
                  'settings.discord_link.linked_as',
                  { username: link.discord_username },
                  'Linked as {username}'
                )
              }}
            </span>
          </div>
          <UButton
            color="primary"
            variant="soft"
            icon="i-mdi-sync"
            :loading="syncing"
            @click="synchronizeRoles"
          >
            {{ t('settings.discord_link.sync_roles', 'Sync Discord roles') }}
          </UButton>
          <UButton
            color="error"
            variant="soft"
            icon="i-mdi-link-variant-off"
            :loading="unlinking"
            @click="unlinkDiscord"
          >
            {{ t('settings.discord_link.unlink_account', 'Unlink Discord account') }}
          </UButton>
        </div>
        <UButton
          v-else-if="currentUserId"
          color="primary"
          icon="i-mdi-discord"
          :loading="linking || loading"
          @click="linkDiscord"
        >
          {{ t('settings.discord_link.link_account', 'Link Discord account') }}
        </UButton>
        <UButton
          v-else
          color="primary"
          icon="i-mdi-login"
          to="/login?redirect=%2Fsettings%23account"
        >
          {{ t('settings.discord_link.login_to_link', 'Log in to link Discord') }}
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
  interface RoleSyncResponse {
    reason?: string;
    synced?: boolean;
  }
  interface DiscordUnlinkResponse {
    reason?: string;
    revoked?: boolean;
  }
  const LINK_LOAD_RETRY_ATTEMPTS = 4;
  const LINK_LOAD_RETRY_DELAY_MS = 400;
  const { $supabase } = useNuxtApp();
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const router = useRouter();
  const link = ref<DiscordAccountLink | null>(null);
  const loading = ref(false);
  const linking = ref(false);
  const syncing = ref(false);
  const unlinking = ref(false);
  const errorMessage = ref<string | null>(null);
  const alertTone = ref<'error' | 'warning'>('error');
  const alertTitle = computed(() =>
    alertTone.value === 'warning'
      ? t('settings.discord_link.not_in_guild_title', 'Join the Discord server')
      : t('settings.discord_link.error_title', 'Discord link unavailable')
  );
  const currentUserId = computed(() => $supabase.user?.id ?? null);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const loadLink = async () => {
    const userId = $supabase.user?.id;
    if (!userId) return;
    loading.value = true;
    errorMessage.value = null;
    alertTone.value = 'error';
    try {
      const { data, error } = await $supabase.client
        .from('discord_account_links')
        .select('discord_username')
        .eq('user_id', userId)
        .maybeSingle<DiscordAccountLink>();
      if (error) throw error;
      link.value = data;
    } catch (error) {
      logger.error('[DiscordLinkCard] Failed to load Discord account link', { userId, error });
      errorMessage.value = t(
        'settings.discord_link.load_error',
        'We could not load your Discord account link.'
      );
    } finally {
      loading.value = false;
    }
  };
  const loadLinkWithRetry = async () => {
    for (let attempt = 0; attempt < LINK_LOAD_RETRY_ATTEMPTS; attempt += 1) {
      await loadLink();
      if (link.value) return;
      // Transient PostgREST / trigger races after OAuth should not stop retries.
      // Keep the last error only after the final attempt.
      if (attempt < LINK_LOAD_RETRY_ATTEMPTS - 1) {
        errorMessage.value = null;
        await sleep(LINK_LOAD_RETRY_DELAY_MS);
      }
    }
  };
  const synchronizeRoles = async () => {
    if (!link.value || syncing.value) return;
    syncing.value = true;
    errorMessage.value = null;
    alertTone.value = 'error';
    try {
      const { data, error } = await $supabase.client.functions.invoke<RoleSyncResponse>(
        'discord-role-sync',
        {
          body: {},
        }
      );
      if (error) throw error;
      if (data?.synced === false && data.reason === 'not_in_guild') {
        alertTone.value = 'warning';
        errorMessage.value = t(
          'settings.discord_link.not_in_guild',
          'Your account is linked, but you must join the TarkovTracker Discord server before roles can be synchronized.'
        );
      }
    } catch (error) {
      logger.error('[DiscordLinkCard] Failed to synchronize Discord roles', {
        userId: $supabase.user?.id,
        error,
      });
      errorMessage.value = t(
        'settings.discord_link.sync_error',
        'Your account is linked, but we could not synchronize Discord roles. Please try again later.'
      );
    } finally {
      syncing.value = false;
    }
  };
  const unlinkDiscord = async () => {
    if (!link.value || unlinking.value) return;
    unlinking.value = true;
    errorMessage.value = null;
    alertTone.value = 'error';
    let restoreRolesOnFailure = false;
    try {
      const { data: userData, error: userError } = await $supabase.client.auth.getUser();
      if (userError) throw userError;
      const identities = userData.user?.identities ?? [];
      const discordIdentity = identities.find((identity) => identity.provider === 'discord');
      if (!discordIdentity) {
        throw new Error('Discord identity was not found');
      }
      if (identities.length < 2) {
        errorMessage.value = t(
          'settings.discord_link.unlink_requires_login',
          'Add another login method before unlinking your only sign-in identity.'
        );
        return;
      }
      restoreRolesOnFailure = true;
      const { error: revokeError } = await $supabase.client.functions.invoke<DiscordUnlinkResponse>(
        'discord-unlink',
        { body: {} }
      );
      if (revokeError) throw revokeError;
      const { error: unlinkError } = await $supabase.client.auth.unlinkIdentity(discordIdentity);
      if (unlinkError) throw unlinkError;
      restoreRolesOnFailure = false;
      link.value = null;
    } catch (error) {
      if (restoreRolesOnFailure) {
        await synchronizeRoles();
      }
      logger.error('[DiscordLinkCard] Failed to unlink Discord account', {
        userId: $supabase.user?.id,
        error,
      });
      errorMessage.value = t(
        'settings.discord_link.unlink_error',
        'We could not unlink your Discord account. Your link remains active.'
      );
    } finally {
      unlinking.value = false;
    }
  };
  const linkDiscord = async () => {
    if (linking.value) return;
    linking.value = true;
    errorMessage.value = null;
    alertTone.value = 'error';
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
      logger.error('[DiscordLinkCard] Failed to start Discord account link', {
        userId: $supabase.user?.id,
        error,
      });
      errorMessage.value = t(
        'settings.discord_link.link_error',
        'We could not start Discord account linking. Please try again.'
      );
      linking.value = false;
    }
  };
  const clearDiscordLinkedQuery = async () => {
    if (route.query.discord_linked !== '1') return;
    const query = { ...route.query };
    delete query.discord_linked;
    // Preserve the account tab hash so query cleanup does not bounce the tab.
    await router.replace({ query, hash: route.hash || '#account' });
  };
  onMounted(async () => {
    if (route.query.discord_linked === '1') {
      try {
        await $supabase.ready?.();
      } catch (error) {
        logger.warn('[DiscordLinkCard] Supabase ready failed after Discord link return', {
          userId: $supabase.user?.id,
          error,
        });
      }
      await loadLinkWithRetry();
      if (link.value) {
        await synchronizeRoles();
      }
      await clearDiscordLinkedQuery();
      return;
    }
    await loadLink();
  });
</script>
