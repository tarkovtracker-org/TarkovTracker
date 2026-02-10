<template>
  <div class="mb-6 space-y-3">
    <div
      class="bg-surface-900 flex flex-wrap items-center gap-3 rounded-lg border border-white/12 px-3 py-3 shadow-sm sm:px-4"
    >
      <div class="w-full sm:w-56 sm:max-w-64 lg:max-w-72">
        <UInput
          :model-value="searchQuery"
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
          :aria-label="t('page.tasks.primary_views.all')"
          :aria-pressed="primaryView === 'all'"
          :class="primaryView === 'all' ? 'bg-white/10 text-white' : 'text-surface-200'"
          @click="setPrimaryView('all')"
        >
          <UIcon name="i-mdi-checkbox-multiple-marked" class="h-4 w-4 sm:mr-1.5" />
          <span class="hidden text-xs sm:inline">
            {{ t('page.tasks.primary_views.all').toUpperCase() }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-label="t('page.tasks.primary_views.traders')"
          :aria-pressed="primaryView === 'traders'"
          :class="primaryView === 'traders' ? 'bg-white/10 text-white' : 'text-surface-200'"
          @click="setPrimaryView('traders')"
        >
          <UIcon name="i-mdi-account-group" class="h-4 w-4 sm:mr-1.5" />
          <span class="hidden text-xs sm:inline">
            {{ t('page.tasks.primary_views.traders').toUpperCase() }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-label="t('page.tasks.primary_views.maps')"
          :aria-pressed="primaryView === 'maps'"
          :class="primaryView === 'maps' ? 'bg-white/10 text-white' : 'text-surface-200'"
          @click="setPrimaryView('maps')"
        >
          <UIcon name="i-mdi-map" class="h-4 w-4 sm:mr-1.5" />
          <span class="hidden text-xs sm:inline">
            {{ t('page.tasks.primary_views.maps').toUpperCase() }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-label="t('page.tasks.primary_views.graph')"
          :aria-pressed="primaryView === 'graph'"
          :class="primaryView === 'graph' ? 'bg-white/10 text-white' : 'text-surface-200'"
          class="hidden lg:inline-flex"
          @click="setPrimaryView('graph')"
        >
          <UIcon name="i-mdi-graph-outline" class="h-4 w-4 sm:mr-1.5" />
          <span class="hidden text-xs sm:inline">
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
        class="scrollbar-none bg-surface-900 flex items-center gap-3 overflow-x-auto rounded-lg border border-white/12 px-3 py-3 shadow-sm [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:justify-center sm:overflow-x-visible sm:px-4"
      >
        <div class="flex shrink-0 items-center gap-1">
          <UButton
            v-if="preferencesStore.getShowAllFilter"
            variant="ghost"
            color="neutral"
            size="sm"
            :aria-pressed="secondaryView === 'all'"
            :class="secondaryView === 'all' ? 'bg-white/10 text-white' : 'text-surface-400'"
            @click="setSecondaryView('all')"
          >
            <UIcon name="i-mdi-format-list-bulleted" class="hidden h-4 w-4 sm:mr-1 sm:block" />
            <span class="text-xs sm:text-sm">
              {{ t('page.tasks.primary_views.all').toUpperCase() }}
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
            v-if="preferencesStore.getShowAvailableFilter"
            variant="ghost"
            color="neutral"
            size="sm"
            :aria-pressed="secondaryView === 'available'"
            :class="secondaryView === 'available' ? 'bg-white/10 text-white' : 'text-surface-400'"
            @click="setSecondaryView('available')"
          >
            <UIcon name="i-mdi-clipboard-text" class="hidden h-4 w-4 sm:mr-1 sm:block" />
            <span class="text-xs sm:text-sm">
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
            v-if="preferencesStore.getShowLockedFilter"
            variant="ghost"
            color="neutral"
            size="sm"
            :aria-pressed="secondaryView === 'locked'"
            :class="secondaryView === 'locked' ? 'bg-white/10 text-white' : 'text-surface-400'"
            @click="setSecondaryView('locked')"
          >
            <UIcon name="i-mdi-lock" class="hidden h-4 w-4 sm:mr-1 sm:block" />
            <span class="text-xs sm:text-sm">
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
            v-if="preferencesStore.getShowCompletedFilter && statusCounts.completed > 0"
            variant="ghost"
            color="neutral"
            size="sm"
            :aria-pressed="secondaryView === 'completed'"
            :class="secondaryView === 'completed' ? 'bg-white/10 text-white' : 'text-surface-400'"
            @click="setSecondaryView('completed')"
          >
            <UIcon name="i-mdi-check-circle" class="hidden h-4 w-4 sm:mr-1 sm:block" />
            <span class="text-xs sm:text-sm">
              {{ t('page.tasks.secondary_views.completed').toUpperCase() }}
            </span>
            <span
              class="bg-success-500 ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
            >
              {{ displayStatusCounts.completed }}
            </span>
          </UButton>
          <UButton
            v-if="preferencesStore.getShowFailedFilter && statusCounts.failed > 0"
            variant="ghost"
            color="neutral"
            size="sm"
            :aria-pressed="secondaryView === 'failed'"
            :class="secondaryView === 'failed' ? 'bg-white/10 text-white' : 'text-surface-400'"
            @click="setSecondaryView('failed')"
          >
            <UIcon name="i-mdi-close-circle" class="hidden h-4 w-4 sm:mr-1 sm:block" />
            <span class="text-xs sm:text-sm">
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
            :aria-pressed="preferencesStore.getTaskUserView === 'self'"
            :class="
              preferencesStore.getTaskUserView === 'self'
                ? 'bg-white/10 text-white'
                : 'text-surface-400'
            "
            @click="onUserViewSelect({ label: currentUserDisplayName, value: 'self' })"
          >
            <UIcon name="i-mdi-account-circle" class="h-4 w-4 sm:mr-1" />
            <span class="hidden text-xs sm:inline sm:text-sm">
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
              :aria-pressed="preferencesStore.getTaskUserView === teamId"
              :class="[
                preferencesStore.getTaskUserView === teamId
                  ? 'bg-white/10 text-white'
                  : 'text-surface-400',
                isTeammateHidden(teamId) ? 'opacity-50' : '',
              ]"
              @click="onUserViewSelect({ label: getTeammateDisplayName(teamId), value: teamId })"
            >
              <UIcon name="i-mdi-account" class="h-4 w-4 sm:mr-1" />
              <span class="text-xs sm:text-sm">
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
            :aria-pressed="preferencesStore.getTaskUserView === 'all'"
            :class="
              preferencesStore.getTaskUserView === 'all'
                ? 'bg-white/10 text-white'
                : 'text-surface-400'
            "
            @click="onUserViewSelect({ label: t('page.tasks.user_views.all'), value: 'all' })"
          >
            <UIcon name="i-mdi-account-multiple" class="h-4 w-4 sm:mr-1" />
            <span class="text-xs sm:text-sm">
              {{ t('page.tasks.user_views.all').toUpperCase() }}
            </span>
          </UButton>
        </div>
      </div>
      <div
        v-if="primaryView === 'maps' && maps.length > 0"
        class="scrollbar-none w-full overflow-x-auto [-webkit-overflow-scrolling:touch]"
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
            :aria-pressed="preferencesStore.getTaskMapView === mapOption.value"
            :class="[
              'gap-1.5 transition-colors',
              'hover:bg-white/5',
              preferencesStore.getTaskMapView === mapOption.value
                ? 'bg-white/10 text-white'
                : 'text-surface-400 hover:text-white',
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
        class="scrollbar-none w-full overflow-x-auto [-webkit-overflow-scrolling:touch]"
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
            :aria-pressed="preferencesStore.getTaskTraderView === trader.id"
            :class="[
              'gap-2 transition-colors',
              'hover:bg-white/5',
              preferencesStore.getTaskTraderView === trader.id
                ? 'bg-white/10 text-white'
                : 'text-surface-400 hover:text-white',
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
  import { useTaskFiltering } from '@/composables/useTaskFiltering';
  import { useTaskSettingsDrawer } from '@/composables/useTaskSettingsDrawer';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTeamStore } from '@/stores/useTeamStore';
  import { TASK_SORT_MODES } from '@/types/taskSort';
  import { normalizeSecondaryView, normalizeSortMode } from '@/utils/taskFilterNormalization';
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
  const { isOpen: isDrawerOpen, toggle: toggleDrawer } = useTaskSettingsDrawer();
  const { calculateMapTaskTotals, calculateStatusCounts, calculateTraderCounts } =
    useTaskFiltering();
  const maps = computed(() => metadataStore.mapsWithSvg);
  const traderCounts = computed(() => {
    const userView = preferencesStore.getTaskUserView;
    const secondaryView = normalizeSecondaryView(preferencesStore.getTaskSecondaryView);
    return calculateTraderCounts(userView, secondaryView);
  });
  const traders = computed(() => {
    return metadataStore.sortedTraders.filter((trader) => (traderCounts.value[trader.id] ?? 0) > 0);
  });
  // Get current user's display name
  const currentUserDisplayName = computed(() => {
    return progressStore.getDisplayName('self');
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
      preferencesStore.getShowAllFilter &&
      (preferencesStore.getShowAvailableFilter ||
        preferencesStore.getShowLockedFilter ||
        preferencesStore.getShowCompletedFilter ||
        preferencesStore.getShowFailedFilter)
    );
  });
  // Helper to get teammate display name
  const getTeammateDisplayName = (teamId: string): string => {
    return progressStore.getDisplayName(teamId);
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
  const primaryView = computed(() => preferencesStore.getTaskPrimaryView);
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
  const secondaryView = computed(() =>
    normalizeSecondaryView(preferencesStore.getTaskSecondaryView)
  );
  const setSecondaryView = (view: string) => {
    const normalizedView = normalizeSecondaryView(view);
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
    if (selected?.value) {
      preferencesStore.setTaskMapView(selected.value);
    }
  };
  // Trader selection
  const onTraderSelect = (selected: { label: string; value: string }) => {
    if (selected?.value) {
      preferencesStore.setTaskTraderView(selected.value);
    }
  };
  // User view selection (yourself / all team members)
  const onUserViewSelect = (selected: { label: string; value: string }) => {
    if (selected?.value) {
      const selectedUserView = selected.value;
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
</script>
