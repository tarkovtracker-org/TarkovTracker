<template>
  <header
    class="border-surface-700/50 bg-surface-900 fixed top-0 right-0 z-40 h-11 border-b shadow-[0_1px_0_rgba(0,0,0,0.4)]"
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
      <!-- Center: Page Title -->
      <span class="min-w-0 flex-1 truncate text-base font-semibold text-white">
        {{ pageTitle }}
      </span>
      <!-- Right: Status Icons & Settings -->
      <div class="ml-auto flex items-center gap-1 sm:gap-2">
        <AppTooltip v-if="dataError" :text="t('app_bar.error_loading')">
          <span class="inline-flex rounded">
            <UIcon name="i-mdi-database-alert" class="text-error-500 h-5 w-5" />
          </span>
        </AppTooltip>
        <AppTooltip v-if="dataLoading || hideoutLoading" :text="t('app_bar.loading')">
          <span class="inline-flex rounded">
            <UIcon name="i-heroicons-arrow-path" class="text-primary-500 h-5 w-5 animate-spin" />
          </span>
        </AppTooltip>
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
        <label
          class="focus-within:ring-primary-500 focus-within:ring-offset-surface-900 bg-surface-800/60 border-surface-700 flex items-center gap-1 rounded border px-2 focus-within:ring-2 focus-within:ring-offset-2"
        >
          <UIcon name="i-mdi-translate" class="text-surface-300 h-4 w-4" />
          <span class="sr-only">{{ t('settings.locale') }}</span>
          <select
            v-model="selectedLocale"
            :aria-label="t('settings.locale')"
            class="text-surface-200 bg-transparent py-1 text-xs font-medium focus:outline-none"
          >
            <option
              v-for="item in localeItems"
              :key="item.value"
              :value="item.value"
              class="bg-surface-900 text-surface-100"
            >
              {{ item.label }}
            </option>
          </select>
        </label>
        <!-- Account section -->
        <template v-if="isLoggedIn">
          <div class="bg-surface-700/50 mx-1 h-5 w-px" />
          <UDropdownMenu :items="accountMenuItems" :content="{ align: 'end', sideOffset: 8 }">
            <button
              type="button"
              class="bg-surface-800/50 border-surface-600 hover:bg-surface-800 flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors"
              :aria-label="t('navigation_drawer.account_menu')"
            >
              <img
                :src="avatarSrc"
                :alt="t('app_bar.user_avatar_alt')"
                class="h-4 w-4 rounded-full"
                loading="lazy"
              />
              <span class="text-surface-200 hidden text-sm font-medium sm:inline">
                {{ userDisplayName }}
              </span>
              <UIcon name="i-mdi-chevron-down" class="text-surface-400 h-3.5 w-3.5" />
            </button>
          </UDropdownMenu>
        </template>
        <template v-else>
          <div class="bg-surface-700/50 mx-1 h-5 w-px" />
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
            class="hover:bg-surface-700 hidden rounded px-2 py-1 text-sm text-white sm:inline-flex"
          >
            {{ t('navigation_drawer.login') }}
          </NuxtLink>
          <NuxtLink
            to="/login"
            class="hover:bg-surface-700 rounded p-1 text-white sm:hidden"
            :aria-label="t('navigation_drawer.login')"
          >
            <UIcon name="i-mdi-fingerprint" class="h-4 w-4" />
          </NuxtLink>
        </template>
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
