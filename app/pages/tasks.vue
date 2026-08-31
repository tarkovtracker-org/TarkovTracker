<template>
  <div class="flex min-h-full overflow-x-hidden">
    <div class="min-w-0 flex-1 px-3 py-6 sm:px-6">
      <div class="mx-auto max-w-350">
        <TaskLoadingState v-if="isLoading" />
        <div v-else>
          <TaskFilterBar
            v-model:search-query="searchQuery"
            :active-search-count="activeSearchCount"
            :is-search-active="isSearchActive"
          />
          <TaskGraphView v-if="showGraphView" :allowed-task-ids="graphVisibleTaskIds" />
          <template v-else>
            <div v-if="showMapDisplay" ref="mapContainerRef" class="mb-6">
              <div class="bg-surface-800/50 rounded-lg p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
                    <h3 class="min-w-0 flex-1">
                      <button
                        type="button"
                        data-testid="map-panel-toggle"
                        :aria-expanded="isMapPanelExpanded"
                        aria-controls="tasks-map-panel-content"
                        class="group hover:bg-surface-700/40 focus-visible:ring-primary-500 focus-visible:ring-offset-surface-800 -m-1.5 flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        @click="toggleMapPanelVisibility"
                      >
                        <span
                          class="bg-primary-500/15 border-primary-500/25 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
                        >
                          <UIcon
                            name="i-mdi-map-marker-radius-outline"
                            class="text-primary-300 h-4.5 w-4.5"
                          />
                        </span>
                        <span
                          class="text-surface-100 truncate text-base leading-tight font-semibold"
                        >
                          {{ selectedMapData?.name || t('tasks.view.map') }}
                        </span>
                      </button>
                    </h3>
                    <AppTooltip
                      :text="t('page.tasks.map.raid_time_tooltip')"
                      :content="{ side: 'bottom' }"
                    >
                      <span
                        class="bg-surface-900/50 inline-flex items-center gap-1.5 rounded-full border border-white/8 px-2.5 py-1"
                      >
                        <template
                          v-for="(entry, index) in mapTimeEntries"
                          :key="`${entry.value}-${index}`"
                        >
                          <span v-if="index > 0" class="h-3 w-px bg-white/10" />
                          <span class="flex items-center gap-1 text-[11px]">
                            <UIcon
                              :name="entry.icon"
                              :class="['h-3.5 w-3.5 shrink-0', clockEntryIconClass(entry.period)]"
                            />
                            <span
                              class="tracking-wide uppercase"
                              :class="clockEntryLabelClass(entry.period)"
                            >
                              {{ getMapTimeLabel(entry.period) }}
                            </span>
                            <span class="tabular-nums" :class="clockEntryValueClass(entry.period)">
                              {{ entry.value }}
                            </span>
                          </span>
                        </template>
                      </span>
                    </AppTooltip>
                    <span v-if="!isMapPanelExpanded" class="text-surface-500 text-xs font-medium">
                      {{ t('page.tasks.map.map_hidden_hint') }}
                    </span>
                  </div>
                  <AppTooltip
                    :text="
                      isMapPanelExpanded
                        ? t('page.tasks.map.hide_map')
                        : t('page.tasks.map.show_map')
                    "
                  >
                    <UButton
                      data-testid="map-collapse-toggle"
                      :icon="isMapPanelExpanded ? 'i-mdi-chevron-up' : 'i-mdi-chevron-down'"
                      variant="ghost"
                      color="neutral"
                      size="sm"
                      :aria-expanded="isMapPanelExpanded"
                      aria-controls="tasks-map-panel-content"
                      :aria-label="
                        isMapPanelExpanded
                          ? t('page.tasks.map.hide_map')
                          : t('page.tasks.map.show_map')
                      "
                      class="h-8 w-8 shrink-0"
                      :ui="{ leadingIcon: 'transition-transform duration-200' }"
                      @click="toggleMapPanelVisibility"
                    />
                  </AppTooltip>
                </div>
                <Transition
                  enter-active-class="transition duration-150 ease-out"
                  enter-from-class="opacity-0 -translate-y-1"
                  enter-to-class="opacity-100 translate-y-0"
                  leave-active-class="transition duration-100 ease-in"
                  leave-from-class="opacity-100 translate-y-0"
                  leave-to-class="opacity-0 -translate-y-1"
                >
                  <div v-show="isMapPanelExpanded" id="tasks-map-panel-content">
                    <template v-if="selectedMapData">
                      <LeafletMapComponent
                        ref="leafletMapRef"
                        :map="selectedMapData"
                        :marks="mapObjectiveMarks"
                        :show-extracts="true"
                        :show-extract-toggle="true"
                        :show-legend="true"
                        :show-fullscreen-toggle="true"
                        :height="mapHeight"
                        @toggle-fullscreen="openMapFullscreen"
                      />
                      <AppTooltip
                        :text="t('maps.tooltips.drag_to_resize')"
                        :content="{ side: 'top' }"
                      >
                        <div
                          ref="resizeHandleRef"
                          role="separator"
                          aria-orientation="horizontal"
                          :aria-label="t('page.tasks.map.resize_handle')"
                          :aria-valuemin="mapHeightMin"
                          :aria-valuemax="mapHeightMax"
                          :aria-valuenow="mapHeight"
                          tabindex="0"
                          class="group hover:border-primary-500/40 focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 mt-3 flex h-3.5 w-full cursor-ns-resize touch-none items-center justify-center rounded-md border border-transparent transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                          :class="{ 'ring-primary-500 ring-1': isResizing }"
                          @pointerdown="startResize"
                          @keydown="onResizeKeydown"
                        >
                          <span
                            class="bg-surface-600 group-hover:bg-primary-400 h-1 w-8 rounded-full transition-colors"
                            :class="{ 'bg-primary-400': isResizing }"
                          />
                        </div>
                      </AppTooltip>
                    </template>
                    <UAlert
                      v-else
                      icon="i-mdi-alert-circle"
                      color="warning"
                      variant="soft"
                      :title="t('alerts.no_map_data')"
                    />
                    <MapRequiredItemsSummary
                      v-if="selectedMapData"
                      :map-id="selectedMapData.id"
                      :objective-visibility="mapObjectiveVisibility"
                      :tasks="filteredTasks"
                    />
                  </div>
                </Transition>
              </div>
            </div>
            <div v-if="filteredTasks.length === 0" class="py-6">
              <TaskEmptyState />
              <MapTaskVisibilityNotice
                v-if="showMapTaskVisibilityNotice"
                class="mt-4"
                :count="mapCompleteTasksCountOnMap"
                :is-hiding="getHideCompletedMapObjectives"
                @toggle="toggleMapTaskVisibilityFilter"
              />
            </div>
            <div v-else ref="taskListRef" data-testid="task-list">
              <div
                v-if="focusedTaskInSlice.length > 0"
                data-testid="focused-task-section"
                class="mb-6"
              >
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-2">
                    <UIcon name="i-mdi-crosshairs-gps" class="text-primary-400 h-4 w-4 shrink-0" />
                    <div class="min-w-0">
                      <h3 class="text-surface-100 text-sm font-medium">
                        {{ t('page.tasks.focused_task_section') }}
                      </h3>
                      <p class="text-surface-400 text-xs">
                        {{ t('page.tasks.focused_task_description') }}
                      </p>
                    </div>
                  </div>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="t('common.clear_focus')"
                    @click="clearPinnedTask"
                  >
                    {{ t('common.clear_focus') }}
                  </UButton>
                </div>
                <div>
                  <div v-for="task in focusedTaskInSlice" :key="`focused-${task.id}`" class="pb-4">
                    <TaskCard
                      :accent-variant="
                        shouldGroupGlobalTasks && isGlobalTask(task) ? 'global' : 'default'
                      "
                      :task="task"
                      @on-task-action="handleTaskAction"
                    />
                  </div>
                </div>
              </div>
              <div v-if="pinnedTasksInSlice.length > 0" class="mb-6">
                <div class="mb-3 flex items-center gap-2">
                  <div class="bg-surface-700 h-px flex-1" />
                  <div class="flex items-center gap-2">
                    <UIcon name="i-mdi-pin" class="text-primary-400 h-4 w-4" />
                    <h3 class="text-surface-200 text-sm font-medium">
                      {{ t('page.tasks.pinned_tasks_section') }}
                    </h3>
                  </div>
                  <div class="bg-surface-700 h-px flex-1" />
                </div>
                <div>
                  <div v-for="task in pinnedTasksInSlice" :key="`pinned-${task.id}`" class="pb-4">
                    <TaskCard
                      :accent-variant="
                        shouldGroupGlobalTasks && isGlobalTask(task) ? 'global' : 'default'
                      "
                      :task="task"
                      @on-task-action="handleTaskAction"
                    />
                  </div>
                </div>
              </div>
              <MapTaskVisibilityNotice
                v-if="
                  showMapTaskVisibilityNotice &&
                  (mapSpecificTasksInSlice.length > 0 ||
                    ((focusedTaskInSlice.length > 0 || pinnedTasksInSlice.length > 0) &&
                      globalTasksInSlice.length === 0 &&
                      mapSpecificTasksInSlice.length === 0 &&
                      mapCompleteTasksCountOnMap > 0))
                "
                class="mb-6"
                :count="mapCompleteTasksCountOnMap"
                :is-hiding="getHideCompletedMapObjectives"
                @toggle="toggleMapTaskVisibilityFilter"
              />
              <div>
                <div v-for="task in mapSpecificTasksInSlice" :key="`task-${task.id}`" class="pb-4">
                  <TaskCard :task="task" @on-task-action="handleTaskAction" />
                </div>
              </div>
              <div v-if="globalTasksInSlice.length > 0" class="mt-2 mb-6">
                <div class="mb-3 flex items-center gap-2">
                  <div class="bg-surface-700 h-px flex-1" />
                  <div class="flex items-center gap-2">
                    <UIcon name="i-mdi-earth" class="text-primary-400 h-4 w-4" />
                    <h3 class="text-surface-200 text-sm font-medium">
                      {{ t('page.tasks.global_tasks_section') }}
                    </h3>
                  </div>
                  <div class="bg-surface-700 h-px flex-1" />
                </div>
                <div>
                  <div v-for="task in globalTasksInSlice" :key="`global-${task.id}`" class="pb-4">
                    <TaskCard
                      accent-variant="global"
                      :task="task"
                      @on-task-action="handleTaskAction"
                    />
                  </div>
                </div>
              </div>
              <MapTaskVisibilityNotice
                v-if="
                  showMapTaskVisibilityNotice &&
                  mapSpecificTasksInSlice.length === 0 &&
                  globalTasksInSlice.length > 0
                "
                class="mb-6"
                :count="mapCompleteTasksCountOnMap"
                :is-hiding="getHideCompletedMapObjectives"
                @toggle="toggleMapTaskVisibilityFilter"
              />
              <div
                v-if="visibleTaskCount < filteredTasks.length"
                ref="loadMoreSentinel"
                class="flex items-center justify-center py-4"
              >
                <UIcon name="i-mdi-loading" class="text-surface-400 h-5 w-5 animate-spin" />
              </div>
            </div>
          </template>
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
      <div v-if="isDesktopSideRailOpen" class="hidden w-[26rem] shrink-0 px-4 py-6 lg:block">
        <PageHelpPanel v-if="isDesktopHelpPanelOpen" page-key="tasks" mode="docked" />
        <TaskSettingsDrawer v-else-if="isDesktopSettingsDrawerOpen" mode="docked" />
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
        <TaskSettingsDrawer v-if="isMobileSettingsDrawerOpen" mode="overlay" />
      </Transition>
    </Teleport>
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="translate-y-2 opacity-0 sm:translate-x-4 sm:translate-y-0"
        enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100 sm:translate-x-0"
        leave-to-class="translate-y-2 opacity-0 sm:translate-x-4 sm:translate-y-0"
      >
        <PageHelpPanel v-if="isMobileHelpPanelOpen" page-key="tasks" mode="overlay" />
      </Transition>
    </Teleport>
    <Teleport to="body">
      <Transition
        enter-active-class="transition ease-out duration-200"
        enter-from-class="opacity-0 translate-y-3"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition ease-in duration-200"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-3"
      >
        <div
          v-if="taskStatusUpdated"
          class="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
        >
          <UCard class="bg-surface-900/95 w-full max-w-xl border border-white/10 shadow-2xl">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span
                class="text-sm sm:text-base"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {{ taskStatus }}
              </span>
              <div class="flex flex-1 justify-end gap-2">
                <UButton
                  v-if="showUndoButton"
                  size="xs"
                  variant="soft"
                  color="primary"
                  @click="undoLastAction"
                >
                  {{ t('page.tasks.questcard.undo') }}
                </UButton>
                <UButton size="xs" variant="ghost" color="secondary" @click="closeNotification">
                  {{ t('common.close') }}
                </UButton>
              </div>
            </div>
          </UCard>
        </div>
      </Transition>
    </Teleport>
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <dialog
          v-if="isMapFullscreen"
          open
          data-testid="map-fullscreen-overlay"
          aria-modal="true"
          :aria-label="t('page.tasks.map.fullscreen_label')"
          class="bg-surface-950 text-surface-200 fixed inset-0 z-100 flex h-full max-h-none w-full max-w-none flex-col"
        >
          <div
            class="bg-surface-900 border-surface-800 flex items-center justify-between gap-3 border-b px-4 py-3"
          >
            <div class="flex min-w-0 items-center gap-2.5">
              <span
                class="bg-primary-500/15 border-primary-500/25 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
              >
                <UIcon
                  name="i-mdi-map-marker-radius-outline"
                  class="text-primary-300 h-4.5 w-4.5"
                />
              </span>
              <h3 class="text-surface-100 truncate text-base leading-tight font-semibold">
                {{ selectedMapData?.name || t('tasks.view.map') }}
              </h3>
              <span class="text-surface-500 hidden text-xs font-medium sm:inline">
                {{ t('page.tasks.map.fullscreen_label') }}
              </span>
              <AppTooltip
                :text="t('page.tasks.map.raid_time_tooltip')"
                :content="{ side: 'bottom' }"
              >
                <span
                  class="bg-surface-950/60 hidden items-center gap-1.5 rounded-full border border-white/8 px-2.5 py-1 md:inline-flex"
                >
                  <template
                    v-for="(entry, index) in mapTimeEntries"
                    :key="`fullscreen-${entry.value}-${index}`"
                  >
                    <span v-if="index > 0" class="h-3 w-px bg-white/10" />
                    <span class="flex items-center gap-1 text-[11px]">
                      <UIcon
                        :name="entry.icon"
                        :class="['h-3.5 w-3.5 shrink-0', clockEntryIconClass(entry.period)]"
                      />
                      <span
                        class="tracking-wide uppercase"
                        :class="clockEntryLabelClass(entry.period)"
                      >
                        {{ getMapTimeLabel(entry.period) }}
                      </span>
                      <span class="tabular-nums" :class="clockEntryValueClass(entry.period)">
                        {{ entry.value }}
                      </span>
                    </span>
                  </template>
                </span>
              </AppTooltip>
            </div>
            <AppTooltip :text="t('maps.tooltips.exit_fullscreen')">
              <UButton
                data-testid="map-fullscreen-exit"
                icon="i-mdi-fullscreen-exit"
                color="neutral"
                variant="soft"
                size="sm"
                class="h-8 w-8"
                :aria-label="t('maps.tooltips.exit_fullscreen')"
                @click="closeMapFullscreen"
              />
            </AppTooltip>
          </div>
          <div v-if="selectedMapData" class="flex min-h-0 flex-1">
            <LeafletMapComponent
              ref="fullscreenLeafletMapRef"
              :map="selectedMapData"
              :marks="mapObjectiveMarks"
              :show-extracts="true"
              :show-extract-toggle="true"
              :show-legend="true"
              :show-fullscreen-toggle="true"
              :is-fullscreen="true"
              fill
              :initial-view="fullscreenMapView"
              :initial-floor="fullscreenInitialFloor"
              @toggle-fullscreen="closeMapFullscreen"
            />
          </div>
        </dialog>
      </Transition>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
  import { useScrollLock, useStorage } from '@vueuse/core';
  import { storeToRefs } from 'pinia';
  import {
    type DashboardFocusProgressInteraction,
    useDashboardFocusAnalytics,
  } from '@/composables/useDashboardFocusAnalytics';
  import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
  import { useMapObjectiveMarks } from '@/composables/useMapObjectiveMarks';
  import { useMapObjectivePopup } from '@/composables/useMapObjectivePopup';
  import { useMapResize } from '@/composables/useMapResize';
  import { useMapTime } from '@/composables/useMapTime';
  import { usePageHelpState } from '@/composables/usePageHelpState';
  import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
  import { useTarkovTime } from '@/composables/useTarkovTime';
  import { useTaskDeepLink } from '@/composables/useTaskDeepLink';
  import { useTaskFiltering } from '@/composables/useTaskFiltering';
  import { useTaskNotification } from '@/composables/useTaskNotification';
  import { useTaskRouteSync } from '@/composables/useTaskRouteSync';
  import { useTaskFilters } from '@/features/tasks/composables/useTaskFilters';
  import { useTasksPageEffects } from '@/features/tasks/composables/useTasksPageEffects';
  import MapTaskVisibilityNotice from '@/features/tasks/MapTaskVisibilityNotice.vue';
  import {
    impactEligibleTaskIdsKey,
    isMapViewKey,
    jumpToMapObjectiveKey,
    trackTaskProgressInteractionKey,
  } from '@/features/tasks/task-context';
  import TaskCard from '@/features/tasks/TaskCard.vue';
  import TaskEmptyState from '@/features/tasks/TaskEmptyState.vue';
  import TaskLoadingState from '@/features/tasks/TaskLoadingState.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { debounce, isDebounceRejection } from '@/utils/debounce';
  import { logger } from '@/utils/logger';
  import { STORAGE_KEYS } from '@/utils/storageKeys';
  import { getTaskSecondaryViewForPrimaryView } from '@/utils/taskFilterNormalization';
  import { buildTaskTypeFilterOptions, filterTasksByTypeSettings } from '@/utils/taskTypeFilters';
  import type { MapViewState } from '@/composables/useLeafletMap';
  import type { TaskActionPayload } from '@/composables/useTaskActions';
  import type { Task } from '@/types/tarkov';
  import type {
    TaskFilterAndSortOptions,
    TaskPrimaryView,
    TaskSecondaryView,
  } from '@/types/taskFilter';
  definePageMeta({
    usesWindowScroll: true,
  });
  const LeafletMapComponent = defineAsyncComponent(() => import('@/features/maps/LeafletMap.vue'));
  const TaskGraphView = defineAsyncComponent(() => import('@/features/tasks/TaskGraphView.vue'));
  const TaskSettingsDrawer = defineAsyncComponent(
    () => import('@/features/tasks/TaskSettingsDrawer.vue')
  );
  useSeoMeta({
    title: 'Tasks',
    description:
      'Track your Escape from Tarkov quest progress. View quest objectives, rewards, and dependencies for both PVP and PVE game modes.',
  });
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const {
    getTaskPrimaryView,
    getTaskSecondaryView,
    getTaskUserView,
    getTaskMapView,
    getTaskTraderView,
    getTaskSortMode,
    getTaskSortDirection,
    getTaskSharedByAllOnly,
    getHideNonKappaTasks,
    getShowNonSpecialTasks,
    getShowLightkeeperTasks,
    getOnlyTasksWithRequiredKeys,
    getRespectTaskFiltersForImpact,
    getHideGlobalTasks,
    getHideCompletedMapObjectives,
    getPinnedTaskIds,
  } = storeToRefs(preferencesStore);
  const metadataStore = useMetadataStore();
  const { tasks, loading: tasksLoading } = storeToRefs(metadataStore);
  const maps = computed(() => metadataStore.mapsWithSvg);
  const sortedTraders = computed(() => metadataStore.sortedTraders);
  const editions = computed(() => metadataStore.editions);
  const progressStore = useProgressStore();
  const { tasksCompletions, unlockedTasks, tasksFailed, objectiveCompletions } =
    storeToRefs(progressStore);
  const { isGlobalTask, visibleTasks, updateVisibleTasks, calculateFilteredTasksForOptions } =
    useTaskFiltering();
  const tarkovStore = useTarkovStore();
  const userGameEdition = computed(() => tarkovStore.getGameEdition());
  const { tarkovTime } = useTarkovTime();
  const { close: closeHelp, isOpen: isHelpOpen } = usePageHelpState('tasks');
  const { close: closeSettingsDrawer, isOpen: isSettingsDrawerOpen } =
    usePageSettingsDrawer('tasks');
  const showMapDisplay = computed(() => {
    return getTaskPrimaryView.value === 'maps' && getTaskMapView.value !== 'all';
  });
  const showGraphView = computed(() => {
    return getTaskPrimaryView.value === 'graph';
  });
  const {
    isDesktopHelpPanelOpen,
    isDesktopSettingsDrawerOpen,
    isDesktopSideRailOpen,
    isMobileHelpPanelOpen,
    isMobileSettingsDrawerOpen,
  } = usePageSideRailState({
    helpOpen: isHelpOpen,
    settingsOpen: isSettingsDrawerOpen,
  });
  const shouldShowCompletedObjectives = computed(() => {
    return ['completed', 'all'].includes(getTaskSecondaryView.value);
  });
  const selectedMapData = computed(() => {
    const mapId = getTaskMapView.value;
    if (!mapId || mapId === 'all') return null;
    return maps.value.find((m) => m.id === mapId) || null;
  });
  const selectedMapId = computed(() => selectedMapData.value?.id ?? null);
  const { getMapTimeLabel, mapTimeEntries } = useMapTime(getTaskMapView, tarkovTime);
  type MapClockPeriod = 'dawn' | 'day' | 'dusk' | 'night' | 'default';
  interface ClockEntryStyle {
    icon: string;
    label: string;
    value: string;
  }
  const DEFAULT_CLOCK_ENTRY_STYLE: ClockEntryStyle = {
    icon: 'text-surface-300/80',
    label: 'text-surface-300/70',
    value: 'text-surface-200/85',
  };
  const MAP_CLOCK_ENTRY_STYLES: Record<MapClockPeriod, ClockEntryStyle> = {
    dawn: {
      icon: 'text-primary-300/80',
      label: 'text-primary-300/70',
      value: 'text-primary-200/85',
    },
    day: {
      icon: 'text-warning-300/80',
      label: 'text-warning-300/70',
      value: 'text-warning-200/85',
    },
    dusk: {
      icon: 'text-warning-300/70',
      label: 'text-warning-300/60',
      value: 'text-warning-200/80',
    },
    night: {
      icon: 'text-info-300/80',
      label: 'text-info-300/70',
      value: 'text-info-200/85',
    },
    default: DEFAULT_CLOCK_ENTRY_STYLE,
  };
  const getClockEntryStyle = (period: string): ClockEntryStyle =>
    MAP_CLOCK_ENTRY_STYLES[period as MapClockPeriod] ?? DEFAULT_CLOCK_ENTRY_STYLE;
  const clockEntryIconClass = (period: string) => getClockEntryStyle(period).icon;
  const clockEntryLabelClass = (period: string) => getClockEntryStyle(period).label;
  const clockEntryValueClass = (period: string) => getClockEntryStyle(period).value;
  const {
    mapHeight,
    mapHeightMax,
    mapHeightMin,
    resizeHandleRef,
    isResizing,
    startResize,
    stopResize,
    onResizeKeydown,
  } = useMapResize();
  const isMapPanelExpanded = useStorage<boolean>(STORAGE_KEYS.tasksMapPanelExpanded, true);
  const toggleMapPanelVisibility = () => {
    if (isMapFullscreen.value) {
      closeMapFullscreen();
      return;
    }
    if (isMapPanelExpanded.value) {
      stopResize();
    }
    isMapPanelExpanded.value = !isMapPanelExpanded.value;
  };
  const sourceMapTasks = computed(() =>
    isSearchActive.value ? filteredTasks.value : visibleTasks.value
  );
  const { mapObjectiveMarks, mapObjectiveVisibility } = useMapObjectiveMarks({
    mapId: selectedMapId,
    shouldShowCompletedObjectives,
    tasks: sourceMapTasks,
  });
  const impactEligibleTaskIds = computed<Set<string> | undefined>(() => {
    if (!getRespectTaskFiltersForImpact.value) return undefined;
    const options = buildTaskTypeFilterOptions(preferencesStore, tarkovStore, metadataStore);
    const typeFilteredTasks = filterTasksByTypeSettings(tasks.value, options);
    const filteredTasks = getOnlyTasksWithRequiredKeys.value
      ? typeFilteredTasks.filter((task) => (task.requiredKeys?.length ?? 0) > 0)
      : typeFilteredTasks;
    return new Set(filteredTasks.map((task) => task.id));
  });
  const mapContainerRef = ref<HTMLElement | null>(null);
  interface MapComponentRef {
    activateObjectivePopup: (id: string) => boolean;
    closeActivePopup: () => void;
    getViewState: () => MapViewState | null;
    setViewState: (state: MapViewState) => void;
    getFloor: () => string;
    setFloor: (floor: string) => void;
  }
  const leafletMapRef = ref<MapComponentRef | null>(null);
  const { jumpToMapObjective, cleanup: cleanupMapPopup } = useMapObjectivePopup({
    leafletMapRef,
    mapContainerRef,
  });
  const fullscreenLeafletMapRef = ref<MapComponentRef | null>(null);
  const fullscreenMapView = ref<MapViewState | null>(null);
  const fullscreenInitialFloor = ref<string | undefined>(undefined);
  const isMapFullscreen = ref(false);
  const FULLSCREEN_OVERLAY_SELECTOR = '[data-testid="map-fullscreen-overlay"]';
  const getFullscreenOverlay = (): HTMLElement | null =>
    document.querySelector<HTMLElement>(FULLSCREEN_OVERLAY_SELECTOR);
  const FULLSCREEN_FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const getFullscreenFocusableElements = (container: HTMLElement): HTMLElement[] => {
    return Array.from(
      container.querySelectorAll<HTMLElement>(FULLSCREEN_FOCUSABLE_SELECTOR)
    ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
  };
  let fullscreenOpenerElement: HTMLElement | null = null;
  let fullscreenMapId: string | null = null;
  let inertBackgroundElements: HTMLElement[] = [];
  const collectInertSiblings = (element: HTMLElement): HTMLElement[] => {
    const parent = element.parentElement;
    if (!parent) return [];
    return Array.from(parent.children).filter(
      (child): child is HTMLElement => child !== element && child instanceof HTMLElement
    );
  };
  const collectFullscreenBackgroundElements = (overlay: HTMLElement): HTMLElement[] => {
    const elements: HTMLElement[] = [];
    let node: HTMLElement | null = overlay;
    while (node && node !== document.body) {
      elements.push(...collectInertSiblings(node));
      node = node.parentElement;
    }
    return elements;
  };
  const applyFullscreenBackgroundInert = () => {
    const overlay = getFullscreenOverlay();
    if (!overlay) return;
    inertBackgroundElements = collectFullscreenBackgroundElements(overlay);
    inertBackgroundElements.forEach((element) => {
      element.inert = true;
    });
  };
  const clearFullscreenBackgroundInert = () => {
    inertBackgroundElements.forEach((element) => {
      element.inert = false;
    });
    inertBackgroundElements = [];
  };
  const isInInertBackground = (element: HTMLElement): boolean =>
    inertBackgroundElements.some((background) => background.contains(element));
  const readFullscreenMapView = (): MapViewState | null =>
    fullscreenLeafletMapRef.value?.getViewState() ?? null;
  const readFullscreenFloor = (): string | undefined => fullscreenLeafletMapRef.value?.getFloor();
  const restoreInlineMapView = (view: MapViewState): void => {
    if (fullscreenMapId !== selectedMapId.value) return;
    leafletMapRef.value?.setViewState(view);
  };
  const restoreInlineMapFloor = (floor: string | undefined): void => {
    if (!floor || fullscreenMapId !== selectedMapId.value) return;
    leafletMapRef.value?.setFloor(floor);
  };
  const openMapFullscreen = () => {
    fullscreenMapId = selectedMapId.value;
    const inlineMap = leafletMapRef.value;
    if (inlineMap) {
      fullscreenMapView.value = inlineMap.getViewState();
      fullscreenInitialFloor.value = inlineMap.getFloor();
    }
    isMapFullscreen.value = true;
  };
  const closeMapFullscreen = () => {
    const overlayView = readFullscreenMapView();
    const overlayFloor = readFullscreenFloor();
    isMapFullscreen.value = false;
    fullscreenMapView.value = null;
    fullscreenInitialFloor.value = undefined;
    restoreInlineMapFloor(overlayFloor);
    if (overlayView) nextTick(() => restoreInlineMapView(overlayView));
  };
  const PORTALLED_POPOVER_SELECTOR = '[data-reka-popper-content-wrapper]';
  const isFocusInsidePortalledPopover = (): boolean => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return false;
    return Boolean(activeElement.closest(PORTALLED_POPOVER_SELECTOR));
  };
  const isPopoverLayerOpen = (): boolean => {
    const layers = document.querySelectorAll<HTMLElement>(
      `${PORTALLED_POPOVER_SELECTOR} [role="dialog"][data-state="open"]`
    );
    return Array.from(layers).some((layer) => !isInInertBackground(layer));
  };
  const shouldCloseOnEscape = (event: KeyboardEvent): boolean =>
    !event.defaultPrevented && !isPopoverLayerOpen();
  const resolveFullscreenTabTarget = (
    event: KeyboardEvent,
    overlay: HTMLElement
  ): HTMLElement | undefined => {
    const focusable = getFullscreenFocusableElements(overlay);
    const [edge, wrap] = event.shiftKey
      ? [focusable[0], focusable[focusable.length - 1]]
      : [focusable[focusable.length - 1], focusable[0]];
    if (document.activeElement === edge) return wrap;
    return overlay.contains(document.activeElement) ? undefined : wrap;
  };
  const trapFullscreenTab = (event: KeyboardEvent) => {
    const overlay = getFullscreenOverlay();
    if (!overlay || isFocusInsidePortalledPopover()) return;
    const target = resolveFullscreenTabTarget(event, overlay);
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
  const handleFullscreenKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      trapFullscreenTab(event);
      return;
    }
    if (event.key === 'Escape' && shouldCloseOnEscape(event)) {
      closeMapFullscreen();
    }
  };
  const bodyScrollLock = useScrollLock(document.body);
  watch(isMapFullscreen, (isActive) => {
    bodyScrollLock.value = isActive;
    if (isActive) {
      fullscreenOpenerElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.addEventListener('keydown', handleFullscreenKeydown);
      nextTick(() => {
        applyFullscreenBackgroundInert();
        getFullscreenOverlay()
          ?.querySelector<HTMLElement>('[data-testid="map-fullscreen-exit"]')
          ?.focus();
      });
    } else {
      clearFullscreenBackgroundInert();
      window.removeEventListener('keydown', handleFullscreenKeydown);
      if (fullscreenOpenerElement) {
        fullscreenOpenerElement.focus();
        fullscreenOpenerElement = null;
      }
    }
  });
  watch(showMapDisplay, (isMapView) => {
    if (isMapView || !isMapFullscreen.value) return;
    closeMapFullscreen();
  });
  const handleJumpToMapObjective = async (objectiveId: string) => {
    isMapPanelExpanded.value = true;
    try {
      await jumpToMapObjective(objectiveId);
    } catch (error) {
      logger.error(`[Tasks] Failed to jump to map objective ${objectiveId}:`, error);
    }
  };
  const {
    taskStatusUpdated,
    taskStatus,
    showUndoButton,
    onTaskAction,
    undoLastAction,
    closeNotification,
    cleanup: cleanupNotification,
  } = useTaskNotification();
  const { trackFocusedTaskAction, trackFocusedTaskProgress } = useDashboardFocusAnalytics();
  const mergedMaps = computed(() => {
    return (maps.value || []).map((map) => ({
      id: map.id,
      name: map.name,
      mergedIds: (map as unknown as { mergedIds?: string[] }).mergedIds || [map.id],
    }));
  });
  const effectiveTaskSecondaryView = computed(() =>
    getTaskSecondaryViewForPrimaryView(getTaskPrimaryView.value, getTaskSecondaryView.value)
  );
  const mapTaskVisibilityFilterOptions = computed<TaskFilterAndSortOptions>(() => ({
    primaryView: getTaskPrimaryView.value as TaskPrimaryView,
    secondaryView: effectiveTaskSecondaryView.value as TaskSecondaryView,
    userView: getTaskUserView.value,
    mapView: getTaskMapView.value,
    traderView: getTaskTraderView.value,
    mergedMaps: mergedMaps.value,
    sortMode: getTaskSortMode.value,
    sortDirection: getTaskSortDirection.value,
  }));
  const toggleMapTaskVisibilityFilter = () => {
    preferencesStore.setHideCompletedMapObjectives(!getHideCompletedMapObjectives.value);
  };
  const route = useRoute();
  useTaskRouteSync({ maps, traders: sortedTraders });
  const refreshVisibleTasks = () => {
    try {
      updateVisibleTasks(mapTaskVisibilityFilterOptions.value, tasksLoading.value);
    } catch (error) {
      logger.error('[Tasks] Failed to refresh tasks:', error);
    }
  };
  const debouncedRefreshVisibleTasks = debounce(() => {
    refreshVisibleTasks();
  }, 50);
  const handleTaskAction = (payload: TaskActionPayload) => {
    onTaskAction(payload);
    trackFocusedTaskAction(payload);
    void nextTick(() => {
      refreshVisibleTasks();
      debouncedRefreshVisibleTasks.cancel();
    });
  };
  watch(
    isSettingsDrawerOpen,
    (isOpen) => {
      if (!isOpen) return;
      closeHelp({ restoreFocus: false });
    },
    { immediate: true }
  );
  watch(
    isHelpOpen,
    (isOpen) => {
      if (!isOpen) return;
      closeSettingsDrawer();
    },
    { immediate: true }
  );
  watch(
    [
      getTaskPrimaryView,
      getTaskSecondaryView,
      getTaskUserView,
      getTaskMapView,
      getTaskTraderView,
      getTaskSortMode,
      getTaskSortDirection,
      getTaskSharedByAllOnly,
      getHideNonKappaTasks,
      getShowNonSpecialTasks,
      getShowLightkeeperTasks,
      getOnlyTasksWithRequiredKeys,
      getRespectTaskFiltersForImpact,
      getHideGlobalTasks,
      getHideCompletedMapObjectives,
      getPinnedTaskIds,
      tasksLoading,
      tasks,
      maps,
      tasksCompletions,
      unlockedTasks,
      tasksFailed,
      objectiveCompletions,
      userGameEdition,
      editions,
    ],
    () => {
      void debouncedRefreshVisibleTasks().catch((error) => {
        if (isDebounceRejection(error)) return;
        logger.error('[Tasks] Debounced refresh failed:', error);
      });
    },
    { immediate: true, flush: 'post' }
  );
  const isLoading = computed(() => !metadataStore.hasInitialized || tasksLoading.value);
  const {
    activeSearchCount,
    cleanup: cleanupTaskFilters,
    filteredTasks,
    isSearchActive,
    mapCompleteTasksCountOnMap,
    searchQuery,
    showMapTaskVisibilityNotice,
  } = useTaskFilters({
    calculateFilteredTasksForOptions: (taskList, options, hideCompletedMapObjectives, overrides) =>
      calculateFilteredTasksForOptions(
        taskList,
        options,
        hideCompletedMapObjectives ?? false,
        overrides
      ),
    getTaskMapView,
    mapTaskVisibilityFilterOptions,
    showMapDisplay,
    tasks,
    visibleTasks,
  });
  const graphVisibleTaskIds = computed(() => new Set(visibleTasks.value.map((task) => task.id)));
  const {
    pinnedTask,
    clearPinnedTask,
    handleTaskQueryParam,
    cleanup: cleanupDeepLink,
  } = useTaskDeepLink({
    searchQuery,
    filteredTasks,
    leafletMapRef,
  });
  const handleTrackedTaskProgressInteraction = (
    taskId: string,
    interaction: DashboardFocusProgressInteraction
  ) => {
    trackFocusedTaskProgress(taskId, interaction);
  };
  provide(jumpToMapObjectiveKey, handleJumpToMapObjective);
  provide(isMapViewKey, showMapDisplay);
  provide(impactEligibleTaskIdsKey, impactEligibleTaskIds);
  provide(trackTaskProgressInteractionKey, handleTrackedTaskProgressInteraction);
  const BATCH_SIZE = 8;
  const visibleTaskCount = ref(BATCH_SIZE);
  const loadMoreSentinel = ref<HTMLElement | null>(null);
  const visibleTasksSlice = computed(() => {
    if (!pinnedTask.value) {
      return filteredTasks.value.slice(0, visibleTaskCount.value);
    }
    const remaining = filteredTasks.value.filter((task) => task.id !== pinnedTask.value?.id);
    const sliceCount = Math.max(visibleTaskCount.value - 1, 0);
    return [pinnedTask.value, ...remaining.slice(0, sliceCount)];
  });
  const focusedTaskInSlice = computed(() => {
    if (!pinnedTask.value) return [];
    return [pinnedTask.value];
  });
  const focusTaskId = computed(() => pinnedTask.value?.id ?? null);
  const pinnedTasksInSlice = computed(() => {
    const pinnedIds = getPinnedTaskIds.value.filter((id) => id !== focusTaskId.value);
    if (!pinnedIds.length) return [];
    const pinnedIdSet = new Set(pinnedIds);
    return visibleTasksSlice.value.filter((task) => pinnedIdSet.has(task.id));
  });
  const unpinnedTasksInSlice = computed(() => {
    const pinnedIds = getPinnedTaskIds.value.filter((id) => id !== focusTaskId.value);
    if (!pinnedIds.length) {
      return visibleTasksSlice.value.filter((task) => task.id !== focusTaskId.value);
    }
    const pinnedIdSet = new Set(pinnedIds);
    return visibleTasksSlice.value.filter(
      (task) => task.id !== focusTaskId.value && !pinnedIdSet.has(task.id)
    );
  });
  const shouldGroupGlobalTasks = computed(() => {
    return showMapDisplay.value && !getHideGlobalTasks.value;
  });
  const mapSpecificTasksInSlice = computed(() => {
    if (!shouldGroupGlobalTasks.value) return unpinnedTasksInSlice.value;
    return unpinnedTasksInSlice.value.filter((task) => !isGlobalTask(task));
  });
  const globalTasksInSlice = computed(() => {
    if (!shouldGroupGlobalTasks.value) return [];
    return unpinnedTasksInSlice.value.filter((task) => isGlobalTask(task));
  });
  const hasMoreTasks = computed(() => visibleTaskCount.value < filteredTasks.value.length);
  const loadMoreTasks = () => {
    if (!hasMoreTasks.value) return;
    visibleTaskCount.value = Math.min(
      visibleTaskCount.value + BATCH_SIZE,
      filteredTasks.value.length
    );
  };
  const { checkAndLoadMore } = useInfiniteScroll(loadMoreSentinel, loadMoreTasks, {
    autoLoadOnReady: false,
    enabled: hasMoreTasks,
    maxAutoLoads: 8,
    rootMargin: '700px',
  });
  useTasksPageEffects({
    batchSize: BATCH_SIZE,
    checkAndLoadMore,
    filteredTasks,
    handleTaskQueryParam,
    metadataStore,
    route,
    selectedMapData,
    showMapDisplay,
    stopResize,
    tasksLoading,
    visibleTaskCount,
  });
  onBeforeUnmount(() => {
    debouncedRefreshVisibleTasks.cancel();
    cleanupTaskFilters();
    stopResize();
    cleanupMapPopup();
    cleanupNotification();
    cleanupDeepLink();
    isMapFullscreen.value = false;
    bodyScrollLock.value = false;
    fullscreenOpenerElement = null;
    clearFullscreenBackgroundInert();
    window.removeEventListener('keydown', handleFullscreenKeydown);
  });
</script>
