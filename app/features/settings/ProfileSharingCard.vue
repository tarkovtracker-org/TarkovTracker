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
                      :aria-label="
                        t(
                          'settings.profile_sharing.copy_link',
                          {
                            mode: option.label,
                          },
                          'Copy {mode} profile link'
                        )
                      "
                      @click="copyShareUrl(option.url)"
                    />
                  </div>
                </div>
                <USwitch
                  :model-value="visibility[option.mode]"
                  :disabled="saving[option.mode]"
                  :loading="saving[option.mode]"
                  :aria-label="
                    t(
                      'settings.profile_sharing.toggle_label',
                      {
                        mode: option.label,
                      },
                      'Toggle {mode} profile sharing'
                    )
                  "
                  @update:model-value="setVisibility(option.mode, $event)"
                />
              </div>
            </div>
          </div>
        </template>
        <LoggedOutPlaceholder
          v-else
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
  import LoggedOutPlaceholder from '@/features/settings/LoggedOutPlaceholder.vue';
  import {
    GAME_MODE_VALUES,
    GAME_MODE_UI,
    GAME_MODES,
    getGameModeSeasonNumber,
    type GameMode,
  } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  import {
    createProfileVisibility,
    fetchProfileVisibilityRows,
    isCurrentProfileVisibilityRequest,
    loadCurrentProfileVisibility,
  } from '@/utils/profileVisibility';
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
  const createModeFlags = (): Record<GameMode, boolean> =>
    Object.fromEntries(GAME_MODE_VALUES.map((mode) => [mode, false])) as Record<GameMode, boolean>;
  const visibility = reactive(createProfileVisibility());
  const saving = reactive(createModeFlags());
  const visibilitySaveIds = Object.fromEntries(GAME_MODE_VALUES.map((mode) => [mode, 0])) as Record<
    GameMode,
    number
  >;
  const loadError = ref('');
  let visibilityLoadId = 0;
  const buildShareUrl = (mode: GameMode): string => {
    if (!profileUserId.value) return `/profile?mode=${mode}`;
    const path = `/profile/${profileUserId.value}/${mode}`;
    return import.meta.client ? `${window.location.origin}${path}` : path;
  };
  const sharingOptions = computed(() => [
    {
      color: GAME_MODE_UI[GAME_MODES.PVP].color,
      label: t('common.pvp', 'PvP'),
      mode: GAME_MODES.PVP,
      url: buildShareUrl(GAME_MODES.PVP),
    },
    {
      color: GAME_MODE_UI[GAME_MODES.PVE].color,
      label: t('common.pve', 'PvE'),
      mode: GAME_MODES.PVE,
      url: buildShareUrl(GAME_MODES.PVE),
    },
    {
      color: GAME_MODE_UI[GAME_MODES.SEASONAL].color,
      label: t('common.seasonal_pvp', 'Seasonal PvP'),
      mode: GAME_MODES.SEASONAL,
      url: buildShareUrl(GAME_MODES.SEASONAL),
    },
  ]);
  const loadVisibility = async () => {
    const requestId = ++visibilityLoadId;
    Object.assign(visibility, createProfileVisibility());
    const userId = profileUserId.value;
    if (!userId) return;
    loadError.value = '';
    const result = await loadCurrentProfileVisibility(
      () => fetchProfileVisibilityRows($supabase.client, userId),
      () =>
        isCurrentProfileVisibilityRequest(requestId, visibilityLoadId, userId, profileUserId.value)
    );
    if (!result.current) return;
    if (!result.error) {
      Object.assign(visibility, result.visibility);
      return;
    }
    loadError.value = t('settings.profile_sharing.load_failed', 'Unable to load sharing settings.');
    logger.error('[ProfileSharingCard] Failed to load visibility:', {
      error: result.error,
      userId,
    });
  };
  const createVisibilitySaveGuard = (mode: GameMode, requestId: number, userId: string) => () =>
    isCurrentProfileVisibilityRequest(
      requestId,
      visibilitySaveIds[mode],
      userId,
      profileUserId.value
    );
  const restoreFailedVisibilitySave = (
    mode: GameMode,
    previous: boolean,
    error: unknown,
    isCurrentSave: () => boolean
  ) => {
    if (!isCurrentSave()) return;
    visibility[mode] = previous;
    loadError.value = t(
      'settings.profile_sharing.save_failed',
      'Unable to update sharing settings.'
    );
    logger.error('[ProfileSharingCard] Failed to update visibility:', { error, mode });
  };
  const finishVisibilitySave = (mode: GameMode, isCurrentSave: () => boolean) => {
    if (isCurrentSave()) saving[mode] = false;
  };
  const beginVisibilitySave = (mode: GameMode) => {
    if (saving[mode]) return null;
    const userId = profileUserId.value;
    if (!userId) return null;
    const requestId = ++visibilitySaveIds[mode];
    return {
      isCurrent: createVisibilitySaveGuard(mode, requestId, userId),
    };
  };
  const persistVisibility = async (mode: GameMode, value: boolean) => {
    const { error } = await $supabase.client.rpc('set_game_mode_profile_visibility', {
      p_game_mode: mode,
      p_profile_public: value,
      p_season_number: getGameModeSeasonNumber(mode),
    });
    if (error) throw error;
  };
  const setVisibility = async (mode: GameMode, value: boolean) => {
    const save = beginVisibilitySave(mode);
    if (!save) return;
    const previous = visibility[mode];
    visibility[mode] = value;
    saving[mode] = true;
    loadError.value = '';
    try {
      await persistVisibility(mode, value);
    } catch (error) {
      restoreFailedVisibilitySave(mode, previous, error, save.isCurrent);
    } finally {
      finishVisibilitySave(mode, save.isCurrent);
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
  watch(
    profileUserId,
    () => {
      for (const mode of [GAME_MODES.PVP, GAME_MODES.PVE, GAME_MODES.SEASONAL]) {
        visibilitySaveIds[mode] += 1;
        saving[mode] = false;
      }
      void loadVisibility();
    },
    { immediate: true }
  );
</script>
