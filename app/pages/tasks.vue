<template>
  <div class="flex min-h-full overflow-x-hidden">
    <div
      class="min-w-0 flex-1 px-3 py-6 transition-[padding] duration-200 sm:px-6"
      :class="{ 'lg:pr-80': isOverlaySettingsDrawerOpen && !showMapDisplay }"
    >
      <div class="mx-auto max-w-[1400px]">
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
                <div class="mb-3 flex items-start justify-between gap-3">
                  <div class="min-w-0 space-y-2">
                    <div class="flex min-w-0 items-center gap-2">
                      <span
                        class="bg-primary-500/15 border-primary-500/25 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                      >
                        <UIcon
                          name="i-mdi-map-marker-radius-outline"
                          class="text-primary-300 h-4 w-4"
                        />
                      </span>
                      <h3 class="text-surface-100 truncate text-lg leading-tight font-semibold">
                        {{ selectedMapData?.name || t('tasks.view.map') }}
                      </h3>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span
                        v-for="(entry, index) in mapTimeEntries"
                        :key="`${entry.value}-${index}`"
                        class="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold"
                        :class="entry.badgeClass"
                      >
                        <UIcon :name="entry.icon" :class="['h-4 w-4 shrink-0', entry.iconClass]" />
                        <span class="tracking-wide uppercase" :class="entry.labelClass">
                          {{ getMapTimeLabel(entry.period) }}
                        </span>
                        <span class="tabular-nums" :class="entry.valueClass">
                          {{ entry.value }}
                        </span>
                      </span>
                    </div>
                  </div>
                  <UButton
                    data-testid="map-panel-toggle"
                    icon="i-mdi-chevron-down"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    :aria-label="t('page.tasks.map.toggle_panel')"
                    :aria-expanded="isMapPanelExpanded"
                    aria-controls="tasks-map-panel-content"
                    :class="{ 'rotate-180': isMapPanelExpanded }"
                    class="mt-0.5 shrink-0 transition-transform duration-200"
                    @click="toggleMapPanelVisibility"
                  />
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
                        :height="mapHeight"
                      />
                      <div
                        ref="resizeHandleRef"
                        role="separator"
                        aria-orientation="horizontal"
                        :aria-label="t('page.tasks.map.resize_handle')"
                        :aria-valuemin="mapHeightMin"
                        :aria-valuemax="mapHeightMax"
                        :aria-valuenow="mapHeight"
                        tabindex="0"
                        class="bg-surface-900/60 border-surface-700 text-surface-400 hover:text-surface-200 focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 mt-3 flex h-8 w-full cursor-row-resize touch-none items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        :class="{ 'ring-primary-500 text-surface-200 ring-1': isResizing }"
                        @pointerdown="startResize"
                        @keydown="onResizeKeydown"
                      >
                        <UIcon name="i-mdi-drag-horizontal-variant" class="h-4 w-4" />
                      </div>
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
                  <div
                    v-for="task in pinnedTasksInSlice"
                    :key="`pinned-${task.id}`"
                    class="content-visibility-auto-280 pb-4"
                  >
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
                    (pinnedTasksInSlice.length > 0 &&
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
                <div
                  v-for="task in mapSpecificTasksInSlice"
                  :key="`task-${task.id}`"
                  class="content-visibility-auto-280 pb-4"
                >
                  <TaskCard
                    :accent-variant="
                      shouldGroupGlobalTasks && isGlobalTask(task) ? 'global' : 'default'
                    "
                    :task="task"
                    @on-task-action="handleTaskAction"
                  />
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
                  <div
                    v-for="task in globalTasksInSlice"
                    :key="`global-${task.id}`"
                    class="content-visibility-auto-280 pb-4"
                  >
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
      <div v-if="isDockedSettingsDrawerOpen" class="shrink-0 px-4 py-6">
        <TaskSettingsDrawer mode="docked" />
      </div>
    </Transition>
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="translate-x-full opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-x-0 opacity-100"
      leave-to-class="translate-x-full opacity-0"
    >
      <TaskSettingsDrawer v-if="isOverlaySettingsDrawerOpen" mode="overlay" />
    </Transition>
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
                  {{ t('page.tasks.filters.close') }}
                </UButton>
              </div>
            </div>
          </UCard>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
  import { breakpointsTailwind, useBreakpoints } from '@vueuse/core';
  import { storeToRefs } from 'pinia';
  import { useI18n } from 'vue-i18n';
  import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
  import { useMapObjectivePopup } from '@/composables/useMapObjectivePopup';
  import { useMapResize } from '@/composables/useMapResize';
  import { useTarkovTime } from '@/composables/useTarkovTime';
  import { useTaskDeepLink } from '@/composables/useTaskDeepLink';
  import { useTaskFiltering } from '@/composables/useTaskFiltering';
  import { useTaskNotification } from '@/composables/useTaskNotification';
  import { useTaskRouteSync } from '@/composables/useTaskRouteSync';
  import { useTaskSettingsDrawer } from '@/composables/useTaskSettingsDrawer';
  import MapTaskVisibilityNotice from '@/features/tasks/MapTaskVisibilityNotice.vue';
  import TaskCard from '@/features/tasks/TaskCard.vue';
  import TaskEmptyState from '@/features/tasks/TaskEmptyState.vue';
  import TaskLoadingState from '@/features/tasks/TaskLoadingState.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { debounce, isDebounceRejection } from '@/utils/debounce';
  import { fuzzyMatchScore } from '@/utils/fuzzySearch';
  import { logger } from '@/utils/logger';
  import { STATIC_TIME_MAPS, resolveStaticDisplayTime } from '@/utils/mapTime';
  import { buildTaskTypeFilterOptions, filterTasksByTypeSettings } from '@/utils/taskTypeFilters';
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
  const { isOpen: isSettingsDrawerOpen } = useTaskSettingsDrawer();
  const breakpoints = useBreakpoints(breakpointsTailwind);
  const isLgAndUp = breakpoints.greaterOrEqual('lg');
  type MapObjectiveZone = { map: { id: string }; outline: { x: number; z: number }[] };
  type MapObjectiveLocation = {
    map: { id: string };
    positions?: Array<{ x: number; y?: number; z: number }>;
  };
  type MapObjectiveMark = {
    id?: string;
    zones: MapObjectiveZone[];
    possibleLocations?: MapObjectiveLocation[];
    users?: string[];
  };
  type MapTimePeriod = 'dawn' | 'day' | 'dusk' | 'night' | 'default';
  type MapTimeStyle = {
    badgeClass: string;
    iconClass: string;
    labelClass: string;
    valueClass: string;
  };
  const MAP_TIME_ICONS: Record<MapTimePeriod, string> = {
    dawn: 'i-mdi-weather-sunset-up',
    day: 'i-mdi-weather-sunny',
    dusk: 'i-mdi-weather-sunset-down',
    night: 'i-mdi-moon-waxing-crescent',
    default: 'i-mdi-clock-time-four-outline',
  };
  const MAP_TIME_STYLES: Record<MapTimePeriod, MapTimeStyle> = {
    dawn: {
      badgeClass: 'border-primary-500/35 bg-primary-500/10',
      iconClass: 'text-primary-300',
      labelClass: 'text-primary-200/90',
      valueClass: 'text-primary-100',
    },
    day: {
      badgeClass: 'border-warning-500/35 bg-warning-500/10',
      iconClass: 'text-warning-300',
      labelClass: 'text-warning-200/90',
      valueClass: 'text-warning-100',
    },
    dusk: {
      badgeClass: 'border-error-500/35 bg-error-500/10',
      iconClass: 'text-error-300',
      labelClass: 'text-error-200/90',
      valueClass: 'text-error-100',
    },
    night: {
      badgeClass: 'border-info-500/35 bg-info-500/10',
      iconClass: 'text-info-300',
      labelClass: 'text-info-200/90',
      valueClass: 'text-info-100',
    },
    default: {
      badgeClass: 'bg-surface-900/60 border-surface-700',
      iconClass: 'text-surface-300',
      labelClass: 'text-surface-300',
      valueClass: 'text-surface-100',
    },
  };
  const resolveMapTimePeriod = (hour: number): MapTimePeriod => {
    if (hour >= 5 && hour < 7) return 'dawn';
    if (hour >= 7 && hour < 18) return 'day';
    if (hour >= 18 && hour < 20) return 'dusk';
    return 'night';
  };
  const showMapDisplay = computed(() => {
    return getTaskPrimaryView.value === 'maps' && getTaskMapView.value !== 'all';
  });
  const showGraphView = computed(() => {
    return getTaskPrimaryView.value === 'graph';
  });
  const isDockedSettingsDrawerOpen = computed(() => {
    return isSettingsDrawerOpen.value && showMapDisplay.value && isLgAndUp.value;
  });
  const isOverlaySettingsDrawerOpen = computed(() => {
    return isSettingsDrawerOpen.value && (!showMapDisplay.value || !isLgAndUp.value);
  });
  const shouldShowCompletedObjectives = computed(() => {
    return ['completed', 'all'].includes(getTaskSecondaryView.value);
  });
  const selectedMapData = computed(() => {
    const mapId = getTaskMapView.value;
    if (!mapId || mapId === 'all') return null;
    return maps.value.find((m) => m.id === mapId) || null;
  });
  const displayTime = computed(() => {
    const mapId = getTaskMapView.value;
    if (!mapId) return tarkovTime.value;
    const staticTime = STATIC_TIME_MAPS[mapId];
    if (!staticTime) return tarkovTime.value;
    return resolveStaticDisplayTime(staticTime, tarkovTime.value);
  });
  const getMapTimeLabel = (period: MapTimePeriod): string => {
    return t(`page.tasks.map.time_period.${period}`);
  };
  const mapTimeEntries = computed(() => {
    return displayTime.value
      .split('/')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((value) => {
        const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
        if (!match) {
          return {
            value,
            period: 'default' as MapTimePeriod,
            icon: MAP_TIME_ICONS.default,
            ...MAP_TIME_STYLES.default,
          };
        }
        const hour = Number(match[1]);
        const period =
          Number.isInteger(hour) && hour >= 0 && hour <= 23
            ? resolveMapTimePeriod(hour)
            : 'default';
        return { value, period, icon: MAP_TIME_ICONS[period], ...MAP_TIME_STYLES[period] };
      });
  });
  watch(
    [showMapDisplay, selectedMapData],
    ([showMap, selectedMap]) => {
      if (!showMap || !selectedMap) return;
      metadataStore.fetchMapSpawnsData().catch((error) => {
        logger.error('[Tasks] Failed to load map spawn data:', error);
      });
    },
    { immediate: true }
  );
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
  const isMapPanelExpanded = ref(true);
  const toggleMapPanelVisibility = () => {
    if (isMapPanelExpanded.value) {
      stopResize();
    }
    isMapPanelExpanded.value = !isMapPanelExpanded.value;
  };
  watch(showMapDisplay, (isVisible) => {
    if (!isVisible) {
      isMapPanelExpanded.value = true;
      stopResize();
    }
  });
  const mapObjectiveMarks = computed(() => {
    if (!selectedMapData.value) return [];
    const mapId = selectedMapData.value.id;
    const marks: MapObjectiveMark[] = [];
    const objCompletions = objectiveCompletions.value;
    const taskCompletions = tasksCompletions.value;
    const includeTeammates = !preferencesStore.mapTeamAllHidden;
    const teammateIds = includeTeammates
      ? Object.keys(progressStore.visibleTeamStores).filter((id) => id !== 'self')
      : [];
    visibleTasks.value.forEach((task) => {
      if (!task.objectives) return;
      const objectiveMaps = metadataStore.objectiveMaps?.[task.id] ?? [];
      const objectiveGps = metadataStore.objectiveGPS?.[task.id] ?? [];
      task.objectives.forEach((obj) => {
        const selfComplete = tarkovStore.isTaskObjectiveComplete(obj.id);
        const selfTaskComplete = tarkovStore.isTaskComplete(task.id);
        const selfTaskFailed = tarkovStore.isTaskFailed(task.id);
        const selfTaskUnlocked = unlockedTasks.value[task.id]?.self === true;
        const selfNeedsObjective =
          selfTaskUnlocked && !selfTaskComplete && !selfTaskFailed && !selfComplete;
        const users: string[] = [];
        const teammateUsers: string[] = [];
        if (selfNeedsObjective) {
          users.push('self');
        }
        for (const tmId of teammateIds) {
          const objDone = objCompletions[obj.id]?.[tmId] === true;
          const taskDone = taskCompletions[task.id]?.[tmId] === true;
          const taskFailed = tasksFailed.value[task.id]?.[tmId] === true;
          if (!objDone && !taskDone && !taskFailed) {
            teammateUsers.push(tmId);
          }
        }
        if (teammateUsers.length > 0) {
          users.push(...teammateUsers);
        } else if (
          selfComplete &&
          selfTaskComplete &&
          !selfTaskFailed &&
          shouldShowCompletedObjectives.value
        ) {
          users.push('self');
        }
        if (users.length === 0) return;
        const zones: MapObjectiveZone[] = [];
        const possibleLocations: MapObjectiveLocation[] = [];
        if (Array.isArray(obj.zones)) {
          obj.zones.forEach((zone) => {
            if (zone?.map?.id !== mapId) return;
            const outline = Array.isArray(zone.outline)
              ? zone.outline.map((point) => ({ x: point.x, z: point.z }))
              : [];
            if (outline.length >= 3) {
              zones.push({ map: { id: mapId }, outline });
            } else if (zone.position) {
              possibleLocations.push({
                map: { id: mapId },
                positions: [{ x: zone.position.x, y: zone.position.y, z: zone.position.z }],
              });
            }
          });
        }
        if (Array.isArray(obj.possibleLocations)) {
          obj.possibleLocations.forEach((location) => {
            if (location?.map?.id !== mapId) return;
            const positions = Array.isArray(location.positions)
              ? location.positions.map((pos) => ({ x: pos.x, y: pos.y, z: pos.z }))
              : [];
            if (positions.length > 0) {
              possibleLocations.push({
                map: { id: mapId },
                positions,
              });
            }
          });
        }
        const gpsInfo = objectiveGps.find((gps) => gps.objectiveID === obj.id);
        const isOnThisMap = objectiveMaps.some(
          (mapInfo) => mapInfo.objectiveID === obj.id && mapInfo.mapID === mapId
        );
        if (isOnThisMap && gpsInfo && (gpsInfo.x !== undefined || gpsInfo.y !== undefined)) {
          possibleLocations.push({
            map: { id: mapId },
            positions: [{ x: gpsInfo.x ?? 0, y: 0, z: gpsInfo.y ?? 0 }],
          });
        }
        if (zones.length > 0 || possibleLocations.length > 0) {
          marks.push({
            id: obj.id,
            zones,
            possibleLocations,
            users,
          });
        }
      });
    });
    return marks;
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
  const leafletMapRef = ref<{
    activateObjectivePopup: (id: string) => boolean;
    closeActivePopup: () => void;
  } | null>(null);
  const { jumpToMapObjective, cleanup: cleanupMapPopup } = useMapObjectivePopup({
    leafletMapRef,
    mapContainerRef,
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
  const mergedMaps = computed(() => {
    return (maps.value || []).map((map) => ({
      id: map.id,
      name: map.name,
      mergedIds: (map as unknown as { mergedIds?: string[] }).mergedIds || [map.id],
    }));
  });
  const mapTaskVisibilityFilterOptions = computed<TaskFilterAndSortOptions>(() => ({
    primaryView: getTaskPrimaryView.value as TaskPrimaryView,
    secondaryView: getTaskSecondaryView.value as TaskSecondaryView,
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
    void nextTick(() => {
      refreshVisibleTasks();
      debouncedRefreshVisibleTasks.cancel();
    });
  };
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
  const searchQuery = ref('');
  const debouncedSearch = ref('');
  const updateDebouncedSearch = debounce((value: string) => {
    debouncedSearch.value = value;
  }, 180);
  watch(searchQuery, (value) => {
    if (!value) {
      updateDebouncedSearch.cancel();
      debouncedSearch.value = '';
      return;
    }
    void updateDebouncedSearch(value).catch((error) => {
      if (isDebounceRejection(error)) return;
      logger.error('[Tasks] Debounced search update failed:', error);
    });
  });
  const normalizedSearch = computed(() => debouncedSearch.value.toLowerCase().trim());
  const isSearchActive = computed(() => normalizedSearch.value.length > 0);
  const applySearchToTaskList = (taskList: Task[], query: string): Task[] => {
    if (!query) return taskList;
    return taskList
      .map((task) => ({
        task,
        score: fuzzyMatchScore(task.name ?? '', query),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ task }) => task);
  };
  const filteredTasks = computed((): Task[] => {
    return applySearchToTaskList(visibleTasks.value, normalizedSearch.value);
  });
  const mapCompleteTasksCountOnMap = computed(() => {
    if (!showMapDisplay.value) return 0;
    if (!tasks.value.length || !mergedMaps.value.length) return 0;
    const selectedMapId = getTaskMapView.value;
    if (!selectedMapId || selectedMapId === 'all') return 0;
    const query = normalizedSearch.value;
    const tasksWithoutHiding = applySearchToTaskList(
      calculateFilteredTasksForOptions(tasks.value, mapTaskVisibilityFilterOptions.value, false),
      query
    );
    const tasksWithHiding = applySearchToTaskList(
      calculateFilteredTasksForOptions(tasks.value, mapTaskVisibilityFilterOptions.value, true),
      query
    );
    return Math.max(tasksWithoutHiding.length - tasksWithHiding.length, 0);
  });
  const showMapTaskVisibilityNotice = computed(() => {
    return showMapDisplay.value && mapCompleteTasksCountOnMap.value > 0;
  });
  const graphVisibleTaskIds = computed(() => new Set(visibleTasks.value.map((task) => task.id)));
  const activeSearchCount = computed(() => filteredTasks.value.length);
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
  provide('jumpToMapObjective', handleJumpToMapObjective);
  provide('isMapView', showMapDisplay);
  provide('impactEligibleTaskIds', impactEligibleTaskIds);
  provide('clearPinnedTask', clearPinnedTask);
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
  const pinnedTasksInSlice = computed(() => {
    const pinnedIds = getPinnedTaskIds.value;
    if (!pinnedIds.length) return [];
    const pinnedIdSet = new Set(pinnedIds);
    return visibleTasksSlice.value.filter((task) => pinnedIdSet.has(task.id));
  });
  const unpinnedTasksInSlice = computed(() => {
    const pinnedIds = getPinnedTaskIds.value;
    if (!pinnedIds.length) return visibleTasksSlice.value;
    const pinnedIdSet = new Set(pinnedIds);
    return visibleTasksSlice.value.filter((task) => !pinnedIdSet.has(task.id));
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
    enabled: hasMoreTasks,
    maxAutoLoads: 8,
    rootMargin: '700px',
  });
  watch(filteredTasks, (newTasks, oldTasks) => {
    const listChanged =
      !oldTasks ||
      newTasks.length !== oldTasks.length ||
      newTasks.some((task, i) => task.id !== oldTasks[i]!.id);
    if (listChanged) {
      visibleTaskCount.value = Math.min(BATCH_SIZE, newTasks.length);
    }
    void nextTick(() => {
      checkAndLoadMore();
    });
  });
  watch(
    [() => useRoute().query.task, () => useRoute().query.highlightObjective, tasksLoading],
    ([taskQueryParam, , loading]) => {
      if (taskQueryParam && !loading) {
        handleTaskQueryParam();
      }
    },
    { immediate: true }
  );
  onBeforeUnmount(() => {
    debouncedRefreshVisibleTasks.cancel();
    updateDebouncedSearch.cancel();
    stopResize();
    cleanupMapPopup();
    cleanupNotification();
    cleanupDeepLink();
  });
</script>
