<template>
  <div class="flex min-h-[calc(100vh-250px)] overflow-x-hidden">
    <div class="min-w-0 flex-1 px-3 py-6 sm:px-6">
      <div class="mx-auto max-w-350 xl:max-w-400 2xl:max-w-450">
        <slot name="header" />
        <DashboardSupportBanner :completed-tasks="dashboardStats.completedTasks.value" />
        <DashboardProgressSummary>
          <template #actions>
            <DashboardMigrationBanner />
            <DashboardChangelog />
          </template>
        </DashboardProgressSummary>
        <DashboardUpNext />
        <div id="dashboard-traders" class="mb-8 scroll-mt-16">
          <div class="mb-4 flex w-full items-center">
            <button
              type="button"
              class="group light:text-surface-50 flex min-w-0 flex-1 cursor-pointer items-center text-2xl font-bold text-white"
              :aria-expanded="!tradersSectionCollapsed"
              @click="tradersSectionCollapsed = !tradersSectionCollapsed"
            >
              <UIcon
                name="i-mdi-account-group"
                class="text-primary-500 light:text-primary-800 mr-2 h-6 w-6 shrink-0"
              />
              <span class="truncate">{{ $t('page.dashboard.traders.title') }}</span>
              <UIcon
                :name="tradersSectionCollapsed ? 'i-mdi-chevron-down' : 'i-mdi-chevron-up'"
                class="text-surface-400 group-hover:text-surface-200 ml-2 h-5 w-5 shrink-0 transition-colors"
              />
            </button>
            <div class="ml-auto flex shrink-0 items-center gap-1.5">
              <SelectMenuFixed
                :model-value="traderSortMode"
                :items="traderSortOptions"
                value-key="value"
                size="sm"
                class="w-28"
                :aria-label="$t('page.dashboard.traders.sort.aria_label')"
                @update:model-value="traderSortMode = $event"
              />
              <UButton
                v-show="traderSortMode !== 'default'"
                variant="ghost"
                color="neutral"
                size="sm"
                :icon="
                  traderSortDirection === 'desc' ? 'i-mdi-sort-descending' : 'i-mdi-sort-ascending'
                "
                :aria-label="$t('page.dashboard.traders.sort.direction_aria_label')"
                @click="toggleSortDirection"
              />
            </div>
          </div>
          <div
            v-show="!tradersSectionCollapsed"
            class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            <div
              v-for="trader in orderedTraderStats"
              :id="`dashboard-trader-${trader.id}`"
              :key="trader.id"
              class="content-visibility-auto-220 h-full"
              :class="
                highlightedTraderId === trader.id
                  ? 'ring-primary-500 ring-offset-surface-950 rounded-lg ring-2 ring-offset-2'
                  : ''
              "
            >
              <DashboardTraderCard
                :trader="trader"
                :completed-tasks="trader.completedTasks"
                :total-tasks="trader.totalTasks"
                :percentage="trader.percentage"
                :unlock="trader.unlock"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="translate-x-4 opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-x-0 opacity-100"
      leave-to-class="translate-x-4 opacity-0"
    >
      <div v-if="isDesktopHelpPanelOpen" class="hidden w-104 shrink-0 px-4 py-6 lg:block">
        <PageHelpPanel page-key="dashboard" mode="docked" />
      </div>
    </Transition>
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="translate-y-2 opacity-0 sm:translate-x-4 sm:translate-y-0"
        enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100 sm:translate-x-0"
        leave-to-class="translate-y-2 opacity-0 sm:translate-x-4 sm:translate-y-0"
      >
        <PageHelpPanel v-if="isMobileHelpPanelOpen" page-key="dashboard" mode="overlay" />
      </Transition>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
  import { resolveTraderUnlock } from '@/features/dashboard/traderLockStatus';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, sortTraderStats } from '@/utils/constants';
  import { getQueryString } from '@/utils/routeHelpers';
  import { storyCatalogForMode } from '@/utils/storylineCompletion';
  import { storylineTraderUnlocks } from '@/utils/storylineTraderUnlocks';
  import type { TraderSortMode, TraderSortDirection } from '@/utils/constants';
  const { isOpen: isHelpOpen } = usePageHelpState('dashboard');
  const { isDesktopHelpPanelOpen, isMobileHelpPanelOpen } = usePageSideRailState({
    helpOpen: isHelpOpen,
  });
  const route = useRoute();
  const tradersSectionCollapsed = ref(false);
  const highlightedTraderId = ref<string | null>(null);
  const traderHighlightTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  // Dashboard statistics composable
  const dashboardStats = useDashboardStats();
  const router = useRouter();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const { t } = useI18n({ useScope: 'global' });
  const traderSortMode = computed({
    get: () => preferencesStore.getTraderSortMode,
    set: (val: TraderSortMode) => preferencesStore.setTraderSortMode(val),
  });
  const traderSortDirection = computed({
    get: () => preferencesStore.getTraderSortDirection,
    set: (val: TraderSortDirection) => preferencesStore.setTraderSortDirection(val),
  });
  const toggleSortDirection = () => {
    traderSortDirection.value = traderSortDirection.value === 'desc' ? 'asc' : 'desc';
  };
  const traderSortOptions = computed(() => [
    { value: 'default', label: t('common.default') },
    { value: 'progress', label: t('common.progress') },
    { value: 'level', label: t('common.level') },
  ]);
  const traderStats = computed(() => {
    const stats = dashboardStats.traderStats.value || [];
    return sortTraderStats(
      stats,
      traderSortMode.value,
      traderSortDirection.value,
      tarkovStore.getTraderLevel,
      tarkovStore.getTraderReputation
    );
  });
  const traderStoryCatalog = computed(() =>
    storyCatalogForMode(
      metadataStore.storyChapters ?? [],
      metadataStore.storyChaptersGameMode,
      tarkovStore.getCurrentGameMode?.() ?? GAME_MODES.PVP
    )
  );
  const traderStoryUnlocks = computed(() => storylineTraderUnlocks(traderStoryCatalog.value));
  const traderLockDeps = computed(() => ({
    tasks: metadataStore.tasks,
    isTaskComplete: (id: string) => tarkovStore.isTaskComplete(id),
    gameMode: tarkovStore.getCurrentGameMode?.() ?? GAME_MODES.PVP,
    storyChapters: traderStoryCatalog.value,
    storyTraderUnlocks: traderStoryUnlocks.value,
    isStoryObjectiveComplete: tarkovStore.isStoryObjectiveComplete,
    isStoryChapterComplete: tarkovStore.isStoryChapterComplete,
    getTraderLevel: tarkovStore.getTraderLevel,
    getTraderReputation: tarkovStore.getTraderReputation,
  }));
  const metadataTasksLoaded = computed(() => metadataStore.tasks.length > 0);
  // Locked traders stay visible with their unlock requirement, after the open ones.
  const orderedTraderStats = computed(() => {
    const withUnlock = traderStats.value.map((trader) => ({
      ...trader,
      unlock: resolveTraderUnlock(trader, traderLockDeps.value),
    }));
    return [
      ...withUnlock.filter((trader) => !trader.unlock),
      ...withUnlock.filter((trader) => trader.unlock),
    ];
  });
  const clearTraderHighlight = () => {
    if (traderHighlightTimeout.value) {
      clearTimeout(traderHighlightTimeout.value);
      traderHighlightTimeout.value = null;
    }
    highlightedTraderId.value = null;
  };
  const focusTraderFromRoute = async () => {
    const traderId = getQueryString(route.query.trader);
    if (!traderId || traderStats.value.length === 0) return;
    if (!metadataTasksLoaded.value) return;
    const targetTrader = traderStats.value.find((trader) => trader.id === traderId);
    if (!targetTrader) return;
    tradersSectionCollapsed.value = false;
    await nextTick();
    const traderElement = document.getElementById(`dashboard-trader-${traderId}`);
    if (!traderElement) return;
    clearTraderHighlight();
    highlightedTraderId.value = traderId;
    traderElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    traderHighlightTimeout.value = setTimeout(() => {
      highlightedTraderId.value = null;
      traderHighlightTimeout.value = null;
    }, 2500);
    const nextQuery = { ...route.query };
    delete nextQuery.trader;
    router.replace({
      hash: route.hash,
      path: route.path,
      query: nextQuery,
    });
  };
  watch(
    [() => route.query.trader, traderStats, metadataTasksLoaded],
    async () => {
      await focusTraderFromRoute();
    },
    { immediate: true }
  );
  onBeforeUnmount(() => {
    clearTraderHighlight();
  });
</script>
