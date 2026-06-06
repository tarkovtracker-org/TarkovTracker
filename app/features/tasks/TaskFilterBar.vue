<template>
  <div class="mb-6 space-y-3">
    <div
      class="bg-surface-900 flex flex-wrap items-center gap-3 rounded-lg border border-white/12 px-3 py-3 shadow-sm sm:px-4"
    >
      <div class="w-full sm:w-56 sm:max-w-64 lg:max-w-72">
        <UInput
          id="task-search"
          :model-value="searchQuery"
          name="task-search"
          :placeholder="t('page.tasks.search.placeholder')"
          :aria-label="t('page.tasks.search.aria_label')"
          icon="i-mdi-magnify"
          size="sm"
          :ui="{ trailing: 'pe-1' }"
          class="w-full"
          @update:model-value="$emit('update:searchQuery', $event)"
        >
          <template v-if="searchQuery?.length" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="xs"
              icon="i-mdi-close-circle"
              :aria-label="t('page.tasks.search.clear')"
              @click="$emit('update:searchQuery', '')"
            />
          </template>
        </UInput>
      </div>
      <div class="flex flex-1 items-center justify-center gap-1">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          class="leading-none"
          :disabled="primaryView === 'all'"
          :aria-label="t('page.tasks.primary_views.list')"
          :aria-pressed="primaryView === 'all'"
          :class="getPrimaryViewButtonClass(primaryView === 'all')"
          @click="setPrimaryView('all')"
        >
          <UIcon name="i-mdi-checkbox-multiple-marked" class="h-4 w-4 shrink-0 sm:mr-1.5" />
          <span class="hidden text-xs leading-none sm:inline">
            {{ t('page.tasks.primary_views.list').toUpperCase() }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          class="leading-none"
          :disabled="primaryView === 'traders'"
          :aria-label="t('page.tasks.primary_views.traders')"
          :aria-pressed="primaryView === 'traders'"
          :class="getPrimaryViewButtonClass(primaryView === 'traders')"
          @click="setPrimaryView('traders')"
        >
          <UIcon name="i-mdi-account-group" class="h-4 w-4 shrink-0 sm:mr-1.5" />
          <span class="hidden text-xs leading-none sm:inline">
            {{ t('page.tasks.primary_views.traders').toUpperCase() }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          class="leading-none"
          :disabled="primaryView === 'maps'"
          :aria-label="t('page.tasks.primary_views.maps')"
          :aria-pressed="primaryView === 'maps'"
          :class="getPrimaryViewButtonClass(primaryView === 'maps')"
          @click="setPrimaryView('maps')"
        >
          <UIcon name="i-mdi-map" class="h-4 w-4 shrink-0 sm:mr-1.5" />
          <span class="hidden text-xs leading-none sm:inline">
            {{ t('page.tasks.primary_views.maps').toUpperCase() }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          class="hidden leading-none lg:inline-flex"
          :disabled="primaryView === 'graph'"
          :aria-label="t('page.tasks.primary_views.graph')"
          :aria-pressed="primaryView === 'graph'"
          :class="getPrimaryViewButtonClass(primaryView === 'graph')"
          @click="setPrimaryView('graph')"
        >
          <UIcon name="i-mdi-graph-outline" class="h-4 w-4 shrink-0 sm:mr-1.5" />
          <span class="hidden text-xs leading-none sm:inline">
            {{ t('page.tasks.primary_views.graph').toUpperCase() }}
          </span>
        </UButton>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <SelectMenuFixed
          v-model="taskSortMode"
          :items="sortOptions"
          value-key="value"
          size="sm"
          class="w-28 sm:w-44"
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
            :class="isDrawerOpen ? 'bg-white/10 text-white' : 'text-surface-400'"
            @click="toggleDrawer"
          />
        </AppTooltip>
      </div>
    </div>
    <div class="space-y-3">
      <div
        class="bg-surface-900 flex scrollbar-none items-center gap-3 overflow-x-auto rounded-lg border border-white/12 px-3 py-3 shadow-sm [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:justify-center sm:overflow-x-visible sm:px-4"
      >
        <div class="flex shrink-0 items-center gap-1">
          <UButton
            v-if="showAllStatusButton"
            variant="ghost"
            color="neutral"
            size="sm"
            class="leading-none"
            :disabled="secondaryView === 'all'"
            :aria-pressed="secondaryView === 'all'"
            :class="getStatusButtonClass('all', secondaryView === 'all')"
            @click="setSecondaryView('all')"
          >
            <UIcon
              name="i-mdi-format-list-bulleted"
              class="hidden h-4 w-4 shrink-0 sm:mr-1 sm:block"
            />
            <span class="text-xs leading-none sm:text-sm">
              {{ t('page.tasks.secondary_views.all', 'All').toUpperCase() }}
            </span>
            <span
              class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
              :class="displayStatusCounts.all > 0 ? 'bg-surface-500' : 'bg-surface-600'"
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
            :disabled="secondaryView === 'available'"
            :aria-pressed="secondaryView === 'available'"
            :class="getStatusButtonClass('available', secondaryView === 'available')"
            @click="setSecondaryView('available')"
          >
            <UIcon name="i-mdi-clipboard-text" class="hidden h-4 w-4 shrink-0 sm:mr-1 sm:block" />
            <span class="text-xs leading-none sm:text-sm">
              {{ t('page.tasks.secondary_views.available').toUpperCase() }}
            </span>
            <span
              class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
              :class="displayStatusCounts.available > 0 ? 'bg-info-500' : 'bg-surface-600'"
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
            :disabled="secondaryView === 'locked'"
            :aria-pressed="secondaryView === 'locked'"
            :class="getStatusButtonClass('locked', secondaryView === 'locked')"
            @click="setSecondaryView('locked')"
          >
            <UIcon name="i-mdi-lock" class="hidden h-4 w-4 shrink-0 sm:mr-1 sm:block" />
            <span class="text-xs leading-none sm:text-sm">
              {{ t('page.tasks.secondary_views.locked').toUpperCase() }}
            </span>
            <span
              class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
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
            :disabled="secondaryView === 'completed'"
            :aria-pressed="secondaryView === 'completed'"
            :class="getStatusButtonClass('completed', secondaryView === 'completed')"
            @click="setSecondaryView('completed')"
          >
            <UIcon name="i-mdi-check-circle" class="hidden h-4 w-4 shrink-0 sm:mr-1 sm:block" />
            <span class="text-xs leading-none sm:text-sm">
              {{ t('page.tasks.secondary_views.completed').toUpperCase() }}
            </span>
            <span
              class="bg-success-500 ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
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
            :disabled="secondaryView === 'failed'"
            :aria-pressed="secondaryView === 'failed'"
            :class="getStatusButtonClass('failed', secondaryView === 'failed')"
            @click="setSecondaryView('failed')"
          >
            <UIcon name="i-mdi-close-circle" class="hidden h-4 w-4 shrink-0 sm:mr-1 sm:block" />
            <span class="text-xs leading-none sm:text-sm">
              {{ t('page.tasks.secondary_views.failed').toUpperCase() }}
            </span>
            <span
              class="bg-error-500 ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
            >
              {{ displayStatusCounts.failed }}
            </span>
          </UButton>
        </div>
        <div class="hidden h-6 w-px shrink-0 bg-white/20 sm:block" />
        <div class="flex shrink-0 items-center gap-1">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            class="leading-none"
            :disabled="preferencesStore.getTaskUserView === 'self'"
            :aria-pressed="preferencesStore.getTaskUserView === 'self'"
            :class="getSegmentButtonClass(preferencesStore.getTaskUserView === 'self')"
            @click="onUserViewSelect({ label: currentUserDisplayName, value: 'self' })"
          >
            <UIcon name="i-mdi-account-circle" class="h-4 w-4 shrink-0 sm:mr-1" />
            <span class="hidden text-xs leading-none sm:inline sm:text-sm">
              {{ currentUserDisplayName.toUpperCase() }}
            </span>
            <UBadge size="sm" color="primary" variant="solid" class="ml-1">
              {{ t('page.tasks.user_views.yourself').toUpperCase() }}
            </UBadge>
          </UButton>
          <template v-for="teamId in teammates" :key="teamId">
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              class="leading-none"
              :disabled="preferencesStore.getTaskUserView === teamId"
              :aria-pressed="preferencesStore.getTaskUserView === teamId"
              :class="
                getSegmentButtonClass(
                  preferencesStore.getTaskUserView === teamId,
                  isTeammateHidden(teamId)
                )
              "
              @click="onUserViewSelect({ label: getTeammateDisplayName(teamId), value: teamId })"
            >
              <UIcon name="i-mdi-account" class="h-4 w-4 shrink-0 sm:mr-1" />
              <span class="text-xs leading-none sm:text-sm">
                {{ getTeammateDisplayName(teamId).toUpperCase() }}
              </span>
            </UButton>
            <UButton
              variant="ghost"
              size="sm"
              :color="isTeammateHidden(teamId) ? 'error' : 'success'"
              :icon="isTeammateHidden(teamId) ? 'i-mdi-eye-off' : 'i-mdi-eye'"
              :disabled="preferencesStore.taskTeamAllHidden"
              :aria-label="getTeammateVisibilityLabel(teamId)"
              :aria-pressed="!isTeammateHidden(teamId)"
              @click="toggleTeammateVisibility(teamId)"
            />
          </template>
          <UButton
            v-if="teammates.length > 0"
            variant="ghost"
            color="neutral"
            size="sm"
            class="leading-none"
            :disabled="preferencesStore.getTaskUserView === 'all'"
            :aria-pressed="preferencesStore.getTaskUserView === 'all'"
            :class="getSegmentButtonClass(preferencesStore.getTaskUserView === 'all')"
            @click="onUserViewSelect({ label: t('page.tasks.user_views.all'), value: 'all' })"
          >
            <UIcon name="i-mdi-account-multiple" class="h-4 w-4 shrink-0 sm:mr-1" />
            <span class="text-xs leading-none sm:text-sm">
              {{ t('page.tasks.user_views.all').toUpperCase() }}
            </span>
          </UButton>
        </div>
      </div>
      <div
        v-if="primaryView === 'maps' && maps.length > 0"
        class="w-full scrollbar-none overflow-x-auto [-webkit-overflow-scrolling:touch]"
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
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white',
                (mapOption.count ?? 0) > 0 ? 'bg-pve-500' : 'bg-surface-600',
              ]"
            >
              {{ mapOption.count ?? 0 }}
            </span>
          </UButton>
        </div>
      </div>
      <div
        v-if="(primaryView === 'traders' || primaryView === 'graph') && traders.length > 0"
        class="w-full scrollbar-none overflow-x-auto [-webkit-overflow-scrolling:touch]"
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
            @click="onTraderSelect({ label: trader.name, value: trader.id })"
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
                :class="[
                  'absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-bold text-white',
                  (traderCounts[trader.id] ?? 0) > 0 ? 'bg-pve-500' : 'bg-surface-600',
                ]"
              >
                {{ traderCounts[trader.id] ?? 0 }}
              </span>
            </div>
            <span class="text-xs font-medium whitespace-nowrap">{{ trader.name }}</span>
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
  import { useTaskFiltering } from '@/composables/useTaskFiltering';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTeamStore } from '@/stores/useTeamStore';
  import { TASK_SORT_MODES } from '@/types/taskSort';
  import {
    getTaskSecondaryViewForPrimaryView,
    normalizeSecondaryView,
    normalizeSortMode,
  } from '@/utils/taskFilterNormalization';
  import type { TaskSecondaryView } from '@/types/taskFilter';
  import type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
  const props = defineProps<{
    searchQuery: string;
    activeSearchCount?: number;
    isSearchActive?: boolean;
  }>();
  defineEmits<{
    'update:searchQuery': [value: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const metadataStore = useMetadataStore();
  const progressStore = useProgressStore();
  const teamStore = useTeamStore();
  const { hasInitiallyLoaded: hasSystemInitiallyLoaded, hasTeam } = useSystemStoreWithSupabase();
  const { isOpen: isDrawerOpen, toggle: toggleDrawer } = usePageSettingsDrawer('tasks');
  const { calculateMapTaskTotals, calculateStatusCounts, calculateTraderCounts } =
    useTaskFiltering();
  const primaryView = computed(() => preferencesStore.getTaskPrimaryView);
  const isGraphView = computed(() => primaryView.value === 'graph');
  const maps = computed(() => metadataStore.mapsWithSvg);
  const secondaryView = computed(() =>
    getTaskSecondaryViewForPrimaryView(primaryView.value, preferencesStore.getTaskSecondaryView)
  );
  const traderCounts = computed(() => {
    const userView = preferencesStore.getTaskUserView;
    return calculateTraderCounts(userView, secondaryView.value);
  });
  const traders = computed(() => {
    return metadataStore.sortedTraders.filter((trader) => (traderCounts.value[trader.id] ?? 0) > 0);
  });
  const currentUserDisplayName = computed(() => {
    return progressStore.getDisplayName('self') || t('page.tasks.user_views.yourself', 'You');
  });
  const teammates = computed(() => {
    return teamStore.teammates || [];
  });
  const canValidateSelectedTeammateView = computed(() => {
    if (teammates.value.length > 0) return true;
    if (teamStore.teamMembers.length > 0) return true;
    if (!hasSystemInitiallyLoaded.value) return false;
    return !hasTeam();
  });
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
  const primaryToggleInactiveClass =
    'text-surface-200 hover:border-white/10 hover:bg-white/5 hover:text-white';
  const secondaryToggleInactiveClass =
    'text-surface-400 hover:border-white/10 hover:bg-white/5 hover:text-white';
  const selectedToggleClass =
    'border-primary-500/45 bg-primary-500/12 text-white ring-1 ring-primary-500/25';
  const neutralSelectedToggleClass = 'border-white/15 bg-white/10 text-white ring-1 ring-white/10';
  const statusToggleSelectedClasses: Record<StatusToggleView, string> = {
    all: selectedToggleClass,
    available: 'border-info-500/45 bg-info-500/12 text-white ring-1 ring-info-500/25',
    locked: neutralSelectedToggleClass,
    completed: 'border-success-500/45 bg-success-500/12 text-white ring-1 ring-success-500/25',
    failed: 'border-error-500/45 bg-error-500/12 text-white ring-1 ring-error-500/25',
  };
  const getPrimaryViewButtonClass = (isActive: boolean): string[] => {
    return [toggleButtonBaseClass, isActive ? selectedToggleClass : primaryToggleInactiveClass];
  };
  const getStatusButtonClass = (view: StatusToggleView, isActive: boolean): string[] => {
    return [
      toggleButtonBaseClass,
      isActive ? statusToggleSelectedClasses[view] : secondaryToggleInactiveClass,
    ];
  };
  const getSegmentButtonClass = (isActive: boolean, isDimmed = false): string[] => {
    return [
      toggleButtonBaseClass,
      isActive ? selectedToggleClass : secondaryToggleInactiveClass,
      isDimmed ? 'opacity-50' : '',
    ];
  };
  const getTeammateDisplayName = (teamId: string): string => {
    return progressStore.getDisplayName(teamId) || teamId;
  };
  const isTeammateHidden = (teamId: string): boolean => {
    return preferencesStore.teamIsHidden(teamId);
  };
  const isTeammateIndividuallyHidden = (teamId: string): boolean => {
    return preferencesStore.teamHide?.[teamId] === true;
  };
  const getTeammateVisibilityLabel = (teamId: string): string => {
    const actionLabel = isTeammateHidden(teamId)
      ? t('settings.account_data.action_show')
      : t('settings.account_data.action_hide');
    return `${actionLabel} ${getTeammateDisplayName(teamId)}`;
  };
  const toggleTeammateVisibility = (teamId: string) => {
    if (preferencesStore.taskTeamAllHidden) {
      return;
    }
    const wasHidden = isTeammateHidden(teamId);
    preferencesStore.toggleHidden(teamId);
    if (!wasHidden && preferencesStore.getTaskUserView === teamId) {
      preferencesStore.setTaskUserView('all');
    }
  };
  // Calculate task counts for badges
  const statusCounts = computed(() => {
    const userView = preferencesStore.getTaskUserView;
    return calculateStatusCounts(userView);
  });
  const displayStatusCounts = computed(() => {
    if (!props.isSearchActive || props.activeSearchCount === undefined) {
      return statusCounts.value;
    }
    const activeView = secondaryView.value;
    return {
      ...statusCounts.value,
      [activeView]: props.activeSearchCount,
    };
  });
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
  // Primary view (all / maps / traders)
  const ensureSelectedTrader = (visibleTraders: Array<{ id: string }>) => {
    if (!visibleTraders.length) return;
    const hasSelectedTrader = visibleTraders.some(
      (trader) => trader.id === preferencesStore.getTaskTraderView
    );
    if (hasSelectedTrader) return;
    const firstTrader = visibleTraders[0];
    if (firstTrader?.id) {
      preferencesStore.setTaskTraderView(firstTrader.id);
    }
  };
  const setPrimaryView = (view: string) => {
    if (preferencesStore.getTaskPrimaryView === view) return;
    preferencesStore.setTaskPrimaryView(view);
    // When switching to maps, ensure a map is selected
    if (view === 'maps' && maps.value.length > 0 && preferencesStore.getTaskMapView === 'all') {
      const firstMap = maps.value[0];
      if (firstMap?.id) {
        preferencesStore.setTaskMapView(firstMap.id);
      }
    }
    if (view === 'traders' || view === 'graph') {
      ensureSelectedTrader(traders.value);
    }
  };
  // Secondary view (available / locked / completed)
  const setSecondaryView = (view: string) => {
    const normalizedView = getTaskSecondaryViewForPrimaryView(primaryView.value, view);
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
  // Trader selection
  const onTraderSelect = (selected: { label: string; value: string }) => {
    if (selected?.value && preferencesStore.getTaskTraderView !== selected.value) {
      preferencesStore.setTaskTraderView(selected.value);
    }
  };
  // User view selection (yourself / all team members)
  const onUserViewSelect = (selected: { label: string; value: string }) => {
    if (selected?.value) {
      const selectedUserView = selected.value;
      if (preferencesStore.getTaskUserView === selectedUserView) return;
      if (
        selectedUserView !== 'self' &&
        selectedUserView !== 'all' &&
        !preferencesStore.taskTeamAllHidden &&
        isTeammateIndividuallyHidden(selectedUserView)
      ) {
        preferencesStore.toggleHidden(selectedUserView);
      }
      preferencesStore.setTaskUserView(selectedUserView);
    }
  };
  watch(
    [() => preferencesStore.getTaskPrimaryView, traders, () => preferencesStore.getTaskTraderView],
    ([view, visibleTraders, selectedTrader]) => {
      if (view !== 'traders' && view !== 'graph') return;
      if (visibleTraders.some((trader) => trader.id === selectedTrader)) return;
      ensureSelectedTrader(visibleTraders);
    },
    { immediate: true }
  );
  watch(
    [() => preferencesStore.getTaskUserView, teammates, canValidateSelectedTeammateView],
    ([selectedUserView, currentTeammates, canValidate]) => {
      if (selectedUserView === 'self' || selectedUserView === 'all') return;
      if (!canValidate) return;
      if (!currentTeammates.includes(selectedUserView) || isTeammateHidden(selectedUserView)) {
        const canShowAllOption = currentTeammates.length > 0;
        preferencesStore.setTaskUserView(canShowAllOption ? 'all' : 'self');
      }
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
