<template>
  <div :class="showTrigger ? 'flex items-center' : 'contents'">
    <UPopover
      v-model:open="isMenuOpen"
      :reference="showTrigger ? undefined : reference"
      :content="helpPopoverContent"
    >
      <template v-if="showTrigger" #default>
        <AppTooltip :text="helpCommunityAriaLabel" :disabled="isMenuOpen">
          <UButton
            :id="buttonId"
            color="neutral"
            variant="ghost"
            icon="i-lucide-circle-help"
            :aria-label="helpCommunityAriaLabel"
            :class="buttonToneClass"
            class="size-10 justify-center"
          />
        </AppTooltip>
      </template>
      <template #content>
        <div class="w-[min(19rem,calc(100vw-1.5rem))] space-y-3 p-3">
          <div class="space-y-1">
            <div class="text-surface-50 text-sm font-semibold">
              {{ launcherTitle }}
            </div>
            <p class="text-surface-400 text-[11px] leading-5">
              {{ launcherSummary }}
            </p>
          </div>
          <div class="space-y-2">
            <button
              type="button"
              class="border-surface-700/70 bg-surface-950/55 hover:border-primary-500/35 hover:bg-surface-800 focus-visible:ring-primary-500/50 flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55"
              :disabled="!currentPageHelpKey"
              @click="openPageGuide"
            >
              <span
                class="bg-primary-500/12 border-primary-500/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border"
              >
                <UIcon name="i-mdi-crosshairs-question" class="text-primary-300 h-4 w-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="text-surface-50 block text-sm font-semibold">
                  {{ pageGuideLabel }}
                </span>
                <span class="text-surface-300 line-clamp-2 block text-xs leading-5">
                  {{ pageGuideDescription }}
                </span>
              </span>
              <UIcon name="i-mdi-chevron-right" class="text-surface-500 h-4 w-4 shrink-0" />
            </button>
            <NuxtLink
              to="/setup"
              class="border-surface-700/70 bg-surface-950/55 hover:border-info-500/35 hover:bg-surface-800 focus-visible:ring-info-500/50 flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition focus-visible:ring-2 focus-visible:outline-none"
              @click="closeSetupMenu"
            >
              <span
                class="bg-info-500/12 border-info-500/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border"
              >
                <UIcon name="i-mdi-map-marker-path" class="text-info-300 h-4 w-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="text-surface-50 block text-sm font-semibold">
                  {{ onboardingLabel }}
                </span>
                <span class="text-surface-300 line-clamp-2 block text-xs leading-5">
                  {{ onboardingDescription }}
                </span>
              </span>
              <UIcon name="i-mdi-chevron-right" class="text-surface-500 h-4 w-4 shrink-0" />
            </NuxtLink>
          </div>
          <div class="space-y-1.5">
            <button
              type="button"
              class="border-surface-700/70 bg-surface-950/55 hover:border-primary-500/35 hover:bg-surface-800 focus-visible:ring-primary-500/50 flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition focus-visible:ring-2 focus-visible:outline-none"
              @click="openKeyboardShortcuts"
            >
              <span
                class="bg-surface-700/40 border-surface-600/60 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
              >
                <UIcon name="i-mdi-keyboard-outline" class="text-surface-200 h-3.5 w-3.5" />
              </span>
              <span class="text-surface-100 min-w-0 flex-1 text-sm font-medium">
                {{ keyboardShortcutsLabel }}
              </span>
              <UIcon name="i-mdi-chevron-right" class="text-surface-500 h-3.5 w-3.5 shrink-0" />
            </button>
            <a
              href="https://github.com/tarkovtracker-org/TarkovTracker/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              class="border-surface-700/70 bg-surface-950/55 hover:border-primary-500/35 hover:bg-surface-800 focus-visible:ring-primary-500/50 flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition focus-visible:ring-2 focus-visible:outline-none"
              :aria-label="reportProblemLabel"
              @click="closeMenuOnly"
            >
              <span
                class="bg-surface-700/40 border-surface-600/60 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
              >
                <UIcon name="i-mdi-bug-outline" class="text-surface-200 h-3.5 w-3.5" />
              </span>
              <span class="text-surface-100 min-w-0 flex-1 text-sm font-medium">
                {{ reportProblemLabel }}
              </span>
              <UIcon name="i-mdi-open-in-new" class="text-surface-500 h-3.5 w-3.5 shrink-0" />
            </a>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  import type { PageHelpContent, PageHelpKey } from '@/composables/usePageHelpContent';
  const PAGE_HELP_KEYS: PageHelpKey[] = ['dashboard', 'tasks', 'needed_items', 'hideout'];
  const { te, t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const toast = useToast();
  const { getPageHelpContent } = usePageHelpContent();
  const pageHelpStates: Record<PageHelpKey, ReturnType<typeof usePageHelpState>> = {
    dashboard: usePageHelpState('dashboard'),
    tasks: usePageHelpState('tasks'),
    needed_items: usePageHelpState('needed_items'),
    hideout: usePageHelpState('hideout'),
  };
  const buttonId = `global-help-button-${useId()}`;
  const props = withDefaults(defineProps<{ showTrigger?: boolean; reference?: HTMLElement }>(), {
    showTrigger: true,
    reference: undefined,
  });
  const isMenuOpen = defineModel<boolean>('open', { default: false });
  const copy = (key: string, fallback: string) => (te(key) ? t(key) : fallback);
  const resolvePageHelpKey = (path: string): PageHelpKey | null => {
    if (path === '/' || path.startsWith('/dashboard')) return 'dashboard';
    if (path.startsWith('/tasks')) return 'tasks';
    if (path.startsWith('/needed-items')) return 'needed_items';
    if (path.startsWith('/hideout')) return 'hideout';
    return null;
  };
  const closeAllPageGuides = (restoreFocus = false) => {
    PAGE_HELP_KEYS.forEach((key) => {
      pageHelpStates[key].close({ restoreFocus });
    });
  };
  const focusHelpButton = () => {
    const trigger = props.showTrigger
      ? document.getElementById(buttonId)
      : props.reference?.querySelector('button');
    trigger?.focus({ preventScroll: true });
  };
  function focusOverflowAnchor() {
    if (!props.showTrigger) focusHelpButton();
  }
  const currentPageHelpKey = computed(() => resolvePageHelpKey(route.path));
  const currentPageGuide = computed<PageHelpContent | null>(() => {
    if (!currentPageHelpKey.value) return null;
    return getPageHelpContent(currentPageHelpKey.value);
  });
  const isCurrentPageGuideOpen = computed(() => {
    if (!currentPageHelpKey.value) return false;
    return pageHelpStates[currentPageHelpKey.value].isOpen.value;
  });
  const helpCommunityAriaLabel = computed(() =>
    copy('app_bar.help_community_aria', 'Help & onboarding')
  );
  const keyboardShortcutsLabel = computed(() =>
    copy('app_bar.keyboard_shortcuts', 'Keyboard shortcuts')
  );
  const reportProblemLabel = computed(() => copy('app_bar.report_problem', 'Report a problem'));
  const launcherTitle = computed(() => copy('page_help.launcher.title', 'Help and onboarding'));
  const helpPopoverContent = computed(() => ({
    align: 'end' as const,
    sideOffset: 8,
    'aria-label': launcherTitle.value,
    onEscapeKeyDown: focusOverflowAnchor,
  }));
  const launcherSummary = computed(() =>
    copy(
      'page_help.launcher.summary',
      'Open the guide for this page or run through the new-user setup path without hunting around the UI.'
    )
  );
  const pageGuideLabel = computed(() =>
    copy('page_help.launcher.page_guide', 'How to use this page')
  );
  const unavailablePageGuideDescription = computed(() =>
    copy(
      'page_help.launcher.page_guide_unavailable',
      'A page-specific guide is not wired up here yet. Use onboarding for the main setup flow.'
    )
  );
  const pageGuideDescription = computed(() => {
    return currentPageGuide.value?.hintDescription ?? unavailablePageGuideDescription.value;
  });
  const onboardingLabel = computed(() => t('setup.title'));
  const onboardingDescription = computed(() => t('setup.entry_description'));
  const buttonToneClass = computed(() => {
    return isMenuOpen.value || isCurrentPageGuideOpen.value
      ? 'bg-white/10 text-white light:bg-surface-700/70 light:text-surface-50'
      : 'text-surface-400';
  });
  const openPageGuide = () => {
    if (!currentPageHelpKey.value) return;
    isMenuOpen.value = false;
    closeAllPageGuides(false);
    pageHelpStates[currentPageHelpKey.value].open();
  };
  const closeSetupMenu = () => {
    isMenuOpen.value = false;
    closeAllPageGuides(false);
  };
  const openKeyboardShortcuts = async () => {
    isMenuOpen.value = false;
    closeAllPageGuides(false);
    try {
      await navigateTo({ path: '/settings', hash: '#keybinds' });
    } catch (error) {
      logger.error('[GlobalHelpLauncher] Failed to navigate to keyboard shortcuts:', error);
      toast.add({
        title: t('page_help.launcher.keyboard_shortcuts_error'),
        color: 'error',
      });
    }
  };
  const closeMenuOnly = () => {
    isMenuOpen.value = false;
    focusOverflowAnchor();
  };
  watch(
    () => route.path,
    () => {
      isMenuOpen.value = false;
      closeAllPageGuides(false);
    }
  );
  watch(
    () =>
      currentPageHelpKey.value ? pageHelpStates[currentPageHelpKey.value].isOpen.value : false,
    (nextOpen, previousOpen) => {
      if (!previousOpen || nextOpen || !currentPageHelpKey.value) return;
      if (!pageHelpStates[currentPageHelpKey.value].consumeRestoreFocusOnClose()) return;
      void nextTick(() => {
        focusHelpButton();
      });
    }
  );
</script>
