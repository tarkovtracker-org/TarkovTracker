<template>
  <div class="min-h-full overflow-x-hidden">
    <div class="px-3 py-5 sm:px-5 sm:py-6">
      <div class="mx-auto max-w-[1400px] space-y-3 sm:space-y-4">
        <div class="flex flex-col gap-4">
          <div class="flex justify-center">
            <div
              class="bg-surface-900 border-surface-700/50 w-full max-w-4xl rounded-lg border px-4 py-3 shadow-sm"
              data-testid="hideout-view-switcher"
              data-help-target="hideout-view-switcher"
            >
              <div class="grid w-full gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                <div class="hidden lg:block"></div>
                <div
                  data-help-target="hideout-status-filters"
                  class="flex flex-wrap justify-center gap-2"
                >
                  <template v-for="(view, index) in primaryViews" :key="view.view">
                    <UButton
                      :icon="`i-${view.icon}`"
                      :variant="'ghost'"
                      :color="'neutral'"
                      size="md"
                      :data-help-target="`hideout-filter-${view.view}`"
                      :aria-pressed="displayPrimaryView === view.view"
                      class="shrink-0"
                      :class="{
                        'border-surface-200 rounded-none border-b-2':
                          displayPrimaryView === view.view,
                      }"
                      @click="selectPrimaryView(view.view)"
                    >
                      <span class="text-xs sm:text-sm">{{ view.title.toUpperCase() }}</span>
                      <span
                        :class="[
                          'ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white sm:h-7 sm:min-w-7 sm:px-1.5 sm:text-sm',
                          view.badgeColor,
                        ]"
                      >
                        {{ view.count }}
                      </span>
                    </UButton>
                    <span
                      v-if="index === 0"
                      aria-hidden="true"
                      class="bg-surface-700/60 h-6 w-px self-center"
                    ></span>
                  </template>
                </div>
                <div
                  data-testid="hideout-filter-actions"
                  data-help-target="hideout-filter-actions"
                  class="flex items-center justify-center gap-2 lg:justify-end"
                >
                  <UButton
                    icon="i-mdi-cog"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    data-help-target="hideout-settings-button"
                    :aria-label="t('settings.title')"
                    :aria-pressed="isSettingsOpen"
                    :class="isSettingsOpen ? 'bg-white/10 text-white' : 'text-surface-400'"
                    @click="toggleSettingsDrawer"
                  >
                    <span class="hidden sm:inline">
                      {{ t('settings.title').toUpperCase() }}
                    </span>
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>
        <UModal
          v-model:open="showPrereqConfirm"
          :title="prereqConfirmTitle"
          :description="prereqConfirmDescription"
          :ui="{ content: 'bg-transparent border-0 p-0 shadow-none ring-0 outline-none' }"
          prevent-close
        >
          <template #content>
            <UCard class="w-full max-w-sm">
              <template #header>
                <div class="px-4 py-3 text-lg font-semibold text-white">
                  {{ prereqConfirmTitle }}
                </div>
              </template>
              <div class="text-surface-300 px-4 pb-4 text-sm">
                {{ prereqConfirmDescription }}
              </div>
              <template #footer>
                <div class="flex justify-end gap-2 px-4 pb-4">
                  <UButton color="neutral" variant="ghost" @click="cancelPrereqToggle">
                    {{ helpText('page.hideout.prereq_filters.confirm_cancel', 'Cancel') }}
                  </UButton>
                  <UButton color="warning" variant="solid" @click="confirmPrereqToggle">
                    {{ helpText('page.hideout.prereq_filters.confirm_confirm', 'Enable') }}
                  </UButton>
                </div>
              </template>
            </UCard>
          </template>
        </UModal>
        <div v-if="showHideoutHelpDemo" class="mx-auto max-w-3xl">
          <HideoutHelpDemoCard
            :mode="hideoutHelpDemoMode"
            :requirement-complete="hideoutHelpRequirementComplete"
            @build="handleHideoutHelpBuild"
            @toggle-requirement="toggleHideoutHelpRequirement"
          />
        </div>
        <div>
          <div
            v-if="isStoreLoading"
            class="text-surface-200 flex flex-col items-center gap-3 py-10"
          >
            <UIcon name="i-heroicons-arrow-path" class="text-info-400 h-8 w-8 animate-spin" />
            <div class="flex items-center gap-2 text-sm">
              {{ $t('page.hideout.loading') }}
              <RefreshButton />
            </div>
          </div>
          <div v-else-if="displayVisibleStations.length === 0" class="flex justify-center">
            <UAlert
              icon="i-mdi-clipboard-search"
              color="neutral"
              variant="soft"
              class="max-w-xl"
              :title="$t('page.hideout.no_stations_found')"
            />
          </div>
          <div
            v-else
            data-help-target="hideout-station-grid"
            class="mt-2 grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 xl:grid-cols-3"
          >
            <div
              v-for="(hStation, hIndex) in visibleStationsSlice"
              :key="hStation.id"
              class="content-visibility-auto-240 h-full"
              :data-help-target="hIndex === 0 ? 'hideout-first-station-card' : undefined"
            >
              <HideoutCard
                :station="hStation"
                :collapsed="
                  getStationStatus(hStation) === 'maxed' &&
                  preferencesStore.hideoutCollapseCompleted
                "
                :highlighted="highlightedStationId === hStation.id"
                :highlight-module-id="
                  highlightedStationId === hStation.id ? highlightedModuleId : undefined
                "
              />
            </div>
          </div>
          <div
            v-if="visibleStationCount < displayVisibleStations.length"
            ref="loadMoreSentinel"
            class="flex items-center justify-center py-4"
          >
            <UIcon name="i-mdi-loading" class="text-surface-400 h-5 w-5 animate-spin" />
          </div>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="translate-x-4 opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-4 opacity-0"
      >
        <div
          v-if="isDesktopSettingsDrawerOpen"
          class="pointer-events-none fixed top-20 right-4 z-30 w-80 xl:w-[22rem]"
        >
          <div class="pointer-events-auto">
            <HideoutSettingsDrawer
              mode="docked"
              :collapse-completed="preferencesStore.hideoutCollapseCompleted"
              :sort-ready-first="preferencesStore.hideoutSortReadyFirst"
              :require-station-levels="preferencesStore.hideoutRequireStationLevels"
              :require-skill-levels="preferencesStore.hideoutRequireSkillLevels"
              :require-trader-loyalty="preferencesStore.hideoutRequireTraderLoyalty"
              :is-help-tour-active="isHideoutHelpTourActive"
              @update:collapse-completed="preferencesStore.hideoutCollapseCompleted = $event"
              @update:sort-ready-first="preferencesStore.hideoutSortReadyFirst = $event"
              @update:require-station-levels="handlePrereqToggle('station', $event)"
              @update:require-skill-levels="handlePrereqToggle('skill', $event)"
              @update:require-trader-loyalty="handlePrereqToggle('trader', $event)"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
    <PageHelpSpotlight
      v-if="isHelpOpen && hideoutHelpSteps.length"
      :show-step-title="false"
      :steps="hideoutHelpSteps"
      :title="helpContent.title"
      @close="handleHelpClose"
      @step-change="handleHideoutHelpStepChange"
    />
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="translate-y-2 opacity-0 sm:translate-x-4 sm:translate-y-0"
        enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100 sm:translate-x-0"
        leave-to-class="translate-y-2 opacity-0 sm:translate-x-4 sm:translate-y-0"
      >
        <HideoutSettingsDrawer
          v-if="isOverlaySettingsDrawerOpen"
          mode="overlay"
          :collapse-completed="preferencesStore.hideoutCollapseCompleted"
          :sort-ready-first="preferencesStore.hideoutSortReadyFirst"
          :require-station-levels="preferencesStore.hideoutRequireStationLevels"
          :require-skill-levels="preferencesStore.hideoutRequireSkillLevels"
          :require-trader-loyalty="preferencesStore.hideoutRequireTraderLoyalty"
          :is-help-tour-active="isHideoutHelpTourActive"
          @update:collapse-completed="preferencesStore.hideoutCollapseCompleted = $event"
          @update:sort-ready-first="preferencesStore.hideoutSortReadyFirst = $event"
          @update:require-station-levels="handlePrereqToggle('station', $event)"
          @update:require-skill-levels="handlePrereqToggle('skill', $event)"
          @update:require-trader-loyalty="handlePrereqToggle('trader', $event)"
        />
      </Transition>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
  import { useBreakpoints, useDebounceFn } from '@vueuse/core';
  import { storeToRefs } from 'pinia';
  import { type HideoutPrimaryView, useHideoutFiltering } from '@/composables/useHideoutFiltering';
  import { useHideoutStationStatus } from '@/composables/useHideoutStationStatus';
  import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
  import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
  import { usePrereqModal, type PrereqType } from '@/composables/usePrereqModal';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { HideoutStation } from '@/types/tarkov';
  // Page metadata
  useSeoMeta({
    title: 'Hideout',
    description:
      'Track your hideout module upgrades and requirements. See what items you need to complete each station upgrade.',
  });
  const HideoutCard = defineAsyncComponent(() => import('@/features/hideout/HideoutCard.vue'));
  const HideoutHelpDemoCard = defineAsyncComponent(
    () => import('@/features/hideout/HideoutHelpDemoCard.vue')
  );
  const HideoutSettingsDrawer = defineAsyncComponent(
    () => import('@/features/hideout/HideoutSettingsDrawer.vue')
  );
  const RefreshButton = defineAsyncComponent(() => import('@/components/ui/RefreshButton.vue'));
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n({ useScope: 'global' });
  const { close: closeHelp, isOpen: isHelpOpen } = usePageHelpState('hideout');
  const { isOpen: isSettingsOpen, toggle: toggleSettingsDrawer } = usePageSettingsDrawer('hideout');
  const dockedDrawerBreakpoints = useBreakpoints({ dockedHideoutDrawer: 1768 });
  const isWideEnoughForDockedDrawer = dockedDrawerBreakpoints.greaterOrEqual('dockedHideoutDrawer');
  const { getPageHelpContent } = usePageHelpContent();
  const metadataStore = useMetadataStore();
  const { hideoutStations } = storeToRefs(metadataStore);
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const { arePrereqsMet, getStationStatus } = useHideoutStationStatus();
  const highlightedStationId = ref<string | null>(null);
  const highlightedModuleId = ref<string | null>(null);
  const helpContent = computed(() => getPageHelpContent('hideout'));
  const hideoutHelpStepIndex = ref(0);
  const hideoutHelpPrimaryView = ref<HideoutPrimaryView | null>(null);
  const hideoutHelpRequirementCompleteState = ref(false);
  const hideoutHelpBuiltState = ref(false);
  const HIDEOUT_HELP_STEP = {
    intro: 0,
    cardStatus: 1,
    requirement: 2,
    build: 3,
    locked: 4,
    prerequisites: 5,
    settingsButton: 6,
    settingsPanel: 7,
    maxed: 8,
    all: 9,
  } as const;
  const helpText = (key: string, fallback: string, params?: Record<string, string>) => {
    const value = params ? t(key, params) : t(key);
    return value === key ? fallback : value;
  };
  const hideoutHelpSteps = computed(() => {
    return [
      {
        advanceOnSelector: '[data-help-target="hideout-filter-available"]',
        bullets: [
          helpText(
            'page_help.hideout.tour.intro.bullet_one',
            'Each badge shows how many stations are in that view.'
          ),
          helpText(
            'page_help.hideout.tour.intro.bullet_two',
            'Available is the fastest way to find stations ready for their next build level.'
          ),
        ],
        interactionHint: helpText('page_help.hideout.tour.intro.hint', 'Click AVAILABLE.'),
        description: helpText(
          'page_help.hideout.tour.intro.description',
          'These tabs filter your hideout by station status.'
        ),
        preferredPlacement: 'bottom' as const,
        targetSelector: '[data-help-target="hideout-filter-available"]',
        title: helpText('page_help.hideout.tour.intro.title', 'Filter bar'),
      },
      {
        description: helpText(
          'page_help.hideout.tour.card_status.description',
          'This demo card matches a real station card. Start at the header badge because it tells you if the next upgrade is ready or blocked.'
        ),
        targetSelector: '[data-help-target="hideout-help-demo-status"]',
        title: helpText('page_help.hideout.tour.card_status.title', 'Read the card header'),
      },
      {
        advanceOnSelector: '[data-help-target="hideout-help-demo-item"]',
        description: helpText(
          'page_help.hideout.tour.requirement.description',
          'Requirement tiles are your build checklist. Clicking one marks that material complete for hideout tracking.'
        ),
        interactionHint: helpText('page_help.hideout.tour.requirement.hint', 'Click the item.'),
        targetSelector: '[data-help-target="hideout-help-demo-item"]',
        title: helpText('page_help.hideout.tour.requirement.title', 'Try a requirement tile'),
      },
      {
        advanceOnSelector: '[data-help-target="hideout-help-demo-build"]',
        description: helpText(
          'page_help.hideout.tour.build.description',
          'When the requirements are done, build marks that upgrade complete and moves the station forward.'
        ),
        interactionHint: helpText('page_help.hideout.tour.build.hint', 'Click BUILD LEVEL 1.'),
        targetSelector: '[data-help-target="hideout-help-demo-build"]',
        title: helpText('page_help.hideout.tour.build.title', 'Try the build action'),
      },
      {
        advanceOnSelector: '[data-help-target="hideout-filter-locked"]',
        bullets: [
          helpText(
            'page_help.hideout.tour.locked.bullet_one',
            'Use this when you want to see what is still blocked.'
          ),
        ],
        description: helpText(
          'page_help.hideout.tour.locked.description',
          'Locked shows stations that fail the prerequisite checks you currently enforce. It is your blocker review, not a permanent dead end.'
        ),
        interactionHint: helpText('page_help.hideout.tour.locked.hint', 'Click LOCKED.'),
        preferredPlacement: 'bottom' as const,
        targetSelector: '[data-help-target="hideout-filter-locked"]',
        title: helpText('page_help.hideout.tour.locked.title', 'Locked'),
      },
      {
        description: helpText(
          'page_help.hideout.tour.prerequisites.description',
          'On real station cards, prerequisite lines tell you what is missing and double as shortcuts. Station lines jump to that station, skill lines open Skills in Settings, and trader lines open the dashboard trader card.'
        ),
        targetSelector: '[data-help-target="hideout-help-demo-prerequisites"]',
        title: helpText('page_help.hideout.tour.prerequisites.title', 'Read the prerequisites'),
      },
      {
        advanceOnSelector: '[data-help-target="hideout-settings-button"]',
        description: helpText(
          'page_help.hideout.tour.settings_button.description',
          'Settings changes how strict hideout status filtering is. Use it when you want Available and Locked to reflect more or fewer prerequisite types.'
        ),
        interactionHint: helpText('page_help.hideout.tour.settings_button.hint', 'Click SETTINGS.'),
        preferredPlacement: 'bottom' as const,
        targetSelector: '[data-help-target="hideout-settings-button"]',
        title: helpText('page_help.hideout.tour.settings_button.title', 'Settings'),
      },
      {
        bullets: [
          helpText(
            'page_help.hideout.tour.settings_panel.bullet_one',
            'These switches control station levels, skills, and trader loyalty.'
          ),
          helpText(
            'page_help.hideout.tour.settings_panel.bullet_two',
            'Turning more on moves more stations into Locked.'
          ),
        ],
        description: helpText(
          'page_help.hideout.tour.settings_panel.description',
          'Use this menu when you want tighter or looser prerequisite checking. These toggles change hideout status labels and filters, not your saved station progress.'
        ),
        targetSelector: '[data-help-target="hideout-settings-panel"]',
        title: helpText('page_help.hideout.tour.settings_panel.title', 'Control blockers'),
      },
      {
        advanceOnSelector: '[data-help-target="hideout-filter-maxed"]',
        description: helpText(
          'page_help.hideout.tour.maxed.description',
          'Maxed shows stations that are already at their highest level.'
        ),
        interactionHint: helpText('page_help.hideout.tour.maxed.hint', 'Click MAXED.'),
        preferredPlacement: 'bottom' as const,
        targetSelector: '[data-help-target="hideout-filter-maxed"]',
        title: helpText('page_help.hideout.tour.maxed.title', 'Maxed'),
      },
      {
        bullets: [
          helpText(
            'page_help.hideout.tour.all.bullet_one',
            'Use this when you want the full hideout list back.'
          ),
        ],
        description: helpText(
          'page_help.hideout.tour.all.description',
          'All brings every station back into one list so you can scan the whole hideout again.'
        ),
        interactionHint: helpText('page_help.hideout.tour.all.hint', 'Click ALL.'),
        preferredPlacement: 'bottom' as const,
        targetSelector: '[data-help-target="hideout-filter-all"]',
        title: helpText('page_help.hideout.tour.all.title', 'All'),
      },
    ];
  });
  const prereqPreferenceSetters = {
    station: (value: boolean) => preferencesStore.setHideoutRequireStationLevels(value),
    skill: (value: boolean) => preferencesStore.setHideoutRequireSkillLevels(value),
    trader: (value: boolean) => preferencesStore.setHideoutRequireTraderLoyalty(value),
  } satisfies Record<'station' | 'skill' | 'trader', (value: boolean) => void>;
  const setPrereqPreference = (key: 'station' | 'skill' | 'trader', enabled: boolean) => {
    const setter = prereqPreferenceSetters[key];
    if (!setter) return;
    setter(enabled);
  };
  const HIDEOUT_PREREQS_ENFORCED_STORAGE_KEY = 'hideout-prereqs-enforced';
  const hasEnforcedPrereqs = useState<boolean>('hideout-prereqs-enforced', () => false);
  if (import.meta.client) {
    hasEnforcedPrereqs.value =
      localStorage.getItem(HIDEOUT_PREREQS_ENFORCED_STORAGE_KEY) === 'true';
  }
  const setHasEnforcedPrereqs = (value: boolean) => {
    hasEnforcedPrereqs.value = value;
    if (!import.meta.client) return;
    localStorage.setItem(HIDEOUT_PREREQS_ENFORCED_STORAGE_KEY, value ? 'true' : 'false');
  };
  const {
    showPrereqConfirm,
    pendingPrereqToggle,
    handlePrereqToggle,
    cancelPrereqToggle,
    confirmPrereqToggle,
  } = usePrereqModal({
    onConfirm: (key: PrereqType) => {
      setPrereqPreference(key, true);
      tarkovStore.enforceHideoutPrereqsNow();
      setHasEnforcedPrereqs(true);
    },
    setPreference: setPrereqPreference,
  });
  const { activePrimaryView, isStoreLoading, visibleStations, stationCounts } =
    useHideoutFiltering();
  useHideoutRouteSync();
  const isDesktopSettingsDrawerOpen = computed(
    () => isSettingsOpen.value && isWideEnoughForDockedDrawer.value
  );
  const isOverlaySettingsDrawerOpen = computed(
    () => isSettingsOpen.value && !isWideEnoughForDockedDrawer.value
  );
  const isHideoutHelpTourActive = computed(
    () => isHelpOpen.value && hideoutHelpSteps.value.length > 0
  );
  const displayPrimaryView = computed<HideoutPrimaryView>(() => {
    return hideoutHelpPrimaryView.value ?? activePrimaryView.value;
  });
  const sortReadyFirst = computed(() => preferencesStore.hideoutSortReadyFirst);
  const stationList = computed(() => (hideoutStations.value ?? []) as HideoutStation[]);
  const isStationReadyToBuild = (station: HideoutStation): boolean => {
    const currentLevel = progressStore.hideoutLevels?.[station.id]?.self ?? 0;
    const nextLevel = [...station.levels]
      .sort((leftLevel, rightLevel) => leftLevel.level - rightLevel.level)
      .find((level) => level.level === currentLevel + 1);
    if (!nextLevel) return false;
    return arePrereqsMet(nextLevel);
  };
  const sortStationsByReadiness = (stations: HideoutStation[]) => {
    if (!sortReadyFirst.value) return stations;
    return stations
      .map((station, index) => ({
        index,
        ready: isStationReadyToBuild(station),
        station,
      }))
      .sort((leftEntry, rightEntry) => {
        if (leftEntry.ready === rightEntry.ready) return leftEntry.index - rightEntry.index;
        return leftEntry.ready ? -1 : 1;
      })
      .map((entry) => entry.station);
  };
  const filterStationsByView = (stations: HideoutStation[], view: HideoutPrimaryView) => {
    if (view === 'all') return sortStationsByReadiness(stations);
    return sortStationsByReadiness(
      stations.filter((station) => getStationStatus(station) === view)
    );
  };
  const displayVisibleStations = computed(() => {
    if (isStoreLoading.value) return [];
    if (!isHideoutHelpTourActive.value) return visibleStations.value;
    return filterStationsByView(stationList.value, displayPrimaryView.value);
  });
  const selectPrimaryView = (view: HideoutPrimaryView) => {
    if (isHideoutHelpTourActive.value) {
      hideoutHelpPrimaryView.value = view;
      return;
    }
    activePrimaryView.value = view;
  };
  const BATCH_SIZE = 4;
  const visibleStationCount = ref(BATCH_SIZE);
  const loadMoreSentinel = ref<HTMLElement | null>(null);
  const visibleStationsSlice = computed(() =>
    displayVisibleStations.value.slice(0, visibleStationCount.value)
  );
  const hasMoreStations = computed(
    () => visibleStationCount.value < displayVisibleStations.value.length
  );
  const loadMoreStations = () => {
    if (!hasMoreStations.value) return;
    visibleStationCount.value = Math.min(
      visibleStationCount.value + BATCH_SIZE,
      displayVisibleStations.value.length
    );
  };
  const { checkAndLoadMore } = useInfiniteScroll(loadMoreSentinel, loadMoreStations, {
    autoLoadOnReady: true,
    enabled: hasMoreStations,
    maxAutoLoads: 4,
    rootMargin: '300px',
  });
  const debouncedCheckAndLoadMore = useDebounceFn(() => {
    void nextTick(() => {
      checkAndLoadMore();
    });
  }, 50);
  watch(displayVisibleStations, (newStations) => {
    if (visibleStationCount.value > newStations.length) {
      visibleStationCount.value = newStations.length;
    }
    debouncedCheckAndLoadMore();
  });
  type HideoutHelpDemoMode = 'available' | 'built' | 'locked' | 'maxed';
  const resetHideoutHelpState = () => {
    hideoutHelpStepIndex.value = 0;
    hideoutHelpPrimaryView.value = null;
    hideoutHelpRequirementCompleteState.value = false;
    hideoutHelpBuiltState.value = false;
    isSettingsOpen.value = false;
  };
  const resolveHideoutHelpView = (stepIndex: number): HideoutPrimaryView => {
    if (stepIndex === HIDEOUT_HELP_STEP.intro) return 'all';
    if (stepIndex <= HIDEOUT_HELP_STEP.build) return 'available';
    if (stepIndex <= HIDEOUT_HELP_STEP.settingsPanel) return 'locked';
    if (stepIndex === HIDEOUT_HELP_STEP.maxed) return 'maxed';
    return 'all';
  };
  const applyHideoutHelpStep = (stepIndex: number) => {
    hideoutHelpPrimaryView.value = resolveHideoutHelpView(stepIndex);
    isSettingsOpen.value = stepIndex === HIDEOUT_HELP_STEP.settingsPanel;
    if (stepIndex < HIDEOUT_HELP_STEP.requirement) {
      hideoutHelpRequirementCompleteState.value = false;
    }
    if (stepIndex >= HIDEOUT_HELP_STEP.build) {
      hideoutHelpRequirementCompleteState.value = true;
    }
    if (stepIndex !== HIDEOUT_HELP_STEP.build) {
      hideoutHelpBuiltState.value = false;
    }
  };
  const handleHideoutHelpStepChange = (stepIndex: number) => {
    hideoutHelpStepIndex.value = stepIndex;
    if (!isHideoutHelpTourActive.value) return;
    applyHideoutHelpStep(stepIndex);
  };
  const handleHelpClose = () => {
    closeHelp();
    resetHideoutHelpState();
  };
  const toggleHideoutHelpRequirement = () => {
    hideoutHelpRequirementCompleteState.value = !hideoutHelpRequirementCompleteState.value;
  };
  const handleHideoutHelpBuild = () => {
    hideoutHelpRequirementCompleteState.value = true;
    hideoutHelpBuiltState.value = true;
  };
  const hideoutHelpRequirementComplete = computed(() => {
    return (
      hideoutHelpRequirementCompleteState.value ||
      hideoutHelpStepIndex.value >= HIDEOUT_HELP_STEP.build
    );
  });
  const hideoutHelpDemoMode = computed<HideoutHelpDemoMode>(() => {
    if (hideoutHelpStepIndex.value === HIDEOUT_HELP_STEP.build && hideoutHelpBuiltState.value) {
      return 'built';
    }
    if (hideoutHelpStepIndex.value === HIDEOUT_HELP_STEP.prerequisites) {
      return 'locked';
    }
    if (hideoutHelpStepIndex.value === HIDEOUT_HELP_STEP.maxed) {
      return 'maxed';
    }
    return 'available';
  });
  const showHideoutHelpDemo = computed(() => {
    return (
      isHideoutHelpTourActive.value &&
      (hideoutHelpStepIndex.value === HIDEOUT_HELP_STEP.cardStatus ||
        hideoutHelpStepIndex.value === HIDEOUT_HELP_STEP.requirement ||
        hideoutHelpStepIndex.value === HIDEOUT_HELP_STEP.build ||
        hideoutHelpStepIndex.value === HIDEOUT_HELP_STEP.prerequisites)
    );
  });
  watch(isHelpOpen, (isOpen) => {
    if (!isOpen) {
      resetHideoutHelpState();
      return;
    }
    handleHideoutHelpStepChange(0);
  });
  type HideoutPrimaryViewOption = {
    badgeColor: string;
    count: number;
    icon: string;
    title: string;
    view: HideoutPrimaryView;
  };
  const primaryViews = computed<HideoutPrimaryViewOption[]>(() => [
    {
      title: t('page.hideout.primary_views.all'),
      icon: 'mdi-clipboard-check',
      view: 'all',
      count: stationCounts.value.all,
      badgeColor: 'bg-secondary-600',
    },
    {
      title: t('page.hideout.primary_views.available'),
      icon: 'mdi-tag-arrow-up-outline',
      view: 'available',
      count: stationCounts.value.available,
      badgeColor: 'bg-info-600',
    },
    {
      title: t('page.hideout.primary_views.locked'),
      icon: 'mdi-lock',
      view: 'locked',
      count: stationCounts.value.locked,
      badgeColor: 'bg-surface-600',
    },
    {
      title: t('page.hideout.primary_views.maxed'),
      icon: 'mdi-arrow-collapse-up',
      view: 'maxed',
      count: stationCounts.value.maxed,
      badgeColor: 'bg-success-600',
    },
  ]);
  const prereqLabels = computed(() => ({
    station: helpText('page.hideout.prereq_filters.station_levels', 'Require station levels'),
    skill: helpText('page.hideout.prereq_filters.skill_levels', 'Require skill levels'),
    trader: helpText('page.hideout.prereq_filters.trader_loyalty', 'Require trader loyalty'),
  }));
  const pendingPrereqLabel = computed(() => {
    if (!pendingPrereqToggle.value) return '';
    return prereqLabels.value[pendingPrereqToggle.value];
  });
  const shouldEnforcePrereqs = computed(
    () =>
      preferencesStore.hideoutRequireStationLevels ||
      preferencesStore.hideoutRequireSkillLevels ||
      preferencesStore.hideoutRequireTraderLoyalty
  );
  const prereqConfirmTitle = computed(() =>
    helpText('page.hideout.prereq_filters.confirm_title', 'Enable availability requirement?')
  );
  const prereqConfirmDescription = computed(() =>
    helpText(
      'page.hideout.prereq_filters.confirm_description',
      'Enabling this requirement may remove hideout upgrades that no longer meet prerequisites.',
      {
        requirement: pendingPrereqLabel.value,
      }
    )
  );
  watch(
    [isStoreLoading, shouldEnforcePrereqs],
    ([loading, shouldEnforce]) => {
      if (loading) return;
      if (!shouldEnforce) {
        setHasEnforcedPrereqs(false);
        return;
      }
      if (hasEnforcedPrereqs.value) return;
      tarkovStore.enforceHideoutPrereqsNow();
      setHasEnforcedPrereqs(true);
    },
    { immediate: true }
  );
  // Handle deep linking to a specific station via ?station=stationId query param
  const scrollToStation = async (stationId: string) => {
    await nextTick();
    setTimeout(() => {
      const stationElement = document.getElementById(`station-${stationId}`);
      if (stationElement) {
        stationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };
  const handleStationQueryParam = () => {
    const stationQuery = route.query.station;
    const moduleQuery = route.query.module;
    const stationId = Array.isArray(stationQuery) ? stationQuery[0] : stationQuery;
    const moduleId = Array.isArray(moduleQuery) ? moduleQuery[0] : moduleQuery;
    if (!stationId || isStoreLoading.value) return;
    // Determine station status and set appropriate filter
    const station = hideoutStations.value?.find((s) => s.id === stationId);
    const status = station ? getStationStatus(station) : 'locked';
    if (activePrimaryView.value !== status) {
      activePrimaryView.value = status;
    }
    const targetStations = filterStationsByView(stationList.value, status);
    const stationIndex = targetStations.findIndex(
      (targetStation) => targetStation.id === stationId
    );
    if (stationIndex >= 0) {
      visibleStationCount.value = Math.max(BATCH_SIZE, stationIndex + 1);
    }
    highlightedStationId.value = stationId;
    highlightedModuleId.value = moduleId || null;
    // Scroll to the station after filters are applied
    scrollToStation(stationId);
    // Clear the query param to avoid re-triggering on filter changes
    router.replace({ path: '/hideout', query: {} });
  };
  // Watch for station query param and handle it when data is loaded
  watch(
    [() => route.query.station, () => route.query.module, isStoreLoading],
    ([stationQueryParam, moduleQueryParam, loading]) => {
      if ((stationQueryParam || moduleQueryParam) && !loading) {
        handleStationQueryParam();
      }
    },
    { immediate: true }
  );
</script>
