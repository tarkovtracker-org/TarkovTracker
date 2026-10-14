<template>
  <div class="mb-6 space-y-3">
    <div
      class="bg-surface-900 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-white/12 px-3 py-2.5 shadow-sm sm:px-4"
    >
      <div
        class="flex max-w-full min-w-0 flex-1 scrollbar-none items-center gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch] sm:flex-none"
      >
        <UButton
          v-if="showAllStatusButton"
          variant="ghost"
          color="neutral"
          size="sm"
          class="leading-none"
          :disabled="isStatusApplied('all')"
          :aria-pressed="selectedStatusView === 'all'"
          :class="getStatusButtonClass('all', selectedStatusView === 'all')"
          @click="setSecondaryView('all')"
        >
          <UIcon
            name="i-mdi-format-list-bulleted"
            class="hidden h-4 w-4 shrink-0 2xl:mr-1 2xl:block"
          />
          <span class="text-xs leading-none uppercase 2xl:text-sm">
            {{ t('common.all', 'All') }}
          </span>
          <span
            class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
            :class="
              displayStatusCounts.all > 0
                ? 'bg-surface-500'
                : 'bg-surface-600 light:text-surface-50'
            "
          >
            {{ displayStatusCounts.all }}
          </span>
        </UButton>
        <span
          v-if="showStatusAllDivider"
          aria-hidden="true"
          class="bg-surface-700/60 h-6 w-px self-center"
        ></span>
        <UButton
          v-if="!isGraphView && preferencesStore.getShowAvailableFilter"
          variant="ghost"
          color="neutral"
          size="sm"
          class="leading-none"
          :disabled="isStatusApplied('available')"
          :aria-pressed="selectedStatusView === 'available'"
          :class="getStatusButtonClass('available', selectedStatusView === 'available')"
          @click="setSecondaryView('available')"
        >
          <UIcon name="i-mdi-clipboard-text" class="hidden h-4 w-4 shrink-0 2xl:mr-1 2xl:block" />
          <span class="text-xs leading-none uppercase 2xl:text-sm">
            {{ t('common.available') }}
          </span>
          <span
            class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
            :class="
              displayStatusCounts.available > 0
                ? 'bg-info-500'
                : 'bg-surface-600 light:text-surface-50'
            "
          >
            {{ displayStatusCounts.available }}
          </span>
        </UButton>
        <UButton
          v-if="!isGraphView && preferencesStore.getShowLockedFilter"
          variant="ghost"
          color="neutral"
          size="sm"
          class="leading-none"
          :disabled="isStatusApplied('locked')"
          :aria-pressed="selectedStatusView === 'locked'"
          :class="getStatusButtonClass('locked', selectedStatusView === 'locked')"
          @click="setSecondaryView('locked')"
        >
          <UIcon name="i-mdi-lock" class="hidden h-4 w-4 shrink-0 2xl:mr-1 2xl:block" />
          <span class="text-xs leading-none uppercase 2xl:text-sm">
            {{ t('common.locked') }}
          </span>
          <span
            class="light:text-surface-50 ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
            :class="displayStatusCounts.locked > 0 ? 'bg-surface-600' : 'bg-surface-700'"
          >
            {{ displayStatusCounts.locked }}
          </span>
        </UButton>
        <UButton
          v-if="showCompletedFilterButton"
          variant="ghost"
          color="neutral"
          size="sm"
          class="leading-none"
          :disabled="isStatusApplied('completed')"
          :aria-pressed="selectedStatusView === 'completed'"
          :class="getStatusButtonClass('completed', selectedStatusView === 'completed')"
          @click="setSecondaryView('completed')"
        >
          <UIcon name="i-mdi-check-circle" class="hidden h-4 w-4 shrink-0 2xl:mr-1 2xl:block" />
          <span class="text-xs leading-none uppercase 2xl:text-sm">
            {{ t('common.completed') }}
          </span>
          <span
            class="bg-success-500 light:bg-success-100 light:text-surface-50 ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
          >
            {{ displayStatusCounts.completed }}
          </span>
        </UButton>
        <UButton
          v-if="showFailedFilterButton"
          variant="ghost"
          color="neutral"
          size="sm"
          class="leading-none"
          :disabled="isStatusApplied('failed')"
          :aria-pressed="selectedStatusView === 'failed'"
          :class="getStatusButtonClass('failed', selectedStatusView === 'failed')"
          @click="setSecondaryView('failed')"
        >
          <UIcon name="i-mdi-close-circle" class="hidden h-4 w-4 shrink-0 2xl:mr-1 2xl:block" />
          <span class="text-xs leading-none uppercase 2xl:text-sm">
            {{ t('common.failed') }}
          </span>
          <span
            class="bg-error-500 ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
          >
            {{ displayStatusCounts.failed }}
          </span>
        </UButton>
      </div>
      <div
        class="ml-auto flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0 sm:flex-wrap"
      >
        <TaskTeamFilter />
        <SelectMenuFixed
          v-model="taskSortMode"
          :items="sortOptions"
          value-key="value"
          size="sm"
          class="min-w-0 flex-1 sm:w-32 sm:flex-none 2xl:w-44"
          :aria-label="t('page.tasks.sort.aria_label')"
        >
          <template #leading>
            <UIcon :name="currentSortIcon" class="h-4 w-4" />
          </template>
          <template #item="{ item }">
            <div class="flex items-center gap-2">
              <UIcon :name="item.icon" class="h-4 w-4" />
              <span>{{ item.label }}</span>
            </div>
          </template>
        </SelectMenuFixed>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :icon="sortDirectionIcon"
          :aria-label="sortDirectionLabel"
          @click="toggleSortDirection"
        />
        <AppTooltip :text="t('page.tasks.settings.title')">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-mdi-cog"
            :aria-label="t('page.tasks.settings.title')"
            :aria-pressed="isDrawerOpen"
            :class="
              isDrawerOpen
                ? 'light:bg-surface-700/70 light:text-surface-50 bg-white/10 text-white'
                : 'text-surface-400'
            "
            @click="toggleDrawer"
          />
        </AppTooltip>
      </div>
    </div>
    <div
      v-if="primaryView === 'maps' && maps.length > 0"
      class="w-full scrollbar-thin overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
    >
      <div
        class="bg-surface-900 flex w-max min-w-full justify-center gap-1 rounded-lg border border-white/12 px-3 py-3 shadow-sm sm:px-4"
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
            ...getSegmentButtonClass(preferencesStore.getTaskMapView === mapOption.value),
          ]"
          @click="onMapSelect(mapOption)"
        >
          <span class="text-xs font-medium whitespace-nowrap">{{ mapOption.label }}</span>
          <span
            :class="[
              'light:text-surface-50 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white',
              (mapOption.count ?? 0) > 0 ? 'bg-pve-500' : 'bg-surface-600',
            ]"
          >
            {{ mapOption.count ?? 0 }}
          </span>
        </UButton>
      </div>
    </div>
    <div
      v-if="isTraderView && traders.length > 0"
      class="w-full scrollbar-thin overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
    >
      <div
        class="bg-surface-900 flex w-max min-w-full justify-center gap-1 rounded-lg border border-white/12 px-3 py-3 shadow-sm sm:px-4"
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
            ...getSegmentButtonClass(preferencesStore.getTaskTraderView === trader.id),
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
  import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
  import { useTaskFiltering } from '@/composables/useTaskFiltering';
  import TaskTeamFilter from '@/features/tasks/TaskTeamFilter.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { TASK_SORT_MODES } from '@/types/taskSort';
  import {
    getTaskSecondaryViewForPrimaryView,
    normalizeSecondaryView,
    normalizeSortMode,
  } from '@/utils/taskFilterNormalization';
  import type { TaskStatusCounts } from '@/features/tasks/composables/useTaskFilters';
  import type { TaskSecondaryView } from '@/types/taskFilter';
  import type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
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
  const { isOpen: isDrawerOpen, toggle: toggleDrawer } = usePageSettingsDrawer('tasks');
  const { calculateMapTaskTotals, calculateStatusCounts, calculateTraderCounts } =
    useTaskFiltering();
  const primaryView = computed(() => preferencesStore.getTaskPrimaryView);
  const isGraphView = computed(() => primaryView.value === 'graph');
  const maps = computed(() => metadataStore.mapsWithSvg);
  const secondaryView = computed(() =>
    getTaskSecondaryViewForPrimaryView(primaryView.value, preferencesStore.getTaskSecondaryView)
  );
  const selectedStatusView = computed(() => props.activeStatusView ?? secondaryView.value);
  // While searching every tab stays clickable so it can pin the search; otherwise the shown tab is inert.
  const isStatusApplied = (view: TaskSecondaryView) =>
    !props.isSearchActive && selectedStatusView.value === view;
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
  const showStatusAllDivider = computed(() => {
    return (
      showAllStatusButton.value &&
      !isGraphView.value &&
      (preferencesStore.getShowAvailableFilter ||
        preferencesStore.getShowLockedFilter ||
        preferencesStore.getShowCompletedFilter ||
        preferencesStore.getShowFailedFilter)
    );
  });
  const showAllStatusButton = computed(
    () => isGraphView.value || preferencesStore.getShowAllFilter
  );
  const showCompletedFilterButton = computed(() => {
    return !isGraphView.value && preferencesStore.getShowCompletedFilter;
  });
  const showFailedFilterButton = computed(() => {
    return !isGraphView.value && preferencesStore.getShowFailedFilter;
  });
  type StatusToggleView = 'all' | 'available' | 'locked' | 'completed' | 'failed';
  const statusViewVisibility = computed<Record<StatusToggleView, boolean>>(() => ({
    all: showAllStatusButton.value,
    available: !isGraphView.value && preferencesStore.getShowAvailableFilter,
    locked: !isGraphView.value && preferencesStore.getShowLockedFilter,
    completed: showCompletedFilterButton.value,
    failed: showFailedFilterButton.value,
  }));
  const visibleStatusViews = computed<TaskSecondaryView[]>(() => {
    return (['all', 'available', 'locked', 'completed', 'failed'] as const).filter(
      (view) => statusViewVisibility.value[view]
    );
  });
  const toggleButtonBaseClass =
    'border border-transparent font-medium transition-colors duration-150 disabled:cursor-default disabled:opacity-100';
  const secondaryToggleInactiveClass =
    'text-surface-400 hover:border-white/10 hover:bg-white/5 hover:text-white light:hover:text-surface-50';
  const selectedToggleClass =
    'border-primary-500/45 bg-primary-500/12 text-white ring-1 ring-primary-500/25 light:text-primary-700';
  const neutralSelectedToggleClass =
    'border-white/15 bg-white/10 text-white ring-1 ring-white/10 light:border-surface-600 light:bg-surface-700/60 light:text-surface-50 light:ring-surface-600/40';
  const statusToggleSelectedClasses: Record<StatusToggleView, string> = {
    all: selectedToggleClass,
    available:
      'border-info-500/45 bg-info-500/12 text-white ring-1 ring-info-500/25 light:text-info-700',
    locked: neutralSelectedToggleClass,
    completed:
      'border-success-500/45 bg-success-500/12 text-white ring-1 ring-success-500/25 light:text-success-700',
    failed:
      'border-error-500/45 bg-error-500/12 text-white ring-1 ring-error-500/25 light:text-error-700',
  };
  const getStatusButtonClass = (view: StatusToggleView, isActive: boolean): string[] => {
    return [
      toggleButtonBaseClass,
      isActive ? statusToggleSelectedClasses[view] : secondaryToggleInactiveClass,
    ];
  };
  const getSegmentButtonClass = (isActive: boolean): string[] => {
    return [toggleButtonBaseClass, isActive ? selectedToggleClass : secondaryToggleInactiveClass];
  };
  // Calculate task counts for badges
  const statusCounts = computed(() => {
    const userView = preferencesStore.getTaskUserView;
    return calculateStatusCounts(userView);
  });
  const displayStatusCounts = computed(() => props.searchStatusCounts ?? statusCounts.value);
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
  const sortDirectionIcon = computed(() =>
    taskSortDirection.value === 'asc' ? 'i-mdi-sort-ascending' : 'i-mdi-sort-descending'
  );
  const sortDirectionLabel = computed(() =>
    taskSortDirection.value === 'asc'
      ? t('page.tasks.sort.ascending')
      : t('page.tasks.sort.descending')
  );
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
  // A tab picked during a search only narrows that search; the saved tab is left alone.
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
    return maps.value.map((map) => ({
      label: map.name,
      value: map.id,
      count: counts[map.id] ?? 0,
    }));
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
