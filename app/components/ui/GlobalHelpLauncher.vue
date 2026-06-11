<template>
  <div class="flex items-center">
    <UPopover
      v-model:open="isMenuOpen"
      :content="{ align: 'center', side: 'bottom', sideOffset: 10 }"
    >
      <UButton
        :id="buttonId"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-mdi-help-circle-outline"
        :aria-label="helpButtonLabel"
        :class="buttonToneClass"
      >
        <span class="hidden text-xs leading-none font-medium sm:inline">
          {{ helpButtonLabel.toUpperCase() }}
        </span>
      </UButton>
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
            <button
              type="button"
              class="border-surface-700/70 bg-surface-950/55 hover:border-info-500/35 hover:bg-surface-800 focus-visible:ring-info-500/50 flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition focus-visible:ring-2 focus-visible:outline-none"
              @click="openOnboarding"
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
            </button>
          </div>
        </div>
      </template>
    </UPopover>
    <UModal
      v-model:open="isOnboardingOpen"
      :ui="{ content: 'bg-transparent border-0 p-0 shadow-none ring-0 outline-none' }"
    >
      <template #content>
        <div
          class="bg-surface-900/98 border-surface-700/70 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border shadow-2xl"
        >
          <div
            class="border-surface-700/60 flex items-start justify-between gap-4 border-b px-5 py-4"
          >
            <div class="min-w-0 flex-1 space-y-2">
              <div class="text-surface-400 text-[11px] font-semibold tracking-[0.18em] uppercase">
                {{ onboardingLabel }}
              </div>
              <div class="text-surface-50 text-lg font-semibold">
                {{ onboardingModalTitle }}
              </div>
              <p class="text-surface-300 text-sm leading-6">
                {{ onboardingModalSummary }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <div
                class="text-surface-400 shrink-0 text-xs font-medium whitespace-nowrap tabular-nums"
              >
                {{ onboardingStepLabel }}
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-mdi-close"
                :aria-label="closeLabel"
                @click="closeOnboarding()"
              />
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div class="border-surface-700/60 bg-surface-950/55 rounded-[24px] border p-4">
              <div class="text-surface-50 text-base font-semibold">
                {{ currentOnboardingStep.title }}
              </div>
              <p class="text-surface-300 mt-2 text-sm leading-6">
                {{ currentOnboardingStep.description }}
              </p>
              <ul class="mt-4 space-y-2.5">
                <li
                  v-for="bullet in currentOnboardingStep.bullets"
                  :key="bullet"
                  class="text-surface-200 flex items-start gap-2.5 text-sm leading-6"
                >
                  <UIcon
                    name="i-mdi-arrow-right-circle-outline"
                    class="text-primary-400 mt-1 h-4 w-4 shrink-0"
                  />
                  <span>{{ bullet }}</span>
                </li>
              </ul>
            </div>
          </div>
          <div
            class="border-surface-700/60 bg-surface-900/98 flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-for="action in currentOnboardingStep.actions"
                :key="action.label"
                :color="action.color ?? 'primary'"
                :variant="action.variant ?? 'soft'"
                :icon="action.icon"
                size="sm"
                class="justify-center"
                @click="runOnboardingAction(action.to)"
              >
                {{ action.label }}
              </UButton>
            </div>
            <div class="flex items-center justify-between gap-2 sm:justify-end">
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-mdi-arrow-left"
                :disabled="isFirstOnboardingStep"
                @click="goToPreviousOnboardingStep"
              >
                {{ previousLabel }}
              </UButton>
              <UButton
                :color="isLastOnboardingStep ? 'success' : 'primary'"
                variant="soft"
                size="sm"
                :icon="isLastOnboardingStep ? 'i-mdi-check' : 'i-mdi-arrow-right'"
                trailing
                @click="advanceOnboarding"
              >
                {{ isLastOnboardingStep ? finishLabel : nextLabel }}
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
<script setup lang="ts">
  import type { PageHelpContent, PageHelpKey } from '@/composables/usePageHelpContent';
  type HelpRoute = string | { hash?: string; path: string; query?: Record<string, string> };
  interface OnboardingAction {
    color?: 'error' | 'info' | 'neutral' | 'primary' | 'secondary' | 'success' | 'warning';
    icon?: string;
    label: string;
    to: HelpRoute;
    variant?: 'ghost' | 'link' | 'outline' | 'soft' | 'solid' | 'subtle';
  }
  interface OnboardingStep {
    actions: OnboardingAction[];
    bullets: string[];
    description: string;
    title: string;
  }
  const EMPTY_ONBOARDING_STEP: OnboardingStep = {
    actions: [],
    bullets: [],
    description: '',
    title: '',
  };
  const PAGE_HELP_KEYS: PageHelpKey[] = ['dashboard', 'tasks', 'needed_items', 'hideout'];
  const { te, t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const { $supabase } = useNuxtApp();
  const { getPageHelpContent } = usePageHelpContent();
  const pageHelpStates: Record<PageHelpKey, ReturnType<typeof usePageHelpState>> = {
    dashboard: usePageHelpState('dashboard'),
    tasks: usePageHelpState('tasks'),
    needed_items: usePageHelpState('needed_items'),
    hideout: usePageHelpState('hideout'),
  };
  const buttonId = `global-help-button-${useId()}`;
  const isMenuOpen = ref(false);
  const isOnboardingOpen = ref(false);
  const onboardingStepIndex = ref(0);
  const restoreFocusOnOnboardingClose = ref(true);
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
    document.getElementById(buttonId)?.focus({ preventScroll: true });
  };
  const currentPageHelpKey = computed(() => resolvePageHelpKey(route.path));
  const currentPageGuide = computed<PageHelpContent | null>(() => {
    if (!currentPageHelpKey.value) return null;
    return getPageHelpContent(currentPageHelpKey.value);
  });
  const isCurrentPageGuideOpen = computed(() => {
    if (!currentPageHelpKey.value) return false;
    return pageHelpStates[currentPageHelpKey.value].isOpen.value;
  });
  const isLoggedIn = computed(() => $supabase.user?.loggedIn ?? false);
  const helpButtonLabel = computed(() => t('page_help.button'));
  const closeLabel = computed(() => t('common.close'));
  const previousLabel = computed(() => t('common.previous'));
  const nextLabel = computed(() => t('common.next'));
  const finishLabel = computed(() => t('common.finish'));
  const launcherTitle = computed(() => copy('page_help.launcher.title', 'Help and onboarding'));
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
  const onboardingLabel = computed(() =>
    copy('page_help.launcher.onboarding', 'New user onboarding')
  );
  const onboardingDescription = computed(() =>
    copy(
      'page_help.launcher.onboarding_description',
      'Start with imports, finish the core profile fields, then sanity-check tasks so your tracker is accurate fast.'
    )
  );
  const onboardingModalTitle = computed(() => copy('page_help.onboarding.title', 'Getting set up'));
  const onboardingModalSummary = computed(() =>
    copy(
      'page_help.onboarding.summary',
      'This is the recommended first pass for new or returning users. Use the action buttons to jump into the real pages.'
    )
  );
  const accountActionLabel = computed(() =>
    copy(
      isLoggedIn.value
        ? 'page_help.onboarding.actions.account'
        : 'page_help.onboarding.actions.login',
      isLoggedIn.value ? 'Open account' : 'Sign in'
    )
  );
  const accountActionRoute = computed<HelpRoute>(() => {
    return isLoggedIn.value ? '/account' : '/login';
  });
  const onboardingSteps = computed<OnboardingStep[]>(() => [
    {
      actions: [
        {
          color: 'primary',
          icon: 'i-mdi-database-import-outline',
          label: copy('page_help.onboarding.steps.import.actions.open', 'Open imports'),
          to: {
            hash: '#imports',
            path: '/settings',
          },
        },
      ],
      bullets: [
        copy(
          'page_help.onboarding.steps.import.bullets.one',
          'Import your Tarkov.dev profile first when you have it. That usually fills most of the account basics and tracked progress.'
        ),
        copy(
          'page_help.onboarding.steps.import.bullets.two',
          'Import your EFT logs next. That can backfill quests and other progress with almost no manual clicking.'
        ),
        copy(
          'page_help.onboarding.steps.import.bullets.three',
          'If both imports land cleanly, manual setup becomes a quick verification pass instead of rebuilding everything by hand.'
        ),
      ],
      description: copy(
        'page_help.onboarding.steps.import.description',
        'Use imports before touching manual setup. They are the fastest way to get most of your tracker into a usable state.'
      ),
      title: copy('page_help.onboarding.steps.import.title', 'Import progress first'),
    },
    {
      actions: [
        {
          color: 'neutral',
          icon: 'i-mdi-cog-outline',
          label: copy('page_help.onboarding.steps.profile.actions.settings', 'Open settings'),
          to: '/settings',
        },
        {
          color: isLoggedIn.value ? 'neutral' : 'primary',
          icon: isLoggedIn.value ? 'i-mdi-account-cog-outline' : 'i-mdi-login',
          label: accountActionLabel.value,
          to: accountActionRoute.value,
          variant: isLoggedIn.value ? 'outline' : 'soft',
        },
      ],
      bullets: [
        copy(
          'page_help.onboarding.steps.profile.bullets.one',
          'Set your game mode, edition, level, faction, and display name so filters and unlock requirements line up with your real account.'
        ),
        copy(
          'page_help.onboarding.steps.profile.bullets.two',
          'Signing in unlocks teams, API-backed features, and cloud storage so progress is easier to keep across devices.'
        ),
        copy(
          'page_help.onboarding.steps.profile.bullets.three',
          'If you are not ready to sign in yet, you can still track locally first and attach that progress to an account later.'
        ),
      ],
      description: copy(
        'page_help.onboarding.steps.profile.description',
        'After imports, lock in the core profile fields and decide whether you want your progress synced to an account.'
      ),
      title: copy('page_help.onboarding.steps.profile.title', 'Finish the basics'),
    },
    {
      actions: [
        {
          color: 'primary',
          icon: 'i-mdi-checkbox-multiple-marked',
          label: copy('page_help.onboarding.steps.tasks.actions.open', 'Open tasks'),
          to: '/tasks',
        },
      ],
      bullets: [
        copy(
          'page_help.onboarding.steps.tasks.bullets.one',
          'On the tasks page, mark the quests you currently have available in-game for each trader. That backfills prerequisite chains much faster than manually completing old tasks one by one.'
        ),
        copy(
          'page_help.onboarding.steps.tasks.bullets.two',
          'When something looks wrong, use the task card menu to report a data issue instead of forcing your tracker into a bad state.'
        ),
        copy(
          'page_help.onboarding.steps.tasks.bullets.three',
          'After this pass, use the app-bar help button on any supported page to reopen the page guide or this onboarding flow.'
        ),
      ],
      description: copy(
        'page_help.onboarding.steps.tasks.description',
        'The last high-impact cleanup step is task availability. Once that is accurate, the rest of the site becomes much more reliable.'
      ),
      title: copy('page_help.onboarding.steps.tasks.title', 'Sanity-check tasks'),
    },
  ]);
  const currentOnboardingStep = computed<OnboardingStep>(() => {
    return (
      onboardingSteps.value[onboardingStepIndex.value] ??
      onboardingSteps.value[0] ??
      EMPTY_ONBOARDING_STEP
    );
  });
  const onboardingStepLabel = computed(() => {
    return `${onboardingStepIndex.value + 1} / ${onboardingSteps.value.length}`;
  });
  const isFirstOnboardingStep = computed(() => onboardingStepIndex.value === 0);
  const isLastOnboardingStep = computed(
    () => onboardingStepIndex.value === onboardingSteps.value.length - 1
  );
  const buttonToneClass = computed(() => {
    return isMenuOpen.value || isOnboardingOpen.value || isCurrentPageGuideOpen.value
      ? 'bg-white/10 text-white'
      : 'text-surface-400';
  });
  const openPageGuide = () => {
    if (!currentPageHelpKey.value) return;
    isMenuOpen.value = false;
    isOnboardingOpen.value = false;
    closeAllPageGuides(false);
    pageHelpStates[currentPageHelpKey.value].open();
  };
  const openOnboarding = () => {
    isMenuOpen.value = false;
    closeAllPageGuides(false);
    onboardingStepIndex.value = 0;
    restoreFocusOnOnboardingClose.value = true;
    isOnboardingOpen.value = true;
  };
  const closeOnboarding = (restoreFocus = true) => {
    restoreFocusOnOnboardingClose.value = restoreFocus;
    isOnboardingOpen.value = false;
  };
  const goToPreviousOnboardingStep = () => {
    if (isFirstOnboardingStep.value) return;
    onboardingStepIndex.value -= 1;
  };
  const advanceOnboarding = () => {
    if (isLastOnboardingStep.value) {
      closeOnboarding();
      return;
    }
    onboardingStepIndex.value += 1;
  };
  const runOnboardingAction = async (to: HelpRoute) => {
    closeOnboarding(false);
    await navigateTo(to);
  };
  watch(
    () => route.path,
    () => {
      isMenuOpen.value = false;
      restoreFocusOnOnboardingClose.value = false;
      isOnboardingOpen.value = false;
      closeAllPageGuides(false);
    }
  );
  watch(isOnboardingOpen, (nextOpen, previousOpen) => {
    if (!previousOpen || nextOpen) return;
    if (!restoreFocusOnOnboardingClose.value) {
      restoreFocusOnOnboardingClose.value = true;
      return;
    }
    void nextTick(() => {
      focusHelpButton();
    });
  });
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
