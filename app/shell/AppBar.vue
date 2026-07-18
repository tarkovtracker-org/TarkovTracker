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
      <!-- Right: Status indicators + two control groups -->
      <div class="ml-auto flex items-center gap-3">
        <!-- Status indicators (non-interactive, shown only when active) -->
        <div class="flex items-center justify-end gap-1">
          <AppTooltip v-if="dataError" :text="t('app_bar.error_loading')">
            <span class="flex h-9 w-9 items-center justify-center">
              <UIcon name="i-mdi-database-alert" class="text-error-500 h-4 w-4" />
            </span>
          </AppTooltip>
          <AppTooltip v-if="dataLoading || hideoutLoading" :text="t('app_bar.loading')">
            <span class="flex h-9 w-9 items-center justify-center">
              <UIcon name="i-heroicons-arrow-path" class="text-primary-500 h-4 w-4 animate-spin" />
            </span>
          </AppTooltip>
        </div>
        <!-- Group 1: Utilities (Bell + Help) -->
        <div class="flex items-center gap-1">
          <AppTooltip :text="t('activity_log.aria_label', 'Activity Log')">
            <UPopover :content="{ align: 'end', side: 'bottom', sideOffset: 10 }">
              <UButton
                color="neutral"
                variant="ghost"
                size="md"
                icon="i-heroicons-bell"
                :aria-label="t('activity_log.aria_label', 'Activity Log')"
                class="relative h-9 w-9"
              >
                <span v-if="activityLogStore.hasUnread" class="sr-only" aria-live="polite">
                  {{ t('activity_log.unread_indicator', 'You have unread activity') }}
                </span>
                <span
                  v-if="activityLogStore.hasUnread"
                  aria-hidden="true"
                  class="bg-error-500 ring-surface-900 absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full ring-2"
                />
              </UButton>
              <template #content>
                <ActivityLogPanel />
              </template>
            </UPopover>
          </AppTooltip>
          <GlobalHelpLauncher />
        </div>
        <!-- Group 2: Preferences & Actions (Language + Support + Account) -->
        <div class="flex items-center gap-1.5">
          <SelectMenuFixed
            id="app-locale-select"
            v-model="selectedLocale"
            :items="localeItems"
            :aria-label="t('settings.locale')"
            value-key="value"
            class="hidden shrink-0 sm:block"
            :ui="localeSelectUi"
          >
            <template #leading>
              <UIcon name="i-mdi-translate" class="text-surface-400 h-4 w-4 shrink-0" />
            </template>
          </SelectMenuFixed>
          <span v-if="supporterTier" class="hidden sm:inline-flex">
            <AppTooltip :text="supporterBadgeAriaLabel">
              <NuxtLink
                to="/supporter"
                :class="[
                  'inline-flex h-9 items-center gap-1.5 rounded-md border px-0 text-[13px] font-semibold text-white transition-colors md:w-auto md:px-3',
                  'w-9 justify-center',
                  supporterBadgeClass,
                ]"
                :aria-label="supporterBadgeAriaLabel"
              >
                <UIcon :name="supporterBadgeIcon" class="h-4 w-4 shrink-0 text-white" />
                <span class="hidden md:inline">{{ supporterBadgeLabel }}</span>
              </NuxtLink>
            </AppTooltip>
          </span>
          <span v-else class="hidden sm:inline-flex">
            <AppTooltip :text="t('footer.support_button')">
              <NuxtLink
                to="/supporter"
                class="border-success-500/50 bg-success-500/5 text-success-400 hover:bg-success-500/10 hover:border-success-500/70 inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-md border px-0 text-[13px] font-semibold transition-colors md:w-auto md:px-3"
                :aria-label="t('footer.support_button')"
              >
                <UIcon name="i-mdi-heart" class="h-4 w-4 shrink-0" />
                <span class="hidden md:inline">{{ t('footer.support_button') }}</span>
              </NuxtLink>
            </AppTooltip>
          </span>
          <span class="sm:hidden">
            <AppTooltip :text="t('app_bar.more_aria', 'More')">
              <UDropdownMenu :items="moreMenuItems" :content="{ align: 'end', sideOffset: 8 }">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="md"
                  icon="i-mdi-dots-horizontal"
                  :aria-label="t('app_bar.more_aria', 'More')"
                  class="h-9 w-9"
                />
              </UDropdownMenu>
            </AppTooltip>
          </span>
          <AppTooltip :text="t('navigation_drawer.account_menu')">
            <UDropdownMenu
              v-if="isLoggedIn"
              :items="accountMenuItems"
              :content="{ align: 'end', sideOffset: 8 }"
            >
              <button
                type="button"
                class="bg-surface-800/50 border-surface-600 hover:bg-surface-800 flex h-9 items-center gap-2 rounded-md border px-2 py-1.5 transition-colors sm:max-w-40"
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
                  class="text-surface-200 hidden min-w-0 flex-1 truncate text-[13px] leading-none font-medium sm:inline"
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
              class="bg-primary-600 hover:bg-primary-500 border-primary-500 flex h-9 items-center gap-1.5 rounded-md border px-3.5 text-[13px] leading-none font-semibold text-white transition-colors"
              :aria-label="t('app_bar.login_aria', 'Log in to your account')"
            >
              <UIcon name="i-mdi-account-outline" class="h-4 w-4 shrink-0" />
              <span class="leading-none">{{ t('navigation_drawer.login') }}</span>
            </NuxtLink>
          </AppTooltip>
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
  import { getResourceBySlug } from '@/features/resources/resourceData';
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
  const moreMenuItems = computed<DropdownMenuItem[][]>(() => [
    [
      {
        icon: 'i-mdi-translate',
        label: t('settings.locale'),
        children: (availableLocales as readonly string[]).map((localeCode) => ({
          label: localeCode.toUpperCase(),
          onSelect: () => {
            void applyLocaleSelection(localeCode);
          },
        })),
      },
      {
        icon: 'i-mdi-heart-outline',
        label: t('footer.support_button'),
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
    if (routeName === 'resources_slug') {
      const routeParams = (route.params as Record<string, unknown> | undefined) ?? {};
      const resourceSlug = normalizeRouteParam(routeParams.slug);
      if (resourceSlug) {
        const resource = getResourceBySlug(resourceSlug);
        const itemNameKey = `page.resources.items.${resourceSlug}.name`;
        if (resource?.hasGuide && te(itemNameKey)) {
          const resourceName = t(itemNameKey);
          return t(
            'page.resources.guide_title_template',
            { name: resourceName },
            `${resourceName} Guide`
          );
        }
      }
      return t('page.resources.title', 'Resources & Guides');
    }
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
    base: 'focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 bg-surface-800/30 border-surface-700/40 hover:bg-surface-800/60 hover:border-surface-600/60 flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1 ring-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2',
    content:
      'max-h-80 bg-surface-900 border border-surface-700 rounded-lg shadow-xl z-[9999] min-w-[var(--reka-combobox-trigger-width)]',
    item: 'px-3 py-2 text-sm cursor-pointer transition-colors rounded text-surface-300 data-[highlighted]:bg-surface-800 data-[highlighted]:text-white data-[state=checked]:bg-surface-700 data-[state=checked]:text-white data-[state=checked]:font-medium',
    itemLabel: 'whitespace-nowrap uppercase',
    itemTrailingIcon: 'text-surface-400 shrink-0 size-4',
    leading: 'shrink-0 text-surface-400',
    trailing: 'shrink-0 text-surface-400',
    trailingIcon: 'text-surface-400 shrink-0 size-3.5',
    value: 'text-surface-300 text-[13px] leading-none font-medium uppercase',
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
