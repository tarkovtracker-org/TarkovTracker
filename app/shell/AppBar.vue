<template>
  <header class="border-border bg-shell shadow-card fixed top-0 right-0 z-40 h-11 border-b">
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
      <!-- Center: Page Title -->
      <span class="flex min-w-0 flex-1 items-center">
        <span class="text-foreground truncate text-base leading-none font-semibold">
          {{ pageTitle }}
        </span>
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
          <GlobalHelpLauncher />
        </div>
        <!-- Community Links -->
        <AppTooltip :text="t('footer.call_to_action.discord')">
          <a
            href="https://discord.gg/M8nBgA2sT6"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="t('footer.call_to_action.discord')"
            class="group hover:bg-interactive flex h-7 w-7 items-center justify-center rounded transition-colors"
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
            class="hover:bg-interactive flex h-7 w-7 items-center justify-center rounded transition-colors"
          >
            <UIcon
              name="i-mdi-github"
              class="text-foreground-muted hover:text-foreground h-4.5 w-4.5 transition-colors"
            />
          </a>
        </AppTooltip>
        <label
          class="border-border bg-raised/70 text-foreground-muted focus-within:ring-primary-500 focus-within:ring-offset-shell flex min-h-8 items-center gap-1 rounded border px-2 focus-within:ring-2 focus-within:ring-offset-2"
        >
          <UIcon name="i-mdi-theme-light-dark" class="h-4 w-4 shrink-0" />
          <span class="sr-only">{{ t('settings.theme') }}</span>
          <select
            id="app-theme-select"
            v-model="selectedThemeMode"
            :aria-label="t('settings.theme')"
            name="theme"
            class="text-foreground h-6 bg-transparent py-1 text-xs leading-none font-medium focus:outline-none"
          >
            <option
              v-for="item in themeItems"
              :key="item.value"
              :value="item.value"
              class="bg-panel text-foreground"
            >
              {{ item.label }}
            </option>
          </select>
        </label>
        <label
          class="border-border bg-raised/70 text-foreground-muted focus-within:ring-primary-500 focus-within:ring-offset-shell flex min-h-8 items-center gap-1 rounded border px-2 focus-within:ring-2 focus-within:ring-offset-2"
        >
          <UIcon name="i-mdi-translate" class="h-4 w-4 shrink-0" />
          <span class="sr-only">{{ t('settings.locale') }}</span>
          <select
            id="app-locale-select"
            v-model="selectedLocale"
            :aria-label="t('settings.locale')"
            name="locale"
            class="text-foreground h-6 bg-transparent py-1 text-xs leading-none font-medium focus:outline-none"
          >
            <option
              v-for="item in localeItems"
              :key="item.value"
              :value="item.value"
              class="bg-panel text-foreground"
            >
              {{ item.label }}
            </option>
          </select>
        </label>
        <!-- Account section -->
        <div class="bg-border mx-1 h-5 w-px" />
        <div class="flex min-w-[2.75rem] items-center justify-end sm:min-w-[10rem]">
          <template v-if="isLoggedIn">
            <UDropdownMenu :items="accountMenuItems" :content="{ align: 'end', sideOffset: 8 }">
              <button
                type="button"
                class="border-border bg-raised/70 hover:bg-interactive flex min-h-8 items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors sm:w-full sm:max-w-40"
                :aria-label="t('navigation_drawer.account_menu')"
              >
                <img
                  :src="avatarSrc"
                  :alt="t('app_bar.user_avatar_alt')"
                  class="h-4 w-4 shrink-0 rounded-full"
                  loading="lazy"
                />
                <span
                  class="text-foreground hidden min-w-0 flex-1 truncate text-sm leading-none font-medium sm:inline"
                >
                  {{ userDisplayName }}
                </span>
                <UIcon
                  name="i-mdi-chevron-down"
                  class="text-foreground-subtle h-3.5 w-3.5 shrink-0"
                />
              </button>
            </UDropdownMenu>
          </template>
          <template v-else>
            <div class="flex w-full items-center justify-end gap-1 sm:gap-2">
              <AppTooltip :text="t('navigation_drawer.settings')">
                <NuxtLink
                  to="/settings"
                  class="hover:bg-interactive flex h-7 w-7 items-center justify-center rounded transition-colors"
                  :aria-label="t('navigation_drawer.settings')"
                >
                  <UIcon
                    name="i-mdi-cog-outline"
                    class="text-foreground-muted hover:text-foreground h-4.5 w-4.5 transition-colors"
                  />
                </NuxtLink>
              </AppTooltip>
              <NuxtLink
                to="/login"
                class="text-foreground hover:bg-interactive hidden min-h-8 items-center rounded px-2 py-1 text-sm leading-none transition-colors sm:inline-flex"
              >
                <span class="leading-none">{{ t('navigation_drawer.login') }}</span>
              </NuxtLink>
              <NuxtLink
                to="/login"
                class="text-foreground hover:bg-interactive rounded p-1 transition-colors sm:hidden"
                :aria-label="t('navigation_drawer.login')"
              >
                <UIcon name="i-mdi-fingerprint" class="h-4 w-4" />
              </NuxtLink>
            </div>
          </template>
        </div>
      </div>
    </div>
  </header>
</template>
<script setup lang="ts">
  import { useWindowSize } from '@vueuse/core';
  import { storeToRefs } from 'pinia';
  import { useAppStore } from '@/stores/useApp';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { logger } from '@/utils/logger';
  import { normalizeThemeMode, THEME_MODES, type ThemeMode } from '@/utils/themeMode';
  const { availableLocales, locale, setLocale, t, te } = useI18n({ useScope: 'global' });
  const appStore = useAppStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
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
  const accountMenuItems = computed(() => [
    [
      {
        icon: 'i-mdi-account-outline',
        label: t('navigation_drawer.profile'),
        to: '/profile',
      },
      {
        icon: 'i-mdi-account-cog-outline',
        label: t('settings.tabs.account'),
        to: '/account',
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
      routeName === 'neededitems' ? 'page.needed_items.title' : `page.${routeName}.title`,
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
  const THEME_LABEL_KEYS: Record<ThemeMode, string> = {
    dark: 'settings.interface.appearance.dark',
    light: 'settings.interface.appearance.light',
  };
  const themeItems = computed(() => {
    return THEME_MODES.map((mode) => ({
      label: t(THEME_LABEL_KEYS[mode]),
      value: mode,
    }));
  });
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
  const selectedThemeMode = computed({
    get() {
      return preferencesStore.getThemeMode;
    },
    set(newValue: string) {
      const themeMode = normalizeThemeMode(newValue);
      if (!themeMode || themeMode === preferencesStore.getThemeMode) return;
      preferencesStore.setThemeMode(themeMode);
    },
  });
</script>
