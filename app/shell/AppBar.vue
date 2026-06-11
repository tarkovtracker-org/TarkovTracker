<template>
  <header
    class="fixed top-0 right-0 z-40 h-11 border-b shadow-[0_1px_0_rgba(0,0,0,0.4)]"
    :class="
      currentMode === 'pve'
        ? 'border-pve-700/60 bg-surface-900'
        : 'border-pvp-700/60 bg-surface-900'
    "
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
          class="transition-transform duration-200"
          @click.stop="changeNavigationDrawer"
        />
      </AppTooltip>
      <!-- Center: Page Title & Omnibar Search -->
      <span class="flex min-w-0 flex-1 items-center gap-4">
        <span class="hidden truncate text-base leading-none font-semibold text-white md:inline">
          {{ pageTitle }}
        </span>
        <button
          type="button"
          class="bg-surface-800/40 border-surface-700/60 hover:bg-surface-800/80 hover:border-surface-600 flex h-8 w-full max-w-xs cursor-pointer items-center justify-between rounded-lg border px-3 text-left transition-colors"
          :aria-label="t('omnibar.open_aria', 'Open global search')"
          :aria-keyshortcuts="omnibarAriaKeyshortcuts"
          @click="openOmnibar"
        >
          <span class="text-surface-400 flex items-center gap-2 text-xs">
            <UIcon name="i-heroicons-magnifying-glass" class="h-4 w-4" />
            {{ t('omnibar.trigger_label', 'Search...') }}
          </span>
          <span class="hidden items-center gap-0.5 sm:flex">
            <template v-for="(part, index) in omnibarShortcutParts" :key="index">
              <span v-if="index > 0" class="text-surface-500 text-[10px]">+</span>
              <UKbd size="sm">{{ part }}</UKbd>
            </template>
          </span>
        </button>
      </span>
      <!-- Right: Status Icons & Settings -->
      <div class="ml-auto flex items-center gap-1 sm:gap-2">
        <div class="flex min-w-[3.5rem] items-center justify-end gap-1 sm:min-w-[4rem] sm:gap-2">
          <span class="flex h-7 w-7 items-center justify-center">
            <AppTooltip v-if="dataError" :text="t('app_bar.error_loading')">
              <span class="inline-flex rounded">
                <UIcon name="i-mdi-database-alert" class="text-error-500 h-5 w-5" />
              </span>
            </AppTooltip>
          </span>
          <span class="flex h-7 w-7 items-center justify-center">
            <AppTooltip v-if="dataLoading || hideoutLoading" :text="t('app_bar.loading')">
              <span class="inline-flex rounded">
                <UIcon
                  name="i-heroicons-arrow-path"
                  class="text-primary-500 h-5 w-5 animate-spin"
                />
              </span>
            </AppTooltip>
          </span>
        </div>
        <div class="shrink-0">
          <UPopover :content="{ align: 'end', side: 'bottom', sideOffset: 10 }">
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-heroicons-bell"
              :aria-label="t('activity_log.aria_label', 'Activity Log')"
              class="relative"
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
        </div>
        <div class="shrink-0">
          <GlobalHelpLauncher />
        </div>
        <!-- Community Links -->
        <AppTooltip :text="t('footer.call_to_action.discord')">
          <a
            href="https://discord.gg/M8nBgA2sT6"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="t('footer.call_to_action.discord')"
            class="hover:bg-surface-700 group flex h-7 w-7 items-center justify-center rounded transition-colors"
          >
            <DiscordIcon class="text-discord group-hover:text-discord-hover" />
          </a>
        </AppTooltip>
        <AppTooltip :text="t('footer.call_to_action.github')">
          <a
            href="https://github.com/tarkovtracker-org/TarkovTracker"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="t('footer.call_to_action.github')"
            class="hover:bg-surface-700 flex h-7 w-7 items-center justify-center rounded transition-colors"
          >
            <UIcon name="i-mdi-github" class="text-surface-300 h-4.5 w-4.5 hover:text-white" />
          </a>
        </AppTooltip>
        <SelectMenuFixed
          id="app-locale-select"
          v-model="selectedLocale"
          :items="localeItems"
          :aria-label="t('settings.locale')"
          value-key="value"
          class="shrink-0"
          :ui="localeSelectUi"
        >
          <template #leading>
            <UIcon name="i-mdi-translate" class="text-surface-300 h-4 w-4 shrink-0" />
          </template>
        </SelectMenuFixed>
        <NuxtLink
          v-if="supporterTier"
          to="/supporter"
          :class="[
            'inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-xs font-semibold text-white shadow-sm shadow-black/30 transition-all duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-sm',
            supporterBadgeClass,
          ]"
          :aria-label="supporterBadgeAriaLabel"
          :title="supporterBadgeAriaLabel"
        >
          <UIcon :name="supporterBadgeIcon" class="h-3.5 w-3.5 shrink-0 text-white" />
          <span class="hidden sm:inline">{{ supporterBadgeLabel }}</span>
        </NuxtLink>
        <NuxtLink
          v-else
          to="/supporter"
          class="border-success-500 bg-success-600 hover:border-success-400 hover:bg-success-500 inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-xs font-semibold text-white shadow-sm shadow-black/30 transition-all duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-sm"
          :aria-label="t('footer.support_button')"
        >
          <UIcon name="i-mdi-heart" class="h-3.5 w-3.5 shrink-0 text-white" />
          <span class="hidden sm:inline">{{ t('footer.support_button') }}</span>
        </NuxtLink>
        <div class="bg-surface-700/50 mx-1 h-5 w-px" />
        <div
          class="flex items-center justify-end"
          :class="isLoggedIn ? 'min-w-[2.75rem] sm:min-w-[10rem]' : ''"
        >
          <template v-if="isLoggedIn">
            <UDropdownMenu :items="accountMenuItems" :content="{ align: 'end', sideOffset: 8 }">
              <button
                type="button"
                class="bg-surface-800/50 border-surface-600 hover:bg-surface-800 flex min-h-8 items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors sm:w-full sm:max-w-40"
                :aria-label="t('navigation_drawer.account_menu')"
              >
                <img
                  :src="avatarSrc"
                  :alt="t('app_bar.user_avatar_alt')"
                  class="h-4 w-4 shrink-0 rounded-full"
                  loading="lazy"
                />
                <span
                  class="text-surface-200 hidden min-w-0 flex-1 truncate text-sm leading-none font-medium sm:inline"
                >
                  {{ userDisplayName }}
                </span>
                <UIcon name="i-mdi-chevron-down" class="text-surface-400 h-3.5 w-3.5 shrink-0" />
              </button>
            </UDropdownMenu>
          </template>
          <template v-else>
            <div class="flex w-full items-center justify-end gap-1 sm:gap-2">
              <AppTooltip :text="t('navigation_drawer.settings')">
                <NuxtLink
                  to="/settings"
                  class="hover:bg-surface-700 flex h-7 w-7 items-center justify-center rounded transition-colors"
                  :aria-label="t('navigation_drawer.settings')"
                >
                  <UIcon
                    name="i-mdi-cog-outline"
                    class="text-surface-300 h-4.5 w-4.5 hover:text-white"
                  />
                </NuxtLink>
              </AppTooltip>
              <NuxtLink
                to="/login"
                class="hover:bg-surface-700 hidden min-h-8 items-center rounded px-2 py-1 text-sm leading-none text-white sm:inline-flex"
              >
                <span class="leading-none">{{ t('navigation_drawer.login') }}</span>
              </NuxtLink>
              <NuxtLink
                to="/login"
                class="hover:bg-surface-700 rounded p-1 text-white sm:hidden"
                :aria-label="t('navigation_drawer.login')"
              >
                <UIcon name="i-mdi-fingerprint" class="h-4 w-4" />
              </NuxtLink>
            </div>
          </template>
        </div>
      </div>
    </div>
    <Omnibar v-if="omnibarMounted" v-model:open="omnibarOpen" />
  </header>
</template>
<script setup lang="ts">
  import { useWindowSize } from '@vueuse/core';
  import { storeToRefs } from 'pinia';
  import { useKeybinds } from '@/composables/useKeybinds';
  import { useSupporter } from '@/composables/useSupporter';
  import { useActivityLogStore } from '@/stores/useActivityLogStore';
  import { useAppStore } from '@/stores/useApp';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { DEFAULT_KEYBINDS } from '@/utils/keybinds';
  import { logger } from '@/utils/logger';
  import type { DropdownMenuItem } from '@nuxt/ui';
  const { availableLocales, locale, setLocale, t, te } = useI18n({ useScope: 'global' });
  const appStore = useAppStore();
  const activityLogStore = useActivityLogStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const Omnibar = defineAsyncComponent(() => import('@/features/omnibar/Omnibar.vue'));
  const ActivityLogPanel = defineAsyncComponent(() => import('@/shell/ActivityLogPanel.vue'));
  // Initialize global keyboard shortcuts (Undo: CTRL+Z, Search: CTRL+Q or /)
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
  const { activeTier: supporterTier } = useSupporter();
  const supporterBadgeLabel = computed(() => {
    const tier = supporterTier.value;
    if (!tier) return '';
    if (tier === 'supporter') {
      return t('app_bar.supporter_badge_label', 'Supporter');
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
        return 'border-surface-500 bg-gradient-to-r from-surface-600 to-surface-700 hover:from-surface-500 hover:to-surface-600';
      default:
        return 'border-success-500 bg-success-600 hover:border-success-400 hover:bg-success-500';
    }
  });
  const skillCalculation = useSkillCalculation();
  const route = useRoute();
  const { $supabase } = useNuxtApp();
  const toast = useToast();
  const isLoggedIn = computed(() => $supabase.user?.loggedIn ?? false);
  const avatarSrc = computed(() => {
    return preferencesStore.getStreamerMode || !$supabase.user.photoURL
      ? '/img/default-avatar.svg'
      : $supabase.user.photoURL;
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
        label: t('navigation_drawer.settings'),
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
  async function logout() {
    try {
      await $supabase.signOut();
    } catch (error) {
      logger.error('[AppBar] Sign out failed:', error);
      toast.add({
        title: t('app_bar.logout_failed'),
        color: 'error',
      });
    }
  }
  const { width } = useWindowSize();
  const mdAndDown = computed(() => width.value < 960);
  const isDrawerCollapsed = computed(() => {
    if (mdAndDown.value) {
      return !appStore.mobileDrawerExpanded;
    }
    return appStore.drawerRail;
  });
  const NAV_BAR_ICON = 'i-mdi-menu-open';
  const { loading: dataLoading, hideoutLoading } = storeToRefs(metadataStore);
  const dataError = ref(false);
  const normalizeRouteParam = (value: unknown): string | null => {
    if (Array.isArray(value)) {
      return normalizeRouteParam(value[0]);
    }
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  const profileRouteName = computed(() => {
    const rawRouteName = String(route.name || 'index');
    const normalizedRouteName = rawRouteName.split('___')[0] || rawRouteName;
    return normalizedRouteName.replaceAll('-', '_');
  });
  const profileRouteMode = computed(() => {
    const routeParams = (route.params as Record<string, unknown> | undefined) ?? {};
    const mode = normalizeRouteParam(routeParams.mode)?.toLowerCase();
    if (mode === 'pve') {
      return 'pve';
    }
    if (mode === 'pvp') {
      return 'pvp';
    }
    return tarkovStore.getCurrentGameMode();
  });
  const profileRouteTitle = computed(() => {
    if (profileRouteName.value !== 'profile_userId_mode') {
      return null;
    }
    const modeLabel = profileRouteMode.value === 'pve' ? 'PVE' : 'PVP';
    const routeParams = (route.params as Record<string, unknown> | undefined) ?? {};
    const routeUserId = normalizeRouteParam(routeParams.userId);
    const currentUserId = normalizeRouteParam($supabase.user?.id ?? null);
    const isOwnProfileRoute =
      typeof routeUserId === 'string' &&
      typeof currentUserId === 'string' &&
      routeUserId === currentUserId;
    if (isOwnProfileRoute) {
      if (preferencesStore.getStreamerMode) {
        return t('profile.title_with_mode', { name: t('app_bar.hidden_label'), mode: modeLabel });
      }
      const modeData =
        profileRouteMode.value === 'pve'
          ? tarkovStore.getPvEProgressData()
          : tarkovStore.getPvPProgressData();
      const modeDisplayName =
        typeof modeData.displayName === 'string' ? modeData.displayName.trim() : '';
      if (modeDisplayName) {
        return t('profile.title_with_mode', { name: modeDisplayName, mode: modeLabel });
      }
      const ownDisplayName = tarkovStore.getDisplayName()?.trim();
      if (ownDisplayName) {
        return t('profile.title_with_mode', { name: ownDisplayName, mode: modeLabel });
      }
      const accountName = ($supabase.user.displayName || $supabase.user.username || '').trim();
      if (accountName) {
        return t('profile.title_with_mode', { name: accountName, mode: modeLabel });
      }
      return t('profile.title_with_mode', { name: t('app_bar.user_label'), mode: modeLabel });
    }
    if (routeUserId) {
      return t('profile.title_with_mode', { name: routeUserId, mode: modeLabel });
    }
    return t('profile.title_with_mode', {
      name: t('page.profile.shared_player'),
      mode: modeLabel,
    });
  });
  const pageTitle = computed(() => {
    if (profileRouteTitle.value) {
      return profileRouteTitle.value;
    }
    const routeName = profileRouteName.value;
    const titleKeys = [
      routeName === 'neededitems' ? 'page.needed_items.title' : `page.${routeName}.appbar_title`,
      `page.${routeName}.title`,
      `page.${routeName}.meta.title`,
      routeName === 'admin' ? 'admin.title' : '',
      `navigation_drawer.${routeName}`,
    ];
    const titleKey = titleKeys.find((key) => key && te(key));
    if (titleKey) {
      return t(titleKey);
    }
    return routeName
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  });
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
  const isAvailableLocale = (value: string): value is typeof locale.value =>
    (availableLocales as readonly string[]).includes(value);
  const localeItems = computed(() => {
    return availableLocales.map((localeCode) => ({
      label: localeCode.toUpperCase(),
      value: localeCode,
    }));
  });
  const localeSelectUi = {
    base: 'focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 bg-surface-800/60 border-surface-700 hover:bg-surface-800 flex min-h-8 items-center gap-1 rounded border px-2 py-1 ring-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2',
    content:
      'max-h-80 bg-surface-900 border border-surface-700 rounded-lg shadow-xl z-[9999] min-w-[var(--reka-combobox-trigger-width)]',
    item: 'px-3 py-2 text-sm cursor-pointer transition-colors rounded text-surface-300 data-[highlighted]:bg-surface-800 data-[highlighted]:text-white data-[state=checked]:bg-surface-700 data-[state=checked]:text-white data-[state=checked]:font-medium',
    itemLabel: 'whitespace-nowrap uppercase',
    itemTrailingIcon: 'text-surface-400 shrink-0 size-4',
    leading: 'shrink-0 text-surface-300',
    trailing: 'shrink-0 text-surface-400',
    trailingIcon: 'text-surface-400 shrink-0 size-4',
    value: 'text-surface-200 text-xs leading-none font-medium uppercase',
    viewport: 'p-1 max-h-none overflow-visible',
  } as const;
  let latestLocaleSwitchRequestId = 0;
  async function applyLocaleSelection(newLocale: string) {
    if (!isAvailableLocale(newLocale) || newLocale === locale.value) return;
    const requestId = ++latestLocaleSwitchRequestId;
    logger.debug('[AppBar] Setting locale to:', newLocale);
    const previousLocale = locale.value;
    const previousLocaleOverride = preferencesStore.getLocaleOverride;
    let localeStateApplied = false;
    try {
      await setLocale(newLocale);
      if (requestId !== latestLocaleSwitchRequestId) return;
      preferencesStore.setLocaleOverride(newLocale);
      metadataStore.updateLanguageAndGameMode(newLocale);
      localeStateApplied = true;
      await metadataStore.fetchAllData(false);
      if (requestId !== latestLocaleSwitchRequestId) return;
      skillCalculation.migrateLegacySkillOffsets();
      dataError.value = false;
    } catch (err) {
      if (requestId !== latestLocaleSwitchRequestId) return;
      logger.error('[AppBar] Error switching locale:', err);
      if (localeStateApplied) {
        if (locale.value !== previousLocale) {
          await setLocale(previousLocale).catch((rollbackError) => {
            logger.debug('[AppBar] rollback to previousLocale failed', {
              previousLocale,
              rollbackError,
            });
          });
        }
        preferencesStore.setLocaleOverride(previousLocaleOverride);
        metadataStore.updateLanguageAndGameMode(previousLocaleOverride ?? previousLocale);
      }
      dataError.value = true;
    }
  }
  const selectedLocale = computed({
    get() {
      return locale.value;
    },
    set(newValue: string) {
      if (!newValue) return;
      void applyLocaleSelection(newValue);
    },
  });
</script>
