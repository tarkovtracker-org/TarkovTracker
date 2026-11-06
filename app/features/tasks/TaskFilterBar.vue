<template>
  <div class="mb-6 space-y-3">
    <StatusTabBar
      :tabs="statusTabs"
      :model-value="selectedStatusView"
      :group-label="t('page.tasks.status_tabs_label')"
      :inert-when-selected="!isSearchActive"
      @update:model-value="setSecondaryView"
    >
      <template #actions>
        <TaskTeamFilter />
        <TaskFiltersPopover />
        <!-- The graph lays tasks out by dependency, so sorting only applies to list views. -->
        <SortControl
          v-if="!isGraphView"
          v-model="taskSortMode"
          :items="sortOptions"
          :label="t('page.tasks.sort.aria_label')"
          :leading-icon="currentSortIcon"
          :direction="taskSortDirection"
          select-class="min-w-0 flex-1 sm:w-40 sm:flex-none 2xl:w-44"
          @toggle-direction="toggleSortDirection"
        />
        <SettingsButton
          data-testid="task-settings-button"
          page-key="tasks"
          :label="t('page.tasks.settings.title')"
        />
      </template>
    </StatusTabBar>
    <ActiveFilterChips test-id-prefix="task-active-filters" :filters="activeFilters" />
    <div
      v-if="primaryView === 'maps' && maps.length > 0"
      class="w-full scrollbar-thin overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
    >
      <div
        class="bg-surface-900 flex w-max min-w-full gap-1 rounded-lg border border-white/12 px-3 py-3 shadow-sm sm:px-4"
      >
        <UButton
          v-for="mapOption in mapOptions"
          :key="mapOption.value"
          type="button"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="preferencesStore.getTaskMapView === mapOption.value"
          :aria-pressed="preferencesStore.getTaskMapView === mapOption.value"
          :class="[
            'gap-1.5',
            ...getTabClass('neutral', preferencesStore.getTaskMapView === mapOption.value),
          ]"
          @click="onMapSelect(mapOption)"
        >
          <span class="text-xs font-medium whitespace-nowrap">{{ mapOption.label }}</span>
          <span
            :class="[
              'light:text-surface-50 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white',
              mapOption.countClass,
            ]"
          >
            {{ mapOption.count }}
          </span>
        </UButton>
      </div>
    </div>
    <div
      v-if="isTraderView && traders.length > 0"
      class="w-full scrollbar-thin overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
    >
      <div
        class="bg-surface-900 flex w-max min-w-full gap-1 rounded-lg border border-white/12 px-3 py-3 shadow-sm sm:px-4"
      >
        <UButton
          v-for="trader in traders"
          :key="trader.id"
          type="button"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="preferencesStore.getTaskTraderView === trader.id"
          :aria-pressed="preferencesStore.getTaskTraderView === trader.id"
          :class="[
            'gap-2',
            ...getTabClass('neutral', preferencesStore.getTaskTraderView === trader.id),
          ]"
          @click="onTraderSelect(trader.id)"
        >
          <div class="relative">
            <div class="bg-surface-800 h-8 w-8 overflow-hidden rounded-full">
              <img
                v-if="trader.imageLink"
                :src="trader.imageLink"
                :alt="trader.name"
                class="h-full w-full object-cover"
              />
              <UIcon v-else name="i-mdi-account-circle" class="text-surface-500 h-full w-full" />
            </div>
            <span
              class="bg-pve-500 light:text-surface-50 absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-bold text-white"
            >
              {{ traderCounts[trader.id] }}
            </span>
          </div>
          <span class="text-xs font-medium whitespace-nowrap">{{ trader.name }}</span>
        </UButton>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import ActiveFilterChips from '@/components/ui/ActiveFilterChips.vue';
  import SettingsButton from '@/components/ui/SettingsButton.vue';
  import SortControl from '@/components/ui/SortControl.vue';
  import StatusTabBar from '@/components/ui/StatusTabBar.vue';
  import { useTaskFiltering } from '@/composables/useTaskFiltering';
  import { useTaskContentFilters } from '@/features/tasks/composables/useTaskContentFilters';
  import TaskFiltersPopover from '@/features/tasks/TaskFiltersPopover.vue';
  import TaskTeamFilter from '@/features/tasks/TaskTeamFilter.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { TASK_SORT_MODES } from '@/types/taskSort';
  import { ALL_TAB_ICON, getTabClass } from '@/utils/statusTones';
  import {
    getTaskSecondaryViewForPrimaryView,
    normalizeSecondaryView,
    normalizeSortMode,
  } from '@/utils/taskFilterNormalization';
  import type { TaskStatusCounts } from '@/features/tasks/composables/useTaskFilters';
  import type { TaskSecondaryView } from '@/types/taskFilter';
  import type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
  import type { StatusTabItem, StatusTone } from '@/utils/statusTones';
  const props = defineProps<{
    /** A search is typed, so status tabs narrow it instead of saving a preference. */
    isSearchActive?: boolean;
    /** Status the list currently filters by; `all` while a search spans every status. */
    activeStatusView?: TaskSecondaryView;
    searchStatusCounts?: TaskStatusCounts | null;
  }>();
  const emit = defineEmits<{
    'pin-status': [status: TaskSecondaryView];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const metadataStore = useMetadataStore();
  const { activeFilters } = useTaskContentFilters();
  const { calculateMapTaskTotals, calculateStatusCounts, calculateTraderCounts } =
    useTaskFiltering();
  const primaryView = computed(() => preferencesStore.getTaskPrimaryView);
  const isGraphView = computed(() => primaryView.value === 'graph');
  const maps = computed(() => metadataStore.mapsWithSvg);
  const secondaryView = computed(() =>
    getTaskSecondaryViewForPrimaryView(primaryView.value, preferencesStore.getTaskSecondaryView)
  );
  const selectedStatusView = computed(() => props.activeStatusView ?? secondaryView.value);
  const traderCounts = computed(() => {
    const userView = preferencesStore.getTaskUserView;
    return calculateTraderCounts(userView, selectedStatusView.value);
  });
  // The traders and graph views show one trader at a time, picked from those with tasks left.
  const isTraderView = computed(() => primaryView.value === 'traders' || isGraphView.value);
  const traders = computed(() => {
    return metadataStore.sortedTraders.filter((trader) => (traderCounts.value[trader.id] ?? 0) > 0);
  });
  const onTraderSelect = (traderId: string) => {
    if (preferencesStore.getTaskTraderView !== traderId) {
      preferencesStore.setTaskTraderView(traderId);
    }
  };
  const showAllStatusButton = computed(
    () => isGraphView.value || preferencesStore.getShowAllFilter
  );
  const statusViewVisibility = computed<Record<TaskSecondaryView, boolean>>(() => ({
    all: showAllStatusButton.value,
    available: !isGraphView.value && preferencesStore.getShowAvailableFilter,
    locked: !isGraphView.value && preferencesStore.getShowLockedFilter,
    completed: !isGraphView.value && preferencesStore.getShowCompletedFilter,
    failed: !isGraphView.value && preferencesStore.getShowFailedFilter,
  }));
  const visibleStatusViews = computed<TaskSecondaryView[]>(() => {
    return (['all', 'available', 'locked', 'completed', 'failed'] as const).filter(
      (view) => statusViewVisibility.value[view]
    );
  });
  // Calculate task counts for badges
  const statusCounts = computed(() => {
    const userView = preferencesStore.getTaskUserView;
    return calculateStatusCounts(userView);
  });
  const displayStatusCounts = computed(() => props.searchStatusCounts ?? statusCounts.value);
  const STATUS_TABS: Array<{
    value: TaskSecondaryView;
    labelKey: string;
    icon: string;
    tone: StatusTone;
  }> = [
    { value: 'all', labelKey: 'common.all', icon: ALL_TAB_ICON, tone: 'neutral' },
    {
      value: 'available',
      labelKey: 'common.available',
      icon: 'i-mdi-clipboard-text',
      tone: 'info',
    },
    { value: 'locked', labelKey: 'common.locked', icon: 'i-mdi-lock', tone: 'locked' },
    {
      value: 'completed',
      labelKey: 'common.completed',
      icon: 'i-mdi-check-circle',
      tone: 'success',
    },
    { value: 'failed', labelKey: 'common.failed', icon: 'i-mdi-close-circle', tone: 'error' },
  ];
  const statusTabs = computed<StatusTabItem<TaskSecondaryView>[]>(() =>
    STATUS_TABS.filter((tab) => statusViewVisibility.value[tab.value]).map((tab) => ({
      value: tab.value,
      label: t(tab.labelKey),
      icon: tab.icon,
      tone: tab.tone,
      count: displayStatusCounts.value[tab.value],
    }))
  );
  type SortOption = {
    value: TaskSortMode;
    label: string;
    icon: string;
  };
  const SORT_MODE_ICONS: Record<TaskSortMode, string> = {
    none: 'i-mdi-sort',
    impact: 'i-mdi-chart-line',
    alphabetical: 'i-mdi-sort-alphabetical-ascending',
    level: 'i-mdi-sort-numeric-ascending',
    progression: 'i-mdi-stairs-up',
    trader: 'i-mdi-account',
    teammates: 'i-mdi-account-multiple',
    xp: 'i-mdi-star',
  };
  const sortOptions = computed<SortOption[]>(() =>
    TASK_SORT_MODES.map((mode) => ({
      value: mode,
      label: t(`page.tasks.sort.${mode}`),
      icon: SORT_MODE_ICONS[mode],
    }))
  );
  const taskSortMode = computed({
    get: (): TaskSortMode => normalizeSortMode(preferencesStore.getTaskSortMode),
    set: (value: TaskSortMode) => preferencesStore.setTaskSortMode(normalizeSortMode(value)),
  });
  const taskSortDirection = computed({
    get: () => preferencesStore.getTaskSortDirection,
    set: (value: TaskSortDirection) => preferencesStore.setTaskSortDirection(value),
  });
  const toggleSortDirection = () => {
    taskSortDirection.value = taskSortDirection.value === 'asc' ? 'desc' : 'asc';
  };
  const currentSortIcon = computed(() => {
    return SORT_MODE_ICONS[taskSortMode.value] ?? 'i-mdi-sort';
  });
  const mergedMaps = computed(() => {
    return maps.value.map((map) => {
      const mergedIds = (map as { mergedIds?: string[] }).mergedIds || [];
      const normalizedIds = mergedIds.includes(map.id) ? mergedIds : [map.id, ...mergedIds];
      return {
        id: map.id,
        mergedIds: normalizedIds.length ? normalizedIds : [map.id],
      };
    });
  });
  const mapTaskCounts = computed(() => {
    if (!metadataStore.tasks.length || !mergedMaps.value.length) return {};
    return calculateMapTaskTotals(
      mergedMaps.value,
      metadataStore.tasks,
      preferencesStore.getHideGlobalTasks,
      preferencesStore.getTaskUserView,
      normalizeSecondaryView(preferencesStore.getTaskSecondaryView),
      preferencesStore.getHideCompletedMapObjectives
    );
  });
  const ensureSelectedTrader = (visibleTraders: Array<{ id: string }>) => {
    const firstTrader = visibleTraders[0];
    if (firstTrader?.id) preferencesStore.setTaskTraderView(firstTrader.id);
  };
  const ensureSelectedMap = (availableMaps: Array<{ id: string }>) => {
    const firstMap = availableMaps[0];
    if (firstMap?.id) preferencesStore.setTaskMapView(firstMap.id);
  };
  // Secondary view (available / locked / completed)
  // A tab picked during a search only narrows that search; the saved tab is left alone. While
  // searching every tab stays clickable so it can pin the search; otherwise the shown tab is inert.
  const setSecondaryView = (view: string) => {
    const normalizedView = getTaskSecondaryViewForPrimaryView(primaryView.value, view);
    emit('pin-status', normalizedView);
    if (props.isSearchActive) return;
    if (preferencesStore.getTaskSecondaryView === normalizedView) return;
    preferencesStore.setTaskSecondaryView(normalizedView);
  };
  // Map selection
  const mapOptions = computed(() => {
    const counts = mapTaskCounts.value;
    return maps.value.map((map) => {
      const count = counts[map.id] ?? 0;
      return {
        label: map.name,
        value: map.id,
        count,
        countClass: count > 0 ? 'bg-pve-500' : 'bg-surface-600',
      };
    });
  });
  const onMapSelect = (selected: { label: string; value: string }) => {
    if (selected?.value && preferencesStore.getTaskMapView !== selected.value) {
      preferencesStore.setTaskMapView(selected.value);
    }
  };
  watch(
    [isTraderView, traders, () => preferencesStore.getTaskTraderView],
    ([showsTrader, visibleTraders, selectedTrader]) => {
      if (!showsTrader) return;
      if (visibleTraders.some((trader) => trader.id === selectedTrader)) return;
      ensureSelectedTrader(visibleTraders);
    },
    { immediate: true }
  );
  // The maps route always shows one map; land on the first when none is picked yet.
  watch(
    [primaryView, maps, () => preferencesStore.getTaskMapView],
    ([view, availableMaps, selectedMap]) => {
      if (view !== 'maps') return;
      if (availableMaps.some((map) => map.id === selectedMap)) return;
      ensureSelectedMap(availableMaps);
    },
    { immediate: true }
  );
  watch(
    [secondaryView, visibleStatusViews],
    ([selectedStatusView, statusViews]) => {
      if (statusViewVisibility.value[selectedStatusView]) return;
      preferencesStore.setTaskSecondaryView(statusViews[0] ?? 'all');
    },
    { immediate: true }
  );
</script>
