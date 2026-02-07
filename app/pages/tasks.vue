<template>
  <div class="flex min-h-full overflow-x-hidden">
    <div
      class="min-w-0 flex-1 px-3 py-6 transition-[padding] duration-200 sm:px-6"
      :class="{ 'pr-80': isSettingsDrawerOpen }"
    >
      <div class="mx-auto max-w-[1400px]">
        <TaskLoadingState v-if="isLoading" />
        <div v-else>
          <TaskFilterBar
            v-model:search-query="searchQuery"
            :active-search-count="activeSearchCount"
            :is-search-active="isSearchActive"
          />
          <div v-if="showMapDisplay" ref="mapContainerRef" class="mb-6">
            <div class="bg-surface-800/50 rounded-lg p-4">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="text-surface-200 text-lg font-medium">
                  {{ selectedMapData?.name || 'Map' }}
                  <span class="text-surface-400 ml-2 text-sm font-normal">
                    {{ displayTime }}
                  </span>
                </h3>
              </div>
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
                  class="bg-surface-900/60 border-surface-700 text-surface-400 hover:text-surface-200 focus-visible:ring-primary-500 mt-3 flex h-8 w-full cursor-row-resize touch-none items-center justify-center rounded-md border transition"
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
                title="No map data available for this selection."
              />
            </div>
          </div>
          <div v-if="filteredTasks.length === 0" class="py-6">
            <TaskEmptyState />
          </div>
          <div v-else ref="taskListRef" data-testid="task-list">
            <div v-if="pinnedTasksInSlice.length > 0" class="mb-6">
              <div class="mb-3 flex items-center gap-2">
                <UIcon name="i-mdi-pin" class="text-primary-400 h-4 w-4" />
                <h3 class="text-surface-200 text-sm font-medium">
                  {{ t('page.tasks.pinned_tasks_section') }}
                </h3>
                <div class="bg-surface-700 h-px flex-1" />
              </div>
              <div
                v-for="task in pinnedTasksInSlice"
                :key="`pinned-${task.id}`"
                class="content-visibility-auto-280 pb-4"
              >
                <TaskCard :task="task" @on-task-action="onTaskAction" />
              </div>
            </div>
            <div
              v-for="task in unpinnedTasksInSlice"
              :key="`task-${task.id}`"
              class="content-visibility-auto-280 pb-4"
            >
              <TaskCard :task="task" @on-task-action="onTaskAction" />
            </div>
            <div
              v-if="visibleTaskCount < filteredTasks.length"
              ref="loadMoreSentinel"
              class="flex items-center justify-center py-4"
            >
              <UIcon name="i-mdi-loading" class="text-surface-400 h-5 w-5 animate-spin" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="translate-x-full opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-x-0 opacity-100"
      leave-to-class="translate-x-full opacity-0"
    >
      <TaskSettingsDrawer v-if="isSettingsDrawerOpen" />
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
  import { buildTaskTypeFilterOptions, filterTasksByTypeSettings } from '@/utils/taskTypeFilters';
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
    getPinnedTaskIds,
  } = storeToRefs(preferencesStore);
  const metadataStore = useMetadataStore();
  const { tasks, loading: tasksLoading } = storeToRefs(metadataStore);
  const maps = computed(() => metadataStore.mapsWithSvg);
  const sortedTraders = computed(() => metadataStore.sortedTraders);
  const editions = computed(() => metadataStore.editions);
  const progressStore = useProgressStore();
  const { tasksCompletions, unlockedTasks, tasksFailed } = storeToRefs(progressStore);
  const { visibleTasks, updateVisibleTasks } = useTaskFiltering();
  const tarkovStore = useTarkovStore();
  const userGameEdition = computed(() => tarkovStore.getGameEdition());
  const { tarkovTime } = useTarkovTime();
  const { isOpen: isSettingsDrawerOpen } = useTaskSettingsDrawer();
  const STATIC_TIME_MAPS: Record<string, string> = {
    '55f2d3fd4bdc2d5f408b4567': '15:28 / 03:28',
    '5b0fc42d86f7744a585f9105': '15:28 / 03:28',
  };
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
  const showMapDisplay = computed(() => {
    return getTaskPrimaryView.value === 'maps' && getTaskMapView.value !== 'all';
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
    return staticTime ?? tarkovTime.value;
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
  const mapObjectiveMarks = computed(() => {
    if (!selectedMapData.value) return [];
    const mapId = selectedMapData.value.id;
    const marks: MapObjectiveMark[] = [];
    visibleTasks.value.forEach((task) => {
      if (!task.objectives) return;
      const objectiveMaps = metadataStore.objectiveMaps?.[task.id] ?? [];
      const objectiveGps = metadataStore.objectiveGPS?.[task.id] ?? [];
      task.objectives.forEach((obj) => {
        if (tarkovStore.isTaskObjectiveComplete(obj.id) && !shouldShowCompletedObjectives.value)
          return;
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
            users: ['self'],
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
  useTaskRouteSync({ maps, traders: sortedTraders });
  const refreshVisibleTasks = () => {
    const options: TaskFilterAndSortOptions = {
      primaryView: getTaskPrimaryView.value as TaskPrimaryView,
      secondaryView: getTaskSecondaryView.value as TaskSecondaryView,
      userView: getTaskUserView.value,
      mapView: getTaskMapView.value,
      traderView: getTaskTraderView.value,
      mergedMaps: mergedMaps.value,
      sortMode: getTaskSortMode.value,
      sortDirection: getTaskSortDirection.value,
    };
    try {
      updateVisibleTasks(options, tasksLoading.value);
    } catch (error) {
      logger.error('[Tasks] Failed to refresh tasks:', error);
    }
  };
  const debouncedRefreshVisibleTasks = debounce(() => {
    refreshVisibleTasks();
  }, 50);
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
      getPinnedTaskIds,
      tasksLoading,
      tasks,
      maps,
      tasksCompletions,
      unlockedTasks,
      tasksFailed,
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
  const filteredTasks = computed((): Task[] => {
    if (!normalizedSearch.value) {
      return visibleTasks.value;
    }
    const query = normalizedSearch.value;
    const scored = visibleTasks.value
      .map((task) => ({
        task,
        score: fuzzyMatchScore(task.name ?? '', query),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map(({ task }) => task);
  });
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
  provide('jumpToMapObjective', jumpToMapObjective);
  provide('isMapView', showMapDisplay);
  provide('impactEligibleTaskIds', impactEligibleTaskIds);
  provide('clearPinnedTask', clearPinnedTask);
  const INITIAL_BATCH = 4;
  const IDEAL_INITIAL_BATCH = 8;
  const BATCH_SIZE = 6;
  const visibleTaskCount = ref(INITIAL_BATCH);
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
    useScrollFallback: true,
  });
  onMounted(() => {
    const expandInitialBatch = () => {
      if (normalizedSearch.value || visibleTaskCount.value >= IDEAL_INITIAL_BATCH) return;
      visibleTaskCount.value = Math.min(IDEAL_INITIAL_BATCH, filteredTasks.value.length);
      nextTick(() => {
        checkAndLoadMore();
      });
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(expandInitialBatch, { timeout: 3000 });
    } else {
      setTimeout(expandInitialBatch, 750);
    }
  });
  watch(filteredTasks, () => {
    visibleTaskCount.value = INITIAL_BATCH;
    nextTick(() => {
      checkAndLoadMore();
    });
  });
  const taskListRef = ref<HTMLElement | null>(null);
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
