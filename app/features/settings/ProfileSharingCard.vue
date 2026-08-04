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
      <div class="relative px-4 py-4">
        <template v-if="isLoggedIn">
          <div class="space-y-4">
            <p class="text-surface-400 text-sm">
              {{
                t(
                  'settings.profile_sharing.description',
                  'Control which game mode profiles can be viewed from a shared link.'
                )
              }}
            </p>
            <UAlert
              v-if="loadError"
              icon="i-mdi-alert-circle"
              color="error"
              variant="soft"
              :title="loadError"
            />
            <div class="space-y-3">
              <div
                v-for="option in sharingOptions"
                :key="option.mode"
                class="bg-surface-800/50 border-surface-700 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              >
                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <UBadge :color="option.color" variant="soft" size="sm">
                      {{ option.label }}
                    </UBadge>
                    <span class="text-surface-300 text-xs">
                      {{ getVisibilityLabel(option.mode) }}
                    </span>
                  </div>
                  <div class="flex min-w-0 items-center gap-1.5">
                    <a
                      :href="option.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-info-300 hover:text-info-200 truncate text-[11px] transition-colors"
                    >
                      {{ option.url }}
                    </a>
                    <UButton
                      icon="i-mdi-content-copy"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="t('settings.profile_sharing.copy_link', { mode: option.label })"
                      @click="copyShareUrl(option.url)"
                    />
                  </div>
                </div>
                <USwitch
                  :model-value="visibility[option.mode]"
                  :disabled="saving[option.mode]"
                  :loading="saving[option.mode]"
                  :aria-label="t('settings.profile_sharing.toggle_label', { mode: option.label })"
                  @update:model-value="setVisibility(option.mode, $event)"
                />
              </div>
            </div>
          </div>
        </template>
        <UAlert
          v-else
          icon="i-mdi-lock"
          color="warning"
          variant="soft"
          :title="
            t(
              'settings.profile_sharing.login_required',
              'Log in to manage profile sharing visibility.'
            )
          "
        >
          <template #description>
            <NuxtLink
              to="/login"
              class="text-warning-300 hover:text-warning-200 underline transition-colors"
            >
              {{ t('navigation_drawer.login', 'Log in') }}
            </NuxtLink>
          </template>
        </UAlert>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { GAME_MODES, getGameModeSeasonNumber, type GameMode } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  import type { SupabaseUser } from '@/types/supabase-plugin';
  const { t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const { copyToClipboard } = useCopyToClipboard();
  const typedUser = computed<SupabaseUser | null>(() => $supabase.user ?? null);
  const isLoggedIn = computed(() => Boolean(typedUser.value?.loggedIn && typedUser.value?.id));
  const profileUserId = computed(() => {
    const value = typedUser.value?.id;
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  });
  const visibility = reactive<Record<GameMode, boolean>>({
    pvp: false,
    pve: false,
    seasonal: false,
  });
  const saving = reactive<Record<GameMode, boolean>>({
    pvp: false,
    pve: false,
    seasonal: false,
  });
  const loadError = ref('');
  let visibilityLoadId = 0;
  const buildShareUrl = (mode: GameMode): string => {
    if (!profileUserId.value) return `/profile?mode=${mode}`;
    const path = `/profile/${profileUserId.value}/${mode}`;
    return import.meta.client ? `${window.location.origin}${path}` : path;
  };
  const sharingOptions = computed(() => [
    {
      color: 'pvp' as const,
      label: t('common.pvp', 'PvP'),
      mode: GAME_MODES.PVP,
      url: buildShareUrl(GAME_MODES.PVP),
    },
    {
      color: 'pve' as const,
      label: t('common.pve', 'PvE'),
      mode: GAME_MODES.PVE,
      url: buildShareUrl(GAME_MODES.PVE),
    },
    {
      color: 'warning' as const,
      label: t('common.seasonal_pvp', 'Seasonal PvP'),
      mode: GAME_MODES.SEASONAL,
      url: buildShareUrl(GAME_MODES.SEASONAL),
    },
  ]);
  const loadVisibility = async () => {
    const requestId = ++visibilityLoadId;
    visibility.pvp = false;
    visibility.pve = false;
    visibility.seasonal = false;
    const userId = profileUserId.value;
    if (!userId) return;
    loadError.value = '';
    const { data, error } = await $supabase.client
      .from('user_game_mode_progress')
      .select('game_mode,season_number,profile_public')
      .eq('user_id', userId);
    if (requestId !== visibilityLoadId || profileUserId.value !== userId) return;
    if (error) {
      loadError.value = t(
        'settings.profile_sharing.load_failed',
        'Unable to load sharing settings.'
      );
      logger.error('[ProfileSharingCard] Failed to load visibility:', error);
      return;
    }
    for (const row of data ?? []) {
      const mode = row.game_mode as GameMode;
      if (!(mode in visibility)) continue;
      if (row.season_number !== getGameModeSeasonNumber(mode)) continue;
      visibility[mode] = row.profile_public === true;
    }
  };
  const setVisibility = async (mode: GameMode, value: boolean) => {
    if (saving[mode]) return;
    const previous = visibility[mode];
    visibility[mode] = value;
    saving[mode] = true;
    loadError.value = '';
    try {
      const { error } = await $supabase.client.rpc('set_game_mode_profile_visibility', {
        p_game_mode: mode,
        p_profile_public: value,
        p_season_number: getGameModeSeasonNumber(mode),
      });
      if (error) throw error;
    } catch (error) {
      visibility[mode] = previous;
      loadError.value = t(
        'settings.profile_sharing.save_failed',
        'Unable to update sharing settings.'
      );
      logger.error('[ProfileSharingCard] Failed to update visibility:', { error, mode });
    } finally {
      saving[mode] = false;
    }
  };
  const copyShareUrl = async (url: string) => {
    try {
      await copyToClipboard(url);
    } catch (error) {
      logger.error('[ProfileSharingCard] Failed to copy URL to clipboard:', error);
    }
  };
  const getVisibilityLabel = (mode: GameMode) =>
    visibility[mode]
      ? t('settings.profile_sharing.public', 'Public')
      : t('settings.profile_sharing.private', 'Private');
  watch(profileUserId, () => void loadVisibility(), { immediate: true });
</script>
