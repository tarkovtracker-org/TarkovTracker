<template>
  <header
    ref="appBar"
    class="@container fixed top-0 right-0 z-30 h-(--shell-bar-h) border-b"
    :class="modeHeaderClass"
    :style="{ '--app-bar-gutter': gutterCap }"
  >
    <div
      class="grid h-full grid-cols-[minmax(0,1fr)_min(36%,47.5rem)_minmax(0,1fr)] items-center gap-2 pe-[clamp(18px,calc(20cqw-230px),var(--app-bar-gutter))] @max-[760px]:pe-3 @max-[560px]:grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] @max-[560px]:gap-1 @max-[560px]:pe-2"
    >
      <div class="flex items-center gap-0.5 ps-2 @min-[761px]:ps-4">
        <AppTooltip :text="t('navigation_drawer.toggle')">
          <UButton
            :icon="drawerToggleIcon"
            variant="ghost"
            color="neutral"
            :aria-label="t('navigation_drawer.toggle')"
            :aria-expanded="!isDrawerCollapsed"
            class="size-10 shrink-0 justify-center"
            @click.stop="changeNavigationDrawer"
          />
        </AppTooltip>
        <AppTooltip v-if="dataStatus" :text="dataStatus.label">
          <span class="flex size-4 items-center justify-center @min-[561px]:size-8">
            <UIcon :name="dataStatus.icon" :class="dataStatus.color" class="size-4" />
          </span>
        </AppTooltip>
        <ProgressSaveStatusIndicator />
      </div>
      <AppSearch :shortcut-parts="omnibarShortcutParts" :key-shortcuts="omnibarAriaKeyshortcuts" />
      <div
        class="col-start-3 flex max-w-full min-w-0 items-center gap-0.5 justify-self-end @min-[561px]:gap-1"
      >
        <AppTooltip v-if="showThemeAndHelp" :text="themeToggleLabel">
          <UButton
            color="neutral"
            variant="ghost"
            :icon="themeIcon"
            :aria-label="themeToggleLabel"
            class="size-10 shrink-0 justify-center"
            @click="toggleThemeMode"
          />
        </AppTooltip>
        <UPopover
          v-model:open="activityOpen"
          :reference="activityAnchor"
          :content="activityPopoverContent"
        >
          <template v-if="showActivity" #default>
            <AppTooltip :text="t('common.activity_log')">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-bell"
                :aria-label="t('common.activity_log')"
                class="relative size-10 shrink-0 justify-center"
              >
                <span
                  v-if="activityLogStore.hasUnread"
                  aria-hidden="true"
                  class="bg-error-500 ring-surface-900 absolute top-2 right-2 size-2 rounded-full ring-2"
                />
              </UButton>
            </AppTooltip>
          </template>
          <template #content>
            <ActivityLogPanel />
          </template>
        </UPopover>
        <span v-if="activityLogStore.hasUnread" class="sr-only" aria-live="polite">
          {{ t('activity_log.unread_indicator') }}
        </span>
        <GlobalHelpLauncher
          v-model:open="helpOpen"
          :show-trigger="showThemeAndHelp"
          :reference="overflowAnchor ?? undefined"
        />
        <AppTooltip v-if="showLocale" :text="localeTooltip">
          <UDropdownMenu
            :modal="false"
            :items="localeMenuItems"
            :content="{ align: 'end', sideOffset: 8 }"
          >
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-languages"
              :aria-label="localeTooltip"
              :loading="localeSwitchPending"
              :disabled="localeSwitchPending"
              data-testid="app-locale-menu"
              class="size-10 shrink-0 justify-center"
            />
          </UDropdownMenu>
        </AppTooltip>
        <span ref="overflowAnchor" class="inline-flex">
          <AppTooltip :text="t('common.more')">
            <UDropdownMenu
              :modal="false"
              :items="moreMenuItems"
              :content="{ align: 'end', sideOffset: 8, onCloseAutoFocus: openOverflowPanel }"
            >
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis"
                :aria-label="t('common.more')"
                class="relative size-10 shrink-0 justify-center"
              >
                <span
                  v-if="!showActivity && activityLogStore.hasUnread"
                  aria-hidden="true"
                  class="bg-error-500 ring-surface-900 absolute top-2 right-2 size-2 rounded-full ring-2"
                />
              </UButton>
            </UDropdownMenu>
          </AppTooltip>
        </span>
        <span
          class="bg-surface-700/60 mx-1 hidden h-5 w-px shrink-0 @min-[561px]:block"
          aria-hidden="true"
        />
        <AppTooltip v-if="showLocale && supporterTier" :text="supporterBadgeAriaLabel">
          <NuxtLink
            to="/supporter"
            class="inline-flex h-8 max-w-24 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold text-white transition-colors"
            :class="supporterBadgeClass"
            :aria-label="supporterBadgeAriaLabel"
          >
            <UIcon :name="supporterBadgeIcon" class="size-4 shrink-0" />
            <span class="truncate">{{ supporterBadgeLabel }}</span>
          </NuxtLink>
        </AppTooltip>
        <AppTooltip v-if="isLoggedIn" :text="userDisplayName">
          <UDropdownMenu
            :modal="false"
            :items="accountMenuItems"
            :content="{ align: 'end', sideOffset: 8 }"
          >
            <button
              type="button"
              class="bg-surface-800/50 border-surface-600 hover:bg-surface-800 flex h-10 w-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border transition-colors @min-[1041px]:w-auto @min-[1041px]:max-w-44 @min-[1041px]:px-2.5"
              :aria-label="t('navigation_drawer.account_menu')"
            >
              <img
                :src="effectiveAvatarSrc"
                :alt="t('app_bar.user_avatar_alt')"
                class="size-6 shrink-0 rounded-full"
                loading="lazy"
                @error="handleAvatarError"
              />
              <span
                class="text-surface-200 hidden min-w-0 truncate text-[13px] leading-none font-medium whitespace-nowrap @min-[1041px]:inline"
                :data-long-name="userDisplayName.length > 24"
                :title="userDisplayName"
              >
                {{ userDisplayName }}
              </span>
              <UIcon
                name="i-lucide-chevron-down"
                class="text-surface-400 hidden size-4 shrink-0 @min-[1041px]:block"
              />
            </button>
          </UDropdownMenu>
        </AppTooltip>
        <AppTooltip v-else :text="t('app_bar.login_aria')">
          <NuxtLink
            to="/login"
            class="bg-primary-500 light:bg-primary-800 hover:bg-primary-400 light:hover:bg-primary-900 border-primary-500 light:border-primary-800 text-surface-950 flex h-10 w-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border text-[13px] leading-none font-semibold transition-colors @min-[561px]:w-auto @min-[561px]:px-3"
            :aria-label="t('app_bar.login_aria')"
          >
            <UIcon name="i-lucide-user-round" class="size-4 shrink-0" />
            <span class="hidden truncate @min-[561px]:inline">
              {{ t('navigation_drawer.login') }}
            </span>
          </NuxtLink>
        </AppTooltip>
      </div>
    </div>
    <SignOutConfirmModal v-if="isLoggedIn" />
  </header>
</template>
<script setup lang="ts">
  import { useElementSize, useWindowSize } from '@vueuse/core';
  import { useKeybinds } from '@/composables/useKeybinds';
  import { useLocaleSwitch } from '@/composables/useLocaleSwitch';
  import { useSignOut } from '@/composables/useSignOut';
  import { useSupporter } from '@/composables/useSupporter';
  import { useTheme } from '@/composables/useTheme';
  import AppSearch from '@/features/omnibar/AppSearch.vue';
  import { useActivityLogStore } from '@/stores/useActivityLogStore';
  import { useAppStore } from '@/stores/useApp';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES } from '@/utils/constants';
  import { DEFAULT_KEYBINDS } from '@/utils/keybinds';
  import { getLocaleNativeName } from '@/utils/locales';
  import {
    SHELL_DESKTOP_BREAKPOINT_PX,
    SHELL_DRAWER_COLLAPSED_WIDTH,
    SHELL_DRAWER_EXPANDED_WIDTH,
  } from '@/utils/shellConfig';
  import type { DropdownMenuItem } from '@nuxt/ui';
  const { t, te } = useI18n({ useScope: 'global' });
  const { isLightTheme, toggleThemeMode } = useTheme();
  const themeToggleLabel = computed(() =>
    isLightTheme.value
      ? t('app_bar.switch_to_dark_theme', 'Switch to dark theme')
      : t('app_bar.switch_to_light_theme', 'Switch to light theme')
  );
  const themeIcon = computed(() => (isLightTheme.value ? 'i-lucide-moon' : 'i-lucide-sun'));
  const overflowAnchor = useTemplateRef<HTMLElement>('overflowAnchor');
  const { width: barWidth } = useElementSize(useTemplateRef<HTMLElement>('appBar'));
  const showActivity = computed(() => barWidth.value > 560);
  const showThemeAndHelp = computed(() => barWidth.value >= 1280);
  const showLocale = computed(() => barWidth.value >= 1620);
  const activityOpen = ref(false);
  const activityPopoverContent = computed(() => ({
    align: 'end' as const,
    sideOffset: 8,
    'aria-label': t('common.activity_log'),
    onEscapeKeyDown: focusActivityAnchor,
  }));
  const activityAnchor = computed(() =>
    showActivity.value ? undefined : (overflowAnchor.value ?? undefined)
  );
  function focusActivityAnchor() {
    if (showActivity.value) return;
    overflowAnchor.value?.querySelector('button')?.focus({ preventScroll: true });
  }
  const helpOpen = ref(false);
  let selectedOverflowPanel: 'activity' | 'help' | null = null;
  function openOverflowPanel(event: Event) {
    if (!selectedOverflowPanel) return;
    // Hand focus to the popup only after More's content closes.
    event.preventDefault();
    if (selectedOverflowPanel === 'activity') activityOpen.value = true;
    else helpOpen.value = true;
    selectedOverflowPanel = null;
  }
  const appStore = useAppStore();
  const activityLogStore = useActivityLogStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const ActivityLogPanel = defineAsyncComponent(() => import('@/shell/ActivityLogPanel.vue'));
  // Initialize global keyboard shortcuts (Undo/Search defaults: Ctrl+Z/Ctrl+K, user-configurable)
  useKeybinds();
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
        icon: 'i-lucide-user-round',
        label: t('navigation_drawer.profile'),
        to: '/profile',
      },
      {
        icon: 'i-lucide-settings',
        label: t('common.settings'),
        to: '/settings',
      },
    ],
    [
      {
        color: 'error',
        icon: 'i-lucide-log-out',
        label: t('navigation_drawer.logout'),
        onSelect: () => {
          void logout();
        },
      },
    ],
  ]);
  const themeMenuItem = computed<DropdownMenuItem>(() => ({
    icon: themeIcon.value,
    label: themeToggleLabel.value,
    onSelect: toggleThemeMode,
  }));
  const localeOverflowItem = computed<DropdownMenuItem>(() => ({
    icon: 'i-lucide-languages',
    label: t('settings.locale'),
    description: localeStatus.value || undefined,
    disabled: localeSwitchPending.value,
    children: localeMenuItems.value,
  }));
  const activityMenuItem: DropdownMenuItem = {
    icon: 'i-lucide-bell',
    get label() {
      return t('common.activity_log');
    },
    onSelect: () => {
      selectedOverflowPanel = 'activity';
    },
  };
  const helpMenuItem: DropdownMenuItem = {
    icon: 'i-lucide-circle-help',
    get label() {
      return t('app_bar.help_community_aria');
    },
    onSelect: () => {
      selectedOverflowPanel = 'help';
    },
  };
  const overflowUtilities = computed(() => [
    ...(showThemeAndHelp.value ? [] : [themeMenuItem.value, helpMenuItem]),
    ...(showActivity.value ? [] : [activityMenuItem]),
    ...(showLocale.value ? [] : [localeOverflowItem.value]),
  ]);
  const moreMenuItems = computed<DropdownMenuItem[][]>(() =>
    [
      overflowUtilities.value,
      [
        {
          icon: supporterTier.value ? supporterBadgeIcon.value : 'i-lucide-heart',
          label: supporterBadgeLabel.value || t('common.support'),
          to: '/supporter',
        },
        {
          icon: 'i-mdi-discord',
          label: t('footer.call_to_action.discord'),
          to: 'https://discord.gg/M8nBgA2sT6',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        {
          icon: 'i-mdi-github',
          label: t('footer.call_to_action.github'),
          to: 'https://github.com/tarkovtracker-org/TarkovTracker',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      ],
    ].filter((group) => group.length > 0)
  );
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
  const gutterCap = computed(() =>
    isDrawerCollapsed.value ? SHELL_DRAWER_COLLAPSED_WIDTH : SHELL_DRAWER_EXPANDED_WIDTH
  );
  const drawerToggleIcon = computed(() => {
    if (mdAndDown.value) return 'i-lucide-menu';
    return isDrawerCollapsed.value ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close';
  });
  const {
    locale,
    availableLocales,
    pending: localeSwitchPending,
    error: dataError,
    status: localeStatus,
    isDisabled: isLocaleDisabled,
    selectLocale,
  } = useLocaleSwitch();
  const isLoadingData = computed(
    () => metadataStore.loading || metadataStore.hideoutLoading || localeSwitchPending.value
  );
  const dataStatus = computed(() => {
    if (dataError.value) {
      return {
        label: t('app_bar.error_loading'),
        icon: 'i-lucide-database-zap',
        color: 'text-error-500 light:text-error-800',
      };
    }
    if (isLoadingData.value) {
      return {
        label: t('app_bar.loading'),
        icon: 'i-lucide-loader-circle',
        color: 'text-primary-500 light:text-primary-800 animate-spin',
      };
    }
    return null;
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
