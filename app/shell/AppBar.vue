<template>
  <header
    class="fixed top-0 right-0 z-40 h-11 border-b shadow-[0_1px_0_rgba(0,0,0,0.4)]"
    :class="modeHeaderClass"
  >
    <div class="flex h-full items-center gap-1 px-2 sm:gap-2 sm:px-3">
      <!-- Left: Toggle Button -->
      <AppTooltip :text="t('navigation_drawer.toggle')">
        <UButton
          :icon="NAV_BAR_ICON"
          variant="ghost"
          color="neutral"
          size="md"
          :aria-label="t('navigation_drawer.toggle')"
          :class="{ 'rotate-180': isDrawerCollapsed }"
          class="h-8 w-8 transition-transform duration-200"
          @click.stop="changeNavigationDrawer"
        />
      </AppTooltip>
      <!-- Center: Omnibar Search -->
      <div class="flex min-w-0 flex-1 items-center">
        <button
          type="button"
          class="bg-surface-800/40 border-surface-700/60 hover:bg-surface-800/80 hover:border-surface-600 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border px-0 text-left transition-colors sm:w-full sm:max-w-sm sm:min-w-0 sm:shrink sm:justify-between sm:px-2.5 lg:max-w-md"
          :aria-label="t('omnibar.open_aria', 'Open global search')"
          :aria-keyshortcuts="omnibarAriaKeyshortcuts"
          @click="openOmnibar"
        >
          <span class="text-surface-400 flex min-w-0 items-center gap-2 text-xs">
            <UIcon name="i-heroicons-magnifying-glass" class="h-4 w-4 shrink-0" />
            <span class="hidden truncate sm:inline">
              {{ t('omnibar.trigger_label', 'Search...') }}
            </span>
          </span>
          <span class="hidden shrink-0 items-center gap-0.5 lg:flex">
            <template v-for="(part, index) in omnibarShortcutParts" :key="index">
              <span v-if="index > 0" class="text-surface-500 text-[10px]">+</span>
              <UKbd size="sm">{{ part }}</UKbd>
            </template>
          </span>
        </button>
      </div>
      <!-- Right: Status indicators + grouped controls -->
      <div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <!-- Status indicators (non-interactive, shown only when active) -->
        <div class="flex items-center justify-end gap-0.5">
          <AppTooltip v-if="dataError" :text="t('app_bar.error_loading')">
            <span class="flex h-8 w-8 items-center justify-center">
              <UIcon
                name="i-mdi-database-alert"
                class="text-error-500 light:text-error-800 h-4 w-4"
              />
            </span>
          </AppTooltip>
          <AppTooltip
            v-if="dataLoading || hideoutLoading || localeSwitchPending"
            :text="t('app_bar.loading')"
          >
            <span class="flex h-8 w-8 items-center justify-center">
              <UIcon
                name="i-heroicons-arrow-path"
                class="text-primary-500 light:text-primary-800 h-4 w-4 animate-spin"
              />
            </span>
          </AppTooltip>
          <ProgressSaveStatusIndicator />
        </div>
        <!-- Utility group: Theme + Activity + Help + Language + community links -->
        <div class="bg-surface-800/40 flex items-center rounded-lg">
          <AppTooltip :text="themeToggleLabel">
            <UButton
              color="neutral"
              variant="ghost"
              size="md"
              :icon="isLightTheme ? 'i-heroicons-moon' : 'i-heroicons-sun'"
              :aria-label="themeToggleLabel"
              class="hidden h-8 w-8 sm:inline-flex"
              @click="toggleThemeMode"
            />
          </AppTooltip>
          <AppTooltip :text="t('common.activity_log', 'Activity Log')">
            <UPopover :content="{ align: 'end', side: 'bottom', sideOffset: 10 }">
              <UButton
                color="neutral"
                variant="ghost"
                size="md"
                icon="i-heroicons-bell"
                :aria-label="t('common.activity_log', 'Activity Log')"
                class="relative h-8 w-8"
              >
                <span v-if="activityLogStore.hasUnread" class="sr-only" aria-live="polite">
                  {{ t('activity_log.unread_indicator', 'You have unread activity') }}
                </span>
                <span
                  v-if="activityLogStore.hasUnread"
                  aria-hidden="true"
                  class="bg-error-500 ring-surface-900 absolute top-1 right-1 flex h-2 w-2 rounded-full ring-2"
                />
              </UButton>
              <template #content>
                <ActivityLogPanel />
              </template>
            </UPopover>
          </AppTooltip>
          <GlobalHelpLauncher />
          <AppTooltip :text="localeTooltip">
            <UDropdownMenu :items="localeMenuItems" :content="{ align: 'end', sideOffset: 8 }">
              <UButton
                color="neutral"
                variant="ghost"
                size="md"
                icon="i-mdi-translate"
                :aria-label="localeTooltip"
                :loading="localeSwitchPending"
                :disabled="localeSwitchPending"
                data-testid="app-locale-menu"
                class="hidden h-8 w-8 justify-center sm:inline-flex"
              />
            </UDropdownMenu>
          </AppTooltip>
          <AppTooltip :text="t('footer.call_to_action.discord', 'Discord')">
            <a
              href="https://discord.gg/M8nBgA2sT6"
              target="_blank"
              rel="noopener noreferrer"
              class="text-surface-400 hover:bg-surface-700/60 hover:text-discord hidden h-8 w-8 items-center justify-center rounded-md transition-colors sm:inline-flex"
              :aria-label="t('footer.call_to_action.discord', 'Discord')"
            >
              <DiscordIcon class="h-4 w-4" />
            </a>
          </AppTooltip>
          <AppTooltip :text="t('footer.call_to_action.github', 'GitHub')">
            <a
              href="https://github.com/tarkovtracker-org/TarkovTracker"
              target="_blank"
              rel="noopener noreferrer"
              class="text-surface-400 hover:bg-surface-700/60 hover:text-surface-50 hidden h-8 w-8 items-center justify-center rounded-md transition-colors sm:inline-flex"
              :aria-label="t('footer.call_to_action.github', 'GitHub')"
            >
              <UIcon name="i-mdi-github" class="h-4 w-4" />
            </a>
          </AppTooltip>
        </div>
        <!-- Visual separator between utility and account zones -->
        <div class="bg-surface-700/60 hidden h-4 w-px sm:block" aria-hidden="true" />
        <!-- Account zone: Support + Account -->
        <div class="flex items-center gap-1 sm:gap-1.5">
          <span v-if="supporterTier" class="hidden sm:inline-flex">
            <AppTooltip :text="supporterBadgeAriaLabel">
              <NuxtLink
                to="/supporter"
                :class="[
                  'inline-flex h-8 items-center gap-1.5 rounded-md border px-0 text-[13px] font-semibold text-white transition-colors md:w-auto md:px-2.5',
                  'w-8 justify-center',
                  supporterBadgeClass,
                ]"
                :aria-label="supporterBadgeAriaLabel"
              >
                <UIcon :name="supporterBadgeIcon" class="h-4 w-4 shrink-0" />
                <span class="hidden md:inline">{{ supporterBadgeLabel }}</span>
              </NuxtLink>
            </AppTooltip>
          </span>
          <span v-else class="hidden sm:inline-flex">
            <AppTooltip :text="t('common.support')">
              <NuxtLink
                to="/supporter"
                class="border-success-500/50 bg-success-500/5 text-success-400 hover:bg-success-500/10 hover:border-success-500/70 inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-md border px-0 text-[13px] font-semibold transition-colors md:w-auto md:px-2.5"
                :aria-label="t('common.support')"
              >
                <UIcon name="i-mdi-heart" class="h-4 w-4 shrink-0" />
                <span class="hidden md:inline">{{ t('common.support') }}</span>
              </NuxtLink>
            </AppTooltip>
          </span>
          <span class="sm:hidden">
            <AppTooltip :text="t('common.more', 'More')">
              <UDropdownMenu :items="moreMenuItems" :content="{ align: 'end', sideOffset: 8 }">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="md"
                  icon="i-mdi-dots-horizontal"
                  :aria-label="t('common.more', 'More')"
                  class="h-8 w-8"
                />
              </UDropdownMenu>
            </AppTooltip>
          </span>
          <AppTooltip :text="userDisplayName">
            <UDropdownMenu
              v-if="isLoggedIn"
              :items="accountMenuItems"
              :content="{ align: 'end', sideOffset: 8 }"
            >
              <button
                type="button"
                class="bg-surface-800/50 border-surface-600 hover:bg-surface-800 flex h-8 min-w-0 items-center gap-1.5 rounded-md border px-2 transition-colors sm:max-w-56"
                :aria-label="t('navigation_drawer.account_menu')"
              >
                <img
                  :src="effectiveAvatarSrc"
                  :alt="t('app_bar.user_avatar_alt')"
                  class="h-5 w-5 shrink-0 rounded-full"
                  loading="lazy"
                  @error="handleAvatarError"
                />
                <span
                  class="text-surface-200 hidden min-w-0 flex-1 truncate text-[13px] leading-none font-medium whitespace-nowrap sm:inline"
                  :data-long-name="userDisplayName.length > 24"
                  :title="userDisplayName"
                >
                  {{ userDisplayName }}
                </span>
                <UIcon name="i-mdi-chevron-down" class="text-surface-400 h-4 w-4 shrink-0" />
              </button>
            </UDropdownMenu>
          </AppTooltip>
          <AppTooltip v-if="!isLoggedIn" :text="t('app_bar.login_aria', 'Log in to your account')">
            <NuxtLink
              to="/login"
              class="bg-primary-500 light:bg-primary-800 hover:bg-primary-400 light:hover:bg-primary-900 border-primary-500 light:border-primary-800 text-surface-950 flex h-8 w-8 items-center justify-center gap-1.5 rounded-md border px-0 text-[13px] leading-none font-semibold transition-colors sm:w-auto sm:px-3"
              :aria-label="t('app_bar.login_aria', 'Log in to your account')"
            >
              <UIcon name="i-mdi-account-outline" class="h-4 w-4 shrink-0" />
              <span class="hidden leading-none sm:inline">{{ t('navigation_drawer.login') }}</span>
            </NuxtLink>
          </AppTooltip>
        </div>
      </div>
    </div>
    <Omnibar v-if="omnibarMounted" v-model:open="omnibarOpen" />
    <SignOutConfirmModal v-if="isLoggedIn" />
  </header>
</template>
<script setup lang="ts">
  import { useWindowSize } from '@vueuse/core';
  import { storeToRefs } from 'pinia';
  import { useKeybinds } from '@/composables/useKeybinds';
  import { useLocaleSwitch } from '@/composables/useLocaleSwitch';
  import { useSignOut } from '@/composables/useSignOut';
  import { useSupporter } from '@/composables/useSupporter';
  import { useTheme } from '@/composables/useTheme';
  import { useActivityLogStore } from '@/stores/useActivityLogStore';
  import { useAppStore } from '@/stores/useApp';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES } from '@/utils/constants';
  import { DEFAULT_KEYBINDS } from '@/utils/keybinds';
  import { getLocaleNativeName } from '@/utils/locales';
  import { SHELL_DESKTOP_BREAKPOINT_PX } from '@/utils/shellConfig';
  import type { DropdownMenuItem } from '@nuxt/ui';
  const { t, te } = useI18n({ useScope: 'global' });
  const { isLightTheme, toggleThemeMode } = useTheme();
  const themeToggleLabel = computed(() =>
    isLightTheme.value
      ? t('app_bar.switch_to_dark_theme', 'Switch to dark theme')
      : t('app_bar.switch_to_light_theme', 'Switch to light theme')
  );
  const appStore = useAppStore();
  const activityLogStore = useActivityLogStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const Omnibar = defineAsyncComponent(() => import('@/features/omnibar/Omnibar.vue'));
  const ActivityLogPanel = defineAsyncComponent(() => import('@/shell/ActivityLogPanel.vue'));
  // Initialize global keyboard shortcuts (Undo/Search defaults: Ctrl+Z/Ctrl+K, user-configurable)
  useKeybinds();
  const omnibarMounted = ref(false);
  const omnibarOpen = ref(false);
  function openOmnibar() {
    omnibarMounted.value = true;
    omnibarOpen.value = true;
  }
  const handleToggleOmnibar = () => {
    omnibarMounted.value = true;
    omnibarOpen.value = !omnibarOpen.value;
  };
  onMounted(() => {
    window.addEventListener('toggle-omnibar', handleToggleOmnibar);
  });
  onUnmounted(() => {
    window.removeEventListener('toggle-omnibar', handleToggleOmnibar);
  });
  const getOmnibarShortcutParts = () => {
    const shortcut = preferencesStore.getKeybindOmnibar || DEFAULT_KEYBINDS.omnibar;
    return shortcut.split('+').map((part) => part.trim());
  };
  const omnibarShortcutParts = computed(() =>
    getOmnibarShortcutParts().map((part) => {
      if (part === 'ctrl' || part === 'control') return 'Ctrl';
      if (part === 'alt') return 'Alt';
      if (part === 'shift') return 'Shift';
      if (part === 'meta') return 'Cmd';
      if (part === 'space') return 'Space';
      return part.toUpperCase();
    })
  );
  const omnibarAriaKeyshortcuts = computed(() =>
    getOmnibarShortcutParts()
      .map((part) => {
        if (part === 'ctrl') return 'Control';
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join('+')
  );
  const currentMode = computed(() => tarkovStore.getCurrentGameMode());
  const modeHeaderClass = computed(() => {
    if (currentMode.value === GAME_MODES.PVE) return 'border-pve-700/60 bg-surface-900';
    if (currentMode.value === GAME_MODES.SEASONAL) {
      return 'border-warning-700/60 bg-surface-900';
    }
    return 'border-pvp-700/60 bg-surface-900';
  });
  const { activeTier: supporterTier } = useSupporter();
  const supporterBadgeLabel = computed(() => {
    const tier = supporterTier.value;
    if (!tier) return '';
    if (tier === 'supporter') {
      return t('common.supporter', 'Supporter');
    }
    const tierKey = `page.supporter.tier_${tier}_name`;
    if (te(tierKey)) {
      return t(tierKey);
    }
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  });
  const supporterBadgeAriaLabel = computed(() =>
    t('app_bar.supporter_badge_aria', { tier: supporterBadgeLabel.value })
  );
  const supporterBadgeIcon = computed(() => {
    switch (supporterTier.value) {
      case 'chad':
        return 'i-mdi-crown';
      case 'timmy':
        return 'i-mdi-star';
      case 'scav':
        return 'i-mdi-shield-star';
      default:
        return 'i-mdi-heart';
    }
  });
  const supporterBadgeClass = computed(() => {
    switch (supporterTier.value) {
      case 'chad':
        return 'border-amber-400 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500';
      case 'timmy':
        return 'border-primary-400 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500';
      case 'scav':
        return 'border-surface-500 bg-gradient-to-r from-surface-600 to-surface-700 hover:from-surface-500 hover:to-surface-600 light:text-surface-50 light:hover:from-surface-700 light:hover:to-surface-600';
      default:
        return 'border-success-500 bg-success-600 hover:border-success-400 hover:bg-success-500';
    }
  });
  const { $supabase } = useNuxtApp();
  const isLoggedIn = computed(() => $supabase.user?.loggedIn ?? false);
  const avatarSrc = computed(() => {
    return preferencesStore.getStreamerMode || !$supabase.user.photoURL
      ? '/img/default-avatar.svg'
      : $supabase.user.photoURL;
  });
  const avatarFailed = ref(false);
  const effectiveAvatarSrc = computed(() =>
    avatarFailed.value ? '/img/default-avatar.svg' : avatarSrc.value
  );
  function handleAvatarError() {
    avatarFailed.value = true;
  }
  watch(avatarSrc, () => {
    avatarFailed.value = false;
  });
  const userDisplayName = computed(() => {
    const fallbackLabel = t('app_bar.user_label');
    const hiddenLabel = t('app_bar.hidden_label');
    if (preferencesStore.getStreamerMode) return hiddenLabel;
    const displayName = tarkovStore.getDisplayName();
    if (displayName && displayName.trim() !== '') {
      return displayName;
    }
    return $supabase.user.displayName || $supabase.user.username || fallbackLabel;
  });
  const accountMenuItems = computed<DropdownMenuItem[][]>(() => [
    [
      {
        icon: 'i-mdi-account-outline',
        label: t('navigation_drawer.profile'),
        to: '/profile',
      },
      {
        icon: 'i-mdi-cog-outline',
        label: t('common.settings'),
        to: '/settings',
      },
    ],
    [
      {
        color: 'error',
        icon: 'i-mdi-logout',
        label: t('navigation_drawer.logout'),
        onSelect: () => {
          void logout();
        },
      },
    ],
  ]);
  const moreMenuItems = computed<DropdownMenuItem[][]>(() => [
    [
      {
        icon: isLightTheme.value ? 'i-heroicons-moon' : 'i-heroicons-sun',
        label: themeToggleLabel.value,
        onSelect: () => {
          toggleThemeMode();
        },
      },
      {
        icon: 'i-mdi-translate',
        label: t('settings.locale'),
        description: localeStatus.value || undefined,
        disabled: localeSwitchPending.value,
        children: localeMenuItems.value,
      },
      {
        icon: 'i-mdi-heart-outline',
        label: t('common.support'),
        to: '/supporter',
      },
    ],
    [
      {
        icon: 'i-mdi-discord',
        label: t('footer.call_to_action.discord'),
        onSelect: () => {
          window.open('https://discord.gg/M8nBgA2sT6', '_blank', 'noopener');
        },
      },
      {
        icon: 'i-mdi-github',
        label: t('footer.call_to_action.github'),
        onSelect: () => {
          window.open('https://github.com/tarkovtracker-org/TarkovTracker', '_blank', 'noopener');
        },
      },
    ],
  ]);
  const { requestSignOut } = useSignOut();
  async function logout() {
    await requestSignOut();
  }
  const { width } = useWindowSize();
  const mdAndDown = computed(() => width.value < SHELL_DESKTOP_BREAKPOINT_PX);
  const isDrawerCollapsed = computed(() => {
    if (mdAndDown.value) {
      return !appStore.mobileDrawerExpanded;
    }
    return appStore.drawerRail;
  });
  const NAV_BAR_ICON = 'i-mdi-menu-open';
  const { loading: dataLoading, hideoutLoading } = storeToRefs(metadataStore);
  const {
    locale,
    availableLocales,
    pending: localeSwitchPending,
    error: dataError,
    status: localeStatus,
    isDisabled: isLocaleDisabled,
    selectLocale,
  } = useLocaleSwitch();
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && appStore.mobileDrawerExpanded && mdAndDown.value) {
      event.preventDefault();
      appStore.setMobileDrawerExpanded(false);
    }
  }
  onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
  });
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
  function changeNavigationDrawer() {
    if (mdAndDown.value) {
      appStore.toggleMobileDrawerExpanded();
    } else {
      appStore.toggleDrawerRail();
    }
  }
  // Native names remain findable in every interface language.
  const localeMenuItems = computed<DropdownMenuItem[][]>(() => [
    availableLocales.map((localeCode) => ({
      label: getLocaleNativeName(localeCode),
      type: 'checkbox' as const,
      checked: localeCode === locale.value,
      disabled: isLocaleDisabled(localeCode),
      onSelect: () => {
        if (!isLocaleDisabled(localeCode)) void selectLocale(localeCode);
      },
    })),
    ...(localeStatus.value ? [[{ label: localeStatus.value, disabled: true }]] : []),
  ]);
  const localeTooltip = computed(
    () => localeStatus.value || `${t('settings.locale')}: ${getLocaleNativeName(locale.value)}`
  );
</script>
