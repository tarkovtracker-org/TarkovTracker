<template>
  <div class="flex min-h-[calc(100vh-250px)] overflow-x-hidden">
    <div class="min-w-0 flex-1 px-3 py-6 sm:px-6">
      <div class="mx-auto max-w-[1400px]">
        <h1 class="sr-only">Tarkov Tracker - Escape from Tarkov Progress Tracker</h1>
        <DashboardNextActions />
        <DashboardChangelog />
        <div class="mb-8">
          <button
            type="button"
            data-testid="dashboard-progress-toggle"
            class="group text-surface-100 mb-4 flex w-full cursor-pointer items-center text-xl font-semibold"
            :aria-expanded="!progressSectionCollapsed"
            @click="progressSectionCollapsed = !progressSectionCollapsed"
          >
            <UIcon name="i-mdi-chart-line" class="text-primary-500 mr-2 h-6 w-6" />
            {{ $t('page.dashboard.progress.title') }}
            <UIcon
              :name="progressSectionCollapsed ? 'i-mdi-chevron-down' : 'i-mdi-chevron-up'"
              class="text-surface-400 group-hover:text-surface-200 ml-auto h-5 w-5 transition-colors"
            />
          </button>
          <div
            v-show="!progressSectionCollapsed"
            class="bg-surface-950/40 rounded-2xl border border-white/8 p-4 sm:p-5"
          >
            <div
              class="text-surface-400 mb-3 flex items-center justify-end gap-1.5 text-[11px] sm:text-xs"
              data-testid="dashboard-filter-notice"
              :data-filter-active="hasDashboardFiltersActive ? 'true' : 'false'"
            >
              <UIcon
                :name="
                  hasDashboardFiltersActive ? 'i-mdi-filter-variant-minus' : 'i-mdi-filter-variant'
                "
                class="h-3.5 w-3.5 shrink-0"
                :class="hasDashboardFiltersActive ? 'text-warning-300' : 'text-info-300'"
              />
              <span :class="hasDashboardFiltersActive ? 'text-warning-200' : 'text-surface-400'">
                {{
                  hasDashboardFiltersActive
                    ? $t('page.dashboard.progress.filtered_status_active')
                    : $t('page.dashboard.progress.filtered_status_inactive')
                }}
              </span>
              <AppTooltip :text="$t('page.dashboard.progress.filtered_warning_tooltip')">
                <UIcon
                  name="i-mdi-help-circle-outline"
                  class="h-3.5 w-3.5 shrink-0"
                  :class="hasDashboardFiltersActive ? 'text-warning-300' : 'text-info-300'"
                  aria-hidden="true"
                />
              </AppTooltip>
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <DashboardProgressCard
                icon="i-mdi-checkbox-marked-circle-outline"
                :label="$t('page.dashboard.progress.tasks')"
                :completed="dashboardStats.completedTasks.value"
                :total="dashboardStats.totalTasks.value"
                :percentage="totalTasksPercentageNum"
                color="primary"
                @click="router.push('/tasks')"
              />
              <DashboardProgressCard
                icon="i-mdi-briefcase-search"
                :label="$t('page.dashboard.progress.objectives')"
                :completed="dashboardStats.completedObjectives.value"
                :total="dashboardStats.totalObjectives.value"
                :percentage="totalObjectivesPercentageNum"
                color="info"
                @click="router.push('/tasks')"
              />
              <DashboardProgressCard
                icon="i-mdi-package-variant"
                :label="$t('page.dashboard.progress.items')"
                :completed="dashboardStats.completedTaskItems.value"
                :total="dashboardStats.totalTaskItems.value"
                :percentage="totalTaskItemsPercentageNum"
                color="success"
                @click="router.push({ path: '/needed-items', query: { type: 'tasks' } })"
              />
              <DashboardProgressCard
                icon="i-mdi-home-city-outline"
                :label="$t('page.dashboard.progress.hideout_items')"
                :completed="dashboardStats.completedHideoutItems.value"
                :total="dashboardStats.totalHideoutItems.value"
                :percentage="totalHideoutItemsPercentageNum"
                color="neutral"
                @click="router.push({ path: '/needed-items', query: { type: 'hideout' } })"
              />
              <DashboardProgressCard
                icon="i-mdi-trophy"
                :label="$t('page.dashboard.progress.kappa')"
                :completed="dashboardStats.completedKappaTasks.value"
                :total="dashboardStats.totalKappaTasks.value"
                :percentage="totalKappaTasksPercentageNum"
                color="kappa"
                @click="router.push('/tasks')"
              />
              <DashboardProgressCard
                icon="i-mdi-lighthouse"
                :label="$t('page.dashboard.progress.lightkeeper')"
                :completed="dashboardStats.completedLightkeeperTasks.value"
                :total="dashboardStats.totalLightkeeperTasks.value"
                :percentage="totalLightkeeperTasksPercentageNum"
                color="lightkeeper"
                @click="router.push('/tasks')"
              />
            </div>
          </div>
        </div>
        <div id="dashboard-traders" class="mb-8 scroll-mt-16">
          <button
            type="button"
            class="group mb-4 flex w-full cursor-pointer items-center text-2xl font-bold text-white"
            :aria-expanded="!tradersSectionCollapsed"
            @click="tradersSectionCollapsed = !tradersSectionCollapsed"
          >
            <UIcon name="i-mdi-account-group" class="text-primary-500 mr-2 h-6 w-6" />
            {{ $t('page.dashboard.traders.title') }}
            <UIcon
              :name="tradersSectionCollapsed ? 'i-mdi-chevron-down' : 'i-mdi-chevron-up'"
              class="text-surface-400 group-hover:text-surface-200 ml-auto h-5 w-5 transition-colors"
            />
          </button>
          <div
            v-show="!tradersSectionCollapsed"
            class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <div
              v-for="trader in traderStats"
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
              />
            </div>
          </div>
        </div>
        <div class="content-visibility-auto-240">
          <button
            type="button"
            class="group mb-4 flex w-full cursor-pointer items-center text-2xl font-bold text-white"
            :aria-expanded="!milestonesSectionCollapsed"
            @click="milestonesSectionCollapsed = !milestonesSectionCollapsed"
          >
            <UIcon name="i-mdi-star-circle" class="text-primary-500 mr-2 h-6 w-6" />
            {{ $t('page.dashboard.milestones.title') }}
            <UIcon
              :name="milestonesSectionCollapsed ? 'i-mdi-chevron-down' : 'i-mdi-chevron-up'"
              class="text-surface-400 group-hover:text-surface-200 ml-auto h-5 w-5 transition-colors"
            />
          </button>
          <div
            v-show="!milestonesSectionCollapsed"
            class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5"
          >
            <DashboardMilestoneCard
              title="25%"
              :subtitle="$t('page.dashboard.milestones.starter')"
              :is-achieved="totalTasksPercentageNum >= 25"
              achieved-icon="i-mdi-check-circle"
              unachieved-icon="i-mdi-circle-outline"
              color="primary"
            />
            <DashboardMilestoneCard
              title="50%"
              :subtitle="$t('page.dashboard.milestones.halfway')"
              :is-achieved="totalTasksPercentageNum >= 50"
              achieved-icon="i-mdi-check-circle"
              unachieved-icon="i-mdi-circle-outline"
              color="info"
            />
            <DashboardMilestoneCard
              title="75%"
              :subtitle="$t('page.dashboard.milestones.veteran')"
              :is-achieved="totalTasksPercentageNum >= 75"
              achieved-icon="i-mdi-check-circle"
              unachieved-icon="i-mdi-circle-outline"
              color="success"
            />
            <DashboardMilestoneCard
              :title="$t('page.dashboard.milestones.kappa.title')"
              :subtitle="$t('page.dashboard.milestones.kappa.subtitle')"
              :is-achieved="totalKappaTasksPercentageNum >= 100"
              achieved-icon="i-mdi-trophy"
              unachieved-icon="i-mdi-trophy-outline"
              color="kappa"
            />
            <DashboardMilestoneCard
              :title="$t('page.dashboard.milestones.lightkeeper.title')"
              :subtitle="$t('page.dashboard.milestones.lightkeeper.subtitle')"
              :is-achieved="totalLightkeeperTasksPercentageNum >= 100"
              achieved-icon="i-mdi-lighthouse"
              unachieved-icon="i-mdi-lighthouse-on"
              color="lightkeeper"
            />
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
      <div v-if="isDesktopHelpPanelOpen" class="hidden w-[26rem] shrink-0 px-4 py-6 lg:block">
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
  import { useDashboardFilters } from '@/composables/useDashboardFilters';
  import { calculatePercentageNum } from '@/utils/formatters';
  import { getQueryString } from '@/utils/routeHelpers';
  const { isOpen: isHelpOpen } = usePageHelpState('dashboard');
  const { isDesktopHelpPanelOpen, isMobileHelpPanelOpen } = usePageSideRailState({
    helpOpen: isHelpOpen,
  });
  const route = useRoute();
  const progressSectionCollapsed = ref(false);
  const tradersSectionCollapsed = ref(false);
  const milestonesSectionCollapsed = ref(false);
  const highlightedTraderId = ref<string | null>(null);
  const traderHighlightTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  // Page metadata
  useSeoMeta({
    title: 'Tarkov Tracker - Escape from Tarkov Quest and Hideout Tracker',
    description:
      'Track Escape from Tarkov quests, storyline, hideout upgrades, and needed items in one place. Tarkov Tracker supports PvP and PvE progression tracking and team collaboration.',
    ogTitle: 'Tarkov Tracker - Escape from Tarkov Quest and Hideout Tracker',
    ogDescription:
      'Track Escape from Tarkov quests, storyline, hideout upgrades, and needed items in one place. Tarkov Tracker supports PvP and PvE progression tracking and team collaboration.',
    robots: 'index, follow',
  });
  // Dashboard statistics composable
  const dashboardStats = useDashboardStats();
  const router = useRouter();
  const { hasDashboardFiltersActive } = useDashboardFilters();
  // Unwrap trader stats for template usage
  const traderStats = computed(() => dashboardStats.traderStats.value || []);
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
    if (!traderStats.value.some((trader) => trader.id === traderId)) return;
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
    [() => route.query.trader, traderStats],
    async () => {
      await focusTraderFromRoute();
    },
    { immediate: true }
  );
  onBeforeUnmount(() => {
    clearTraderHighlight();
  });
  // Percentage calculations (numeric)
  const totalTasksPercentageNum = computed(() =>
    calculatePercentageNum(dashboardStats.completedTasks.value, dashboardStats.totalTasks.value)
  );
  const totalObjectivesPercentageNum = computed(() =>
    calculatePercentageNum(
      dashboardStats.completedObjectives.value,
      dashboardStats.totalObjectives.value
    )
  );
  const totalTaskItemsPercentageNum = computed(() =>
    calculatePercentageNum(
      dashboardStats.completedTaskItems.value,
      dashboardStats.totalTaskItems.value
    )
  );
  const totalHideoutItemsPercentageNum = computed(() =>
    calculatePercentageNum(
      dashboardStats.completedHideoutItems.value,
      dashboardStats.totalHideoutItems.value
    )
  );
  const totalKappaTasksPercentageNum = computed(() =>
    calculatePercentageNum(
      dashboardStats.completedKappaTasks.value,
      dashboardStats.totalKappaTasks.value
    )
  );
  const totalLightkeeperTasksPercentageNum = computed(() =>
    calculatePercentageNum(
      dashboardStats.completedLightkeeperTasks.value,
      dashboardStats.totalLightkeeperTasks.value
    )
  );
</script>
