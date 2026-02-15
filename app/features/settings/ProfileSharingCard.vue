<template>
  <GenericCard
    icon="mdi-share-variant"
    icon-color="info"
    highlight-color="info"
    :fill-height="false"
    :title="t('settings.profile_sharing.title', 'Profile Sharing')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <p class="text-surface-400 text-sm">
          {{
            t(
              'settings.profile_sharing.description',
              'Control which game mode profiles can be viewed from a shared link.'
            )
          }}
        </p>
        <div class="space-y-3">
          <div
            class="bg-surface-800/50 border-surface-700 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
          >
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <UBadge color="pvp" variant="soft" size="sm">PvP</UBadge>
                <span class="text-surface-300 text-xs">{{ pvpVisibilityLabel }}</span>
              </div>
              <div class="flex min-w-0 items-center gap-1.5">
                <a
                  :href="pvpShareUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-info-300 hover:text-info-200 truncate text-[11px] transition-colors"
                >
                  {{ pvpShareUrl }}
                </a>
                <UButton
                  icon="i-mdi-content-copy"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="!isLoggedIn"
                  :aria-label="t('settings.profile_sharing.copy_link', 'Copy profile link')"
                  @click="copyShareUrl(pvpShareUrl)"
                />
              </div>
            </div>
            <USwitch v-model="pvpPublic" :disabled="!isLoggedIn" />
          </div>
          <div
            class="bg-surface-800/50 border-surface-700 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
          >
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <UBadge color="pve" variant="soft" size="sm">PvE</UBadge>
                <span class="text-surface-300 text-xs">{{ pveVisibilityLabel }}</span>
              </div>
              <div class="flex min-w-0 items-center gap-1.5">
                <a
                  :href="pveShareUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-info-300 hover:text-info-200 truncate text-[11px] transition-colors"
                >
                  {{ pveShareUrl }}
                </a>
                <UButton
                  icon="i-mdi-content-copy"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="!isLoggedIn"
                  :aria-label="t('settings.profile_sharing.copy_link', 'Copy profile link')"
                  @click="copyShareUrl(pveShareUrl)"
                />
              </div>
            </div>
            <USwitch v-model="pvePublic" :disabled="!isLoggedIn" />
          </div>
        </div>
        <UAlert
          v-if="!isLoggedIn"
          icon="i-mdi-lock"
          color="warning"
          variant="soft"
          :title="
            t(
              'settings.profile_sharing.login_required',
              'Log in to manage profile sharing visibility.'
            )
          "
        />
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { GAME_MODES } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  import type { SupabaseUser } from '@/types/supabase-plugin';
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const { $supabase } = useNuxtApp();
  const typedUser = computed<SupabaseUser | null>(() => {
    const supabase = $supabase as { user?: SupabaseUser } | undefined;
    return supabase?.user ?? null;
  });
  const isLoggedIn = computed(() => Boolean(typedUser.value?.loggedIn && typedUser.value?.id));
  const profileUserId = computed(() => {
    const value = typedUser.value?.id;
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  });
  const buildShareUrl = (mode: 'pvp' | 'pve'): string => {
    if (!profileUserId.value) {
      return `/profile?mode=${mode}`;
    }
    const path = `/profile/${profileUserId.value}/${mode}`;
    if (import.meta.client && typeof window !== 'undefined') {
      return `${window.location.origin}${path}`;
    }
    return path;
  };
  const pvpPublic = computed({
    get: () => preferencesStore.getProfileSharePvpPublic,
    set: (value: boolean) => preferencesStore.setProfileSharePvpPublic(value),
  });
  const pvePublic = computed({
    get: () => preferencesStore.getProfileSharePvePublic,
    set: (value: boolean) => preferencesStore.setProfileSharePvePublic(value),
  });
  const pvpShareUrl = computed(() => buildShareUrl(GAME_MODES.PVP));
  const pveShareUrl = computed(() => buildShareUrl(GAME_MODES.PVE));
  const { copyToClipboard } = useCopyToClipboard();
  const copyShareUrl = async (url: string) => {
    try {
      await copyToClipboard(url);
    } catch (error) {
      logger.error('[ProfileSharingCard] Failed to copy URL to clipboard:', error);
    }
  };
  const pvpVisibilityLabel = computed(() =>
    pvpPublic.value
      ? t('settings.profile_sharing.public', 'Public')
      : t('settings.profile_sharing.private', 'Private')
  );
  const pveVisibilityLabel = computed(() =>
    pvePublic.value
      ? t('settings.profile_sharing.public', 'Public')
      : t('settings.profile_sharing.private', 'Private')
  );
</script>
