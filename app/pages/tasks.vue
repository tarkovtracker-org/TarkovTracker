<template>
  <div>
    <div class="px-4 py-6">
      <TaskLoadingState v-if="isLoading" />
      <div v-else>
        <!-- Task Filter Bar -->
        <TaskFilterBar v-model:search-query="searchQuery" />
        <!-- Map Display (shown when MAPS view is selected) -->
        <div v-if="showMapDisplay" ref="mapContainerRef" data-map-container class="mb-6">
          <div class="bg-surface-800/50 rounded-lg p-4">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-lg font-medium text-gray-200">
                {{ selectedMapData?.name || 'Map' }}
                <span class="ml-2 text-sm font-normal text-gray-400">
                  {{ displayTime }}
                </span>
              </h3>
            </div>
            <LeafletMapComponent
              v-if="selectedMapData"
              ref="leafletMapRef"
              :map="selectedMapData"
              :marks="mapObjectiveMarks"
              :show-extracts="true"
              :show-extract-toggle="true"
              :show-legend="true"
            />
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
          <!-- Pinned/Selected Task (shown separately at top with visual distinction) -->
          <div v-if="pinnedTask" class="mb-6">
            <div class="text-primary-400 mb-2 flex items-center gap-2 text-xs">
              <UIcon name="i-mdi-pin" class="h-4 w-4" />
              <span>{{ t('page.tasks.selectedTask', 'Selected Task') }}</span>
              <button
                type="button"
                class="ml-auto rounded p-1 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                :aria-label="t('generic.dismiss', 'Dismiss')"
                @click="clearPinnedTaskAndClosePopup"
              >
                <UIcon name="i-mdi-close" class="h-4 w-4" />
              </button>
            </div>
            <div :id="`task-${pinnedTask.id}`" class="pinned-task-wrapper pb-4">
              <TaskCard
                :key="`pinned-${pinnedTask.id}`"
                :task="pinnedTask"
                @on-task-action="onTaskAction"
              />
            </div>
            <!-- Separator -->
            <div class="border-t border-white/10" />
          </div>
          <!-- Regular task list -->
          <div
            v-for="task in unpinnedTasksSlice"
            :id="pinnedTask?.id === task.id ? undefined : `task-${task.id}`"
            :key="task.id"
            class="pb-4"
            style="content-visibility: auto; contain-intrinsic-size: auto 280px"
          >
            <TaskCard :task="task" @on-task-action="onTaskAction" />
          </div>
          <div
            v-if="visibleTaskCount < filteredTasks.length"
            ref="loadMoreSentinel"
            class="flex items-center justify-center py-4"
          >
            <UIcon name="i-mdi-loading" class="h-5 w-5 animate-spin text-gray-400" />
          </div>
        </div>
      </div>
    </div>
    <!-- Floating scroll buttons -->
    <Teleport to="body">
      <!-- Scroll to Map button (floating at top, only in maps view) -->
      <Transition
        enter-active-class="transition ease-out duration-200"
        enter-from-class="opacity-0 -translate-y-3"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition ease-in duration-150"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-3"
      >
        <div
          v-if="showMapDisplay && showScrollToMapButton"
          class="fixed top-20 left-1/2 z-40 -translate-x-1/2"
        >
          <button
            type="button"
            class="bg-primary-600 hover:bg-primary-500 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:shadow-xl"
            @click="scrollToMap"
          >
            <UIcon name="i-mdi-map" class="h-4 w-4" />
            <span>{{ t('page.tasks.scrollToMap', 'Scroll to Map') }}</span>
            <UIcon name="i-mdi-arrow-up" class="h-4 w-4" />
          </button>
        </div>
      </Transition>
      <!-- Scroll to Top button (floating at bottom right) -->
      <Transition
        enter-active-class="transition ease-out duration-200"
        enter-from-class="opacity-0 translate-y-3"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition ease-in duration-150"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-3"
      >
        <button
          v-if="showScrollToTopButton"
          type="button"
          class="fixed right-6 bottom-20 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-white/20 hover:shadow-xl"
          :aria-label="t('page.tasks.scrollToTop', 'Scroll to top')"
          @click="scrollToTop"
        >
          <UIcon name="i-mdi-arrow-up" class="h-6 w-6" />
        </button>
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
  import {
    computed,
    defineAsyncComponent,
    nextTick,
    onBeforeUnmount,
    onMounted,
    provide,
    ref,
    watch,
  } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    useRoute,
    useRouter,
    type LocationQuery,
    type LocationQueryRaw,
    type LocationQueryValue,
  } from 'vue-router';
  import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
  import { useTarkovTime } from '@/composables/useTarkovTime';
  import { useTaskFiltering } from '@/composables/useTaskFiltering';
  import TaskCard from '@/features/tasks/TaskCard.vue';
  import TaskEmptyState from '@/features/tasks/TaskEmptyState.vue';
  import TaskLoadingState from '@/features/tasks/TaskLoadingState.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { Task, TaskObjective } from '@/types/tarkov';
  import { debounce, isDebounceRejection } from '@/utils/debounce';
  import { logger } from '@/utils/logger';
  import { splitSearchTokens } from '@/utils/search';
  // Route meta for layout behavior
  definePageMeta({
    usesWindowScroll: true,
  });
  // Lazy load LeafletMap for performance
  const LeafletMapComponent = defineAsyncComponent(() => import('@/features/maps/LeafletMap.vue'));
  // Page metadata
  useSeoMeta({
    title: 'Tasks',
    description:
      'Track your Escape from Tarkov quest progress. View quest objectives, rewards, and dependencies for both PVP and PVE game modes.',
  });
  const route = useRoute();
  const router = useRouter();
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
    getHideGlobalTasks,
    getHideNonKappaTasks,
    getShowNonSpecialTasks,
    getShowLightkeeperTasks,
  } = storeToRefs(preferencesStore);
  const metadataStore = useMetadataStore();
  const { tasks, loading: tasksLoading } = storeToRefs(metadataStore);
  // Use mapsWithSvg getter to get maps with merged SVG config from maps.json
  const maps = computed(() => metadataStore.mapsWithSvg);
  const sortedTraders = computed(() => metadataStore.sortedTraders);
  // Edition data for filtering (reactive to trigger refresh when edition changes)
  const editions = computed(() => metadataStore.editions);
  const progressStore = useProgressStore();
  const { tasksCompletions, unlockedTasks, tasksFailed } = storeToRefs(progressStore);
  const { visibleTasks, reloadingTasks, updateVisibleTasks } = useTaskFiltering();
  const tarkovStore = useTarkovStore();
  // Game edition for filtering (reactive to trigger refresh when edition changes)
  const userGameEdition = computed(() => tarkovStore.getGameEdition());
  const { tarkovTime } = useTarkovTime();
  // Maps with static/fixed raid times (don't follow normal day/night cycle)
  const STATIC_TIME_MAPS: Record<string, string> = {
    '55f2d3fd4bdc2d5f408b4567': '15:28 / 03:28', // Factory
    '5b0fc42d86f7744a585f9105': '15:28 / 03:28', // The Lab
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
  // Map display state
  const showMapDisplay = computed(() => {
    return getTaskPrimaryView.value === 'maps' && getTaskMapView.value !== 'all';
  });
  // Determines if completed objectives should be rendered on the component map
  const shouldShowCompletedObjectives = computed(() => {
    return ['completed', 'all'].includes(getTaskSecondaryView.value);
  });
  const selectedMapData = computed(() => {
    const mapId = getTaskMapView.value;
    if (!mapId || mapId === 'all') return null;
    return maps.value.find((m) => m.id === mapId) || null;
  });
  // Display time - use static time for certain maps, dynamic for others
  const displayTime = computed(() => {
    const mapId = getTaskMapView.value;
    if (!mapId) return tarkovTime.value;
    const staticTime = STATIC_TIME_MAPS[mapId];
    return staticTime ?? tarkovTime.value;
  });
  // Compute objective markers from visible tasks for the selected map
  const mapObjectiveMarks = computed(() => {
    if (!selectedMapData.value) return [];
    const mapId = selectedMapData.value.id;
    const marks: MapObjectiveMark[] = [];
    // Get objectives from visible tasks that have location data for this map
    visibleTasks.value.forEach((task) => {
      if (!task.objectives) return;
      const objectiveMaps = metadataStore.objectiveMaps?.[task.id] ?? [];
      const objectiveGps = metadataStore.objectiveGPS?.[task.id] ?? [];
      task.objectives.forEach((obj) => {
        // Skip objectives that are already marked as complete, unless the current filter allows them
        if (tarkovStore.isTaskObjectiveComplete(obj.id) && !shouldShowCompletedObjectives.value)
          return;
        const zones: MapObjectiveZone[] = [];
        const possibleLocations: MapObjectiveLocation[] = [];
        const objectiveWithLocations = obj as TaskObjective & {
          zones?: Array<{
            map?: { id: string };
            outline?: Array<{ x: number; y?: number; z: number }>;
            position?: { x: number; y?: number; z: number };
          }>;
          possibleLocations?: Array<{
            map?: { id: string };
            positions?: Array<{ x: number; y?: number; z: number }>;
          }>;
        };
        // Zones (polygons)
        if (Array.isArray(objectiveWithLocations.zones)) {
          objectiveWithLocations.zones.forEach((zone) => {
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
        // Possible locations (point markers)
        if (Array.isArray(objectiveWithLocations.possibleLocations)) {
          objectiveWithLocations.possibleLocations.forEach((location) => {
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
        // GPS fallback from processed metadata (legacy/objective overlay data)
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
  // Toast / Undo State
  const taskStatusUpdated = ref(false);
  const taskStatus = ref('');
  const undoData = ref<{
    taskId: string;
    taskName: string;
    action: string;
  } | null>(null);
  const showUndoButton = ref(false);
  const notificationTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const mergedMaps = computed(() => {
    return (maps.value || []).map((map) => ({
      id: map.id,
      name: map.name,
      mergedIds: (map as unknown as { mergedIds?: string[] }).mergedIds || [map.id],
    }));
  });
  const lightkeeperTraderId = computed(() => metadataStore.getTraderByName('lightkeeper')?.id);
  const TASK_PRIMARY_VIEWS = ['all', 'maps', 'traders'] as const;
  type TaskPrimaryView = (typeof TASK_PRIMARY_VIEWS)[number];
  const isTaskPrimaryView = (value: unknown): value is TaskPrimaryView => {
    return typeof value === 'string' && TASK_PRIMARY_VIEWS.includes(value as TaskPrimaryView);
  };
  const getQueryString = (
    value: LocationQueryValue | LocationQueryValue[] | undefined
  ): string | undefined => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      const firstValue = value.find((entry): entry is string => typeof entry === 'string');
      return firstValue;
    }
    return undefined;
  };
  type QueryLike = LocationQuery | LocationQueryRaw;
  const normalizeQuery = (query: QueryLike): string => {
    const normalized: Record<string, string> = {};
    Object.keys(query)
      .sort()
      .forEach((key) => {
        const value = query[key];
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value)) {
          const entries = value.filter(
            (entry): entry is string | number => entry !== undefined && entry !== null
          );
          const nonEmptyEntries = entries.filter((entry) =>
            typeof entry === 'string' ? entry !== '' : true
          );
          if (nonEmptyEntries.length === 0) return;
          normalized[key] = nonEmptyEntries.map(String).join(',');
          return;
        }
        normalized[key] = String(value);
      });
    return JSON.stringify(normalized);
  };
  const buildViewQuery = (
    primaryView: TaskPrimaryView,
    mapView: string,
    traderView: string
  ): LocationQueryRaw => {
    const nextQuery: LocationQueryRaw = { ...route.query };
    if (primaryView === 'maps') {
      nextQuery.view = 'maps';
      nextQuery.map = mapView !== 'all' ? mapView : undefined;
      nextQuery.trader = undefined;
      return nextQuery;
    }
    if (primaryView === 'traders') {
      nextQuery.view = 'traders';
      nextQuery.trader = traderView !== 'all' ? traderView : undefined;
      nextQuery.map = undefined;
      return nextQuery;
    }
    nextQuery.view = 'all';
    nextQuery.map = undefined;
    nextQuery.trader = undefined;
    return nextQuery;
  };
  const isSyncingFromRoute = ref(false);
  const isSyncingToRoute = ref(false);
  const hasInitializedRouteSync = ref(false);
  const syncRoute = (nextQuery: LocationQueryRaw, replace = false) => {
    if (isSyncingToRoute.value) return;
    if (normalizeQuery(route.query) === normalizeQuery(nextQuery)) return;
    isSyncingToRoute.value = true;
    const method = replace ? 'replace' : 'push';
    void router[method]({ query: nextQuery }).finally(() => {
      isSyncingToRoute.value = false;
    });
  };
  const syncStateFromRoute = () => {
    if (isSyncingToRoute.value) return;
    const viewParam = getQueryString(route.query.view);
    const mapParam = getQueryString(route.query.map);
    const traderParam = getQueryString(route.query.trader);
    const normalizedView = isTaskPrimaryView(viewParam) ? viewParam : undefined;
    if (!hasInitializedRouteSync.value) {
      hasInitializedRouteSync.value = true;
      if (!normalizedView) {
        const storedView = isTaskPrimaryView(preferencesStore.getTaskPrimaryView)
          ? preferencesStore.getTaskPrimaryView
          : 'all';
        syncRoute(
          buildViewQuery(
            storedView,
            preferencesStore.getTaskMapView,
            preferencesStore.getTaskTraderView
          ),
          true
        );
        return;
      }
    }
    const targetView = normalizedView ?? 'all';
    isSyncingFromRoute.value = true;
    if (targetView !== preferencesStore.getTaskPrimaryView) {
      preferencesStore.setTaskPrimaryView(targetView);
    }
    if (targetView === 'maps') {
      const mapId = maps.value.some((map) => map.id === mapParam) ? mapParam : maps.value[0]?.id;
      if (mapId && mapId !== preferencesStore.getTaskMapView) {
        preferencesStore.setTaskMapView(mapId);
      }
    }
    if (targetView === 'traders') {
      const traderId = sortedTraders.value.some((trader) => trader.id === traderParam)
        ? traderParam
        : sortedTraders.value[0]?.id;
      if (traderId && traderId !== preferencesStore.getTaskTraderView) {
        preferencesStore.setTaskTraderView(traderId);
      }
    }
    isSyncingFromRoute.value = false;
  };
  watch(
    [
      () => route.query.view,
      () => route.query.map,
      () => route.query.trader,
      () => maps.value.length,
      () => sortedTraders.value.length,
    ],
    () => {
      syncStateFromRoute();
    },
    { immediate: true }
  );
  watch(
    [getTaskPrimaryView, getTaskMapView, getTaskTraderView],
    ([primaryView, mapView, traderView], [prevPrimaryView]) => {
      if (isSyncingFromRoute.value) return;
      const normalizedPrimary = isTaskPrimaryView(primaryView) ? primaryView : 'all';
      const shouldReplace = normalizedPrimary === prevPrimaryView;
      syncRoute(buildViewQuery(normalizedPrimary, mapView, traderView), shouldReplace);
    }
  );
  const refreshVisibleTasks = () => {
    updateVisibleTasks(
      getTaskPrimaryView.value,
      getTaskSecondaryView.value,
      getTaskUserView.value,
      getTaskMapView.value,
      getTaskTraderView.value,
      mergedMaps.value,
      tasksLoading.value,
      getTaskSortMode.value,
      getTaskSortDirection.value
    ).catch((error) => {
      logger.error('[Tasks] Failed to refresh tasks:', error);
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
      getHideGlobalTasks,
      getHideNonKappaTasks,
      getShowNonSpecialTasks,
      getShowLightkeeperTasks,
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
      refreshVisibleTasks();
    },
    { immediate: true }
  );
  const isLoading = computed(
    () => !metadataStore.hasInitialized || tasksLoading.value || reloadingTasks.value
  );
  // Search state (debounced to reduce lag)
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
  const searchTokens = computed(() => splitSearchTokens(debouncedSearch.value));
  // Cache lowercase task names to avoid repeated toLowerCase() calls in filter
  type TaskWithLowerName = Task & { _lowerName: string };
  const tasksWithLowerName = computed((): TaskWithLowerName[] => {
    return visibleTasks.value.map((task) => ({
      ...task,
      _lowerName: (task.name ?? '').toLowerCase(),
    }));
  });
  // Filter tasks by search query - all tokens must be present in the task name
  const filteredTasks = computed((): Task[] => {
    const tokens = searchTokens.value;
    if (tokens.length === 0) {
      return visibleTasks.value;
    }
    return tasksWithLowerName.value.filter((task) =>
      tokens.every((token) => task._lowerName.includes(token))
    ) as Task[];
  });
  const pinnedTaskId = ref<string | null>(null);
  const pinnedTask = computed(() => {
    if (!pinnedTaskId.value) return null;
    return filteredTasks.value.find((task) => task.id === pinnedTaskId.value) ?? null;
  });
  const clearPinnedTask = () => {
    pinnedTaskId.value = null;
  };
  const clearPinnedTaskAndClosePopup = () => {
    clearPinnedTask();
    // Also close the map tooltip and deselect the marker
    leafletMapRef.value?.closeActivePopup();
  };
  // Progressive rendering - load tasks incrementally for smooth scrolling
  const INITIAL_BATCH = 15;
  const BATCH_SIZE = 10;
  /**
   * Timing constants (in milliseconds) for task navigation and highlighting
   */
  const SCROLL_TO_MAP_POPUP_DELAY = 150; // Delay before activating popup after scrolling to map
  const ELEMENT_WAIT_RETRY_DELAY = 50; // Delay between retries when waiting for DOM element
  const HIGHLIGHT_SETTLE_DELAY = 100; // Delay to let element settle before highlighting
  const HIGHLIGHT_DURATION = 3500; // How long the highlight animation stays visible
  const POPUP_ACTIVATE_RETRY_DELAY = 150;
  const POPUP_ACTIVATE_MAX_ATTEMPTS = 6;
  const visibleTaskCount = ref(INITIAL_BATCH);
  const loadMoreSentinel = ref<HTMLElement | null>(null);
  // Flag to prevent visibleTaskCount reset during task navigation (e.g., from map tooltip)
  const isNavigatingToTask = ref(false);
  // Tasks slice excluding the pinned task (shown separately)
  const unpinnedTasksSlice = computed(() => {
    const tasks = pinnedTask.value
      ? filteredTasks.value.filter((task) => task.id !== pinnedTask.value?.id)
      : filteredTasks.value;
    return tasks.slice(0, visibleTaskCount.value);
  });
  const hasMoreTasks = computed(() => visibleTaskCount.value < filteredTasks.value.length);
  const loadMoreTasks = () => {
    if (!hasMoreTasks.value) return;
    visibleTaskCount.value = Math.min(
      visibleTaskCount.value + BATCH_SIZE,
      filteredTasks.value.length
    );
  };
  // Use shared infinite scroll composable
  const { checkAndLoadMore } = useInfiniteScroll(loadMoreSentinel, loadMoreTasks, {
    enabled: hasMoreTasks,
    useScrollFallback: true,
  });
  // Reset visible count when filters change (but not during scroll-to-task)
  watch(filteredTasks, () => {
    if (!isNavigatingToTask.value) {
      visibleTaskCount.value = INITIAL_BATCH;
    }
    if (pinnedTaskId.value && !filteredTasks.value.some((task) => task.id === pinnedTaskId.value)) {
      pinnedTaskId.value = null;
    }
    nextTick(() => {
      checkAndLoadMore();
    });
  });
  const taskListRef = ref<HTMLElement | null>(null);
  const mapContainerRef = ref<HTMLElement | null>(null);
  const leafletMapRef = ref<{
    activateObjectivePopup: (id: string) => boolean;
    closeActivePopup: () => void;
  } | null>(null);
  // Scroll position tracking for floating buttons
  const scrollY = ref(0);
  const showScrollToTopButton = computed(() => scrollY.value > 400);
  const showScrollToMapButton = computed(() => scrollY.value > 300);
  const handleScroll = () => {
    scrollY.value = window.scrollY;
  };
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // Alias for semantic clarity - scrolls to top where the map is located
  const scrollToMap = scrollToTop;
  let jumpToMapTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let waitForElementAbortController: AbortController | null = null;
  const popupActivateTimers = ref<ReturnType<typeof setTimeout>[]>([]);
  /**
   * Finds which map an objective is on (for map switching).
   * Checks zones, possibleLocations, and GPS fallback.
   */
  const findObjectiveMapId = (objectiveId: string): string | null => {
    const objective = metadataStore.objectives.find((o) => o.id === objectiveId);
    if (!objective) return null;
    const taskId = objective.taskId;
    if (!taskId) return null;
    // Check zones
    const objWithZones = objective as typeof objective & {
      zones?: Array<{ map?: { id: string } }>;
    };
    if (objWithZones.zones?.length) {
      const zoneMapId = objWithZones.zones[0]?.map?.id;
      if (zoneMapId) return zoneMapId;
    }
    // Check possibleLocations
    const objWithLocs = objective as typeof objective & {
      possibleLocations?: Array<{ map?: { id: string } }>;
    };
    if (objWithLocs.possibleLocations?.length) {
      const locMapId = objWithLocs.possibleLocations[0]?.map?.id;
      if (locMapId) return locMapId;
    }
    // Check GPS fallback via objectiveMaps
    const objectiveMapsForTask = metadataStore.objectiveMaps?.[taskId] ?? [];
    const mapInfo = objectiveMapsForTask.find((m) => m.objectiveID === objectiveId);
    if (mapInfo?.mapID) return mapInfo.mapID;
    return null;
  };
  /**
   * Scrolls to the map and activates the popup for a specific objective.
   * Switches to the correct map if needed.
   * Used by TaskObjective's "Jump to map" button.
   */
  const clearPopupActivateTimers = () => {
    popupActivateTimers.value.forEach((timerId) => clearTimeout(timerId));
    popupActivateTimers.value = [];
  };
  const activateObjectivePopupWithRetry = (objectiveId: string) => {
    clearPopupActivateTimers();
    let attempts = 0;
    const tryActivate = () => {
      const success = leafletMapRef.value?.activateObjectivePopup(objectiveId);
      if (success) return;
      attempts += 1;
      if (attempts > POPUP_ACTIVATE_MAX_ATTEMPTS) return;
      const timerId = setTimeout(tryActivate, POPUP_ACTIVATE_RETRY_DELAY);
      popupActivateTimers.value.push(timerId);
    };
    tryActivate();
  };
  const jumpToMapObjective = async (objectiveId: string) => {
    // Clear any pending jumpToMap timeout
    if (jumpToMapTimeoutId) {
      clearTimeout(jumpToMapTimeoutId);
      jumpToMapTimeoutId = null;
    }
    // Find which map this objective is on
    const targetMapId = findObjectiveMapId(objectiveId);
    const currentMapId = getTaskMapView.value;
    // Switch map if needed
    if (targetMapId && targetMapId !== currentMapId) {
      preferencesStore.setTaskMapView(targetMapId);
      await nextTick();
      // Wait a bit for map to re-render with new markers
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // Always scroll to map first
    const isNearTop = window.scrollY < 100;
    if (!isNearTop) {
      scrollToMap();
    }
    // Try to activate popup, with retry after delay if scroll needed
    if (isNearTop) {
      activateObjectivePopupWithRetry(objectiveId);
    } else {
      jumpToMapTimeoutId = setTimeout(() => {
        jumpToMapTimeoutId = null;
        activateObjectivePopupWithRetry(objectiveId);
      }, SCROLL_TO_MAP_POPUP_DELAY);
    }
  };
  // Provide functions for child components
  provide('jumpToMapObjective', jumpToMapObjective);
  provide('isMapView', showMapDisplay);
  provide('clearPinnedTask', clearPinnedTask);
  // Set up scroll listener
  onMounted(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initialize
  });
  // Handle deep linking to a specific task via ?task=taskId query param
  const getTaskStatus = (taskId: string): 'available' | 'locked' | 'completed' | 'failed' => {
    const isFailed = tasksFailed.value?.[taskId]?.['self'] ?? false;
    if (isFailed) return 'failed';
    const isCompleted = tasksCompletions.value?.[taskId]?.['self'] ?? false;
    if (isCompleted) return 'completed';
    const isUnlocked = unlockedTasks.value?.[taskId]?.['self'] ?? false;
    if (isUnlocked) return 'available';
    return 'locked';
  };
  // Track highlightObjective timers (can have multiple nested timeouts)
  const highlightObjectiveTimers = ref<ReturnType<typeof setTimeout>[]>([]);
  // Track IntersectionObserver instances for cleanup
  const activeObservers = ref<IntersectionObserver[]>([]);
  onBeforeUnmount(() => {
    updateDebouncedSearch.cancel();
    window.removeEventListener('scroll', handleScroll);
    // Clear highlightObjective timers
    highlightObjectiveTimers.value.forEach((timerId) => clearTimeout(timerId));
    highlightObjectiveTimers.value = [];
    // Disconnect all active IntersectionObservers
    activeObservers.value.forEach((observer) => observer.disconnect());
    activeObservers.value = [];
    // Clear jumpToMapObjective timeout
    if (jumpToMapTimeoutId) {
      clearTimeout(jumpToMapTimeoutId);
      jumpToMapTimeoutId = null;
    }
    clearPopupActivateTimers();
    // Abort any pending waitForElement calls
    if (waitForElementAbortController) {
      waitForElementAbortController.abort();
      waitForElementAbortController = null;
    }
  });
  /**
   * Waits for an element to appear in the DOM using Vue's nextTick.
   * More reliable than requestAnimationFrame for Vue-rendered content.
   * Uses AbortController to allow cancellation on component unmount.
   */
  const waitForElement = async (
    elementId: string,
    maxAttempts = 50
  ): Promise<HTMLElement | null> => {
    // Cancel any previous waitForElement call
    if (waitForElementAbortController) {
      waitForElementAbortController.abort();
    }
    waitForElementAbortController = new AbortController();
    const signal = waitForElementAbortController.signal;
    for (let i = 0; i < maxAttempts; i++) {
      // Check if aborted
      if (signal.aborted) return null;
      await nextTick();
      // First try by ID
      const el = document.getElementById(elementId);
      if (el) {
        return el;
      }
      // For objectives in item groups, also search by data-objective-ids attribute
      // Item groups consolidate multiple objectives, so the ID might not be the primary one
      if (elementId.startsWith('objective-')) {
        const objectiveId = elementId.replace('objective-', '');
        const elByData = document.querySelector<HTMLElement>(
          `[data-objective-ids*="${objectiveId}"]`
        );
        if (elByData) {
          return elByData;
        }
      }
      // Small delay between attempts to let Vue batch updates
      await new Promise<void>((resolve) => {
        const timerId = setTimeout(() => resolve(), ELEMENT_WAIT_RETRY_DELAY);
        // If aborted during wait, resolve immediately and clear timeout
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timerId);
            resolve();
          },
          { once: true }
        );
      });
    }
    return null;
  };
  /**
   * Pins a task to the top of the task list.
   * Always pins regardless of current visibility to keep behavior consistent.
   */
  const pinTask = async (taskId: string) => {
    await nextTick();
    const taskIndex = filteredTasks.value.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return;
    pinnedTaskId.value = taskId;
  };
  /**
   * Applies objective-highlight class to an element when it becomes visible.
   */
  const highlightObjectiveWhenVisible = (element: HTMLElement) => {
    // Clear any existing highlightObjective timers
    highlightObjectiveTimers.value.forEach((timerId) => clearTimeout(timerId));
    highlightObjectiveTimers.value = [];
    // Disconnect any existing observers
    activeObservers.value.forEach((obs) => obs.disconnect());
    activeObservers.value = [];
    // Clear any existing highlights from other elements
    document.querySelectorAll('.objective-highlight').forEach((el) => {
      el.classList.remove('objective-highlight');
    });
    const applyHighlight = () => {
      element.classList.add('objective-highlight');
      const removeTimer = setTimeout(() => {
        element.classList.remove('objective-highlight');
      }, HIGHLIGHT_DURATION);
      highlightObjectiveTimers.value.push(removeTimer);
    };
    // Always scroll to element to ensure visibility (user may be viewing map above)
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Check if already in view (scroll may be instant if nearby)
    const rect = element.getBoundingClientRect();
    const isInView = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (isInView) {
      applyHighlight();
      return;
    }
    // Wait for element to become visible after scroll
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          observer.disconnect();
          // Remove from tracked observers
          const idx = activeObservers.value.indexOf(observer);
          if (idx !== -1) activeObservers.value.splice(idx, 1);
          // Small delay to let element settle (tracked for cleanup)
          const settleTimer = setTimeout(applyHighlight, HIGHLIGHT_SETTLE_DELAY);
          highlightObjectiveTimers.value.push(settleTimer);
        }
      },
      { threshold: 0.5 }
    );
    // Track observer for cleanup on unmount
    activeObservers.value.push(observer);
    observer.observe(element);
    // Cleanup observer after timeout
    const cleanupTimer = setTimeout(() => {
      observer.disconnect();
      const idx = activeObservers.value.indexOf(observer);
      if (idx !== -1) activeObservers.value.splice(idx, 1);
    }, 5000);
    highlightObjectiveTimers.value.push(cleanupTimer);
  };
  /**
   * Highlights a specific objective within a task.
   * Task should already be pinned before calling this.
   */
  const highlightObjective = async (objectiveId: string) => {
    // Clear any existing highlightObjective timers before starting new ones
    highlightObjectiveTimers.value.forEach((timerId) => clearTimeout(timerId));
    highlightObjectiveTimers.value = [];
    // Wait for objective element to appear in DOM (only highlight objectives, never task cards)
    const objectiveEl = await waitForElement(`objective-${objectiveId}`, 30);
    if (!objectiveEl) return;
    highlightObjectiveWhenVisible(objectiveEl);
  };
  const handleTaskQueryParam = async () => {
    const taskId = getQueryString(route.query.task);
    const objectiveIdToHighlight = getQueryString(route.query.highlightObjective);
    if (!taskId || tasksLoading.value) return;
    const taskInMetadata = tasks.value.find((t) => t.id === taskId);
    if (!taskInMetadata) return;
    // Set flag to prevent filter watch from resetting visibleTaskCount during navigation
    isNavigatingToTask.value = true;
    try {
      // If highlighting from map tooltip, only clear search (keep current filters)
      // Otherwise, adjust all filters to ensure task visibility
      const isMapHighlight = !!objectiveIdToHighlight;
      // Always clear search query so the target task is visible
      if (searchQuery.value) {
        searchQuery.value = '';
      }
      if (!isMapHighlight) {
        // Enable the appropriate type filter based on task properties
        const isKappaRequired = taskInMetadata.kappaRequired === true;
        const isLightkeeperRequired = taskInMetadata.lightkeeperRequired === true;
        const isLightkeeperTraderTask =
          lightkeeperTraderId.value !== undefined
            ? taskInMetadata.trader?.id === lightkeeperTraderId.value
            : taskInMetadata.trader?.name?.toLowerCase() === 'lightkeeper';
        const isNonSpecial = !isKappaRequired && !isLightkeeperRequired && !isLightkeeperTraderTask;
        // Ensure the task's type filter is enabled so task will appear
        if (
          (isLightkeeperRequired || isLightkeeperTraderTask) &&
          !preferencesStore.getShowLightkeeperTasks
        ) {
          preferencesStore.setShowLightkeeperTasks(true);
        }
        if (isKappaRequired && preferencesStore.getHideNonKappaTasks) {
          preferencesStore.setHideNonKappaTasks(false);
        }
        if (isNonSpecial && !preferencesStore.getShowNonSpecialTasks) {
          preferencesStore.setShowNonSpecialTasks(true);
        }
        // Determine task status and set appropriate filter
        // Skip if already in 'all' view since all tasks are visible there
        const currentSecondaryView = preferencesStore.getTaskSecondaryView;
        if (currentSecondaryView !== 'all') {
          const status = getTaskStatus(taskId);
          if (currentSecondaryView !== status) {
            preferencesStore.setTaskSecondaryView(status);
          }
        }
        // Set primary view to 'all' to ensure the task is visible regardless of map/trader
        if (preferencesStore.getTaskPrimaryView !== 'all') {
          preferencesStore.setTaskPrimaryView('all');
        }
      }
      // Wait for filter/watch updates to settle
      await nextTick();
      // Pin the task to the top for consistent behavior
      await pinTask(taskId);
      // Highlight specific objective if requested
      if (objectiveIdToHighlight) {
        highlightObjective(objectiveIdToHighlight);
        // Also activate the map marker to keep map and list selection coupled
        leafletMapRef.value?.activateObjectivePopup(objectiveIdToHighlight);
      }
    } finally {
      isNavigatingToTask.value = false;
    }
    // Clear the query params to avoid re-triggering on filter changes
    const nextQuery = { ...route.query } as Record<string, string | string[] | undefined>;
    delete nextQuery.task;
    delete nextQuery.highlightObjective;
    router.replace({ query: nextQuery });
  };
  // Watch for task query param and handle it when tasks are loaded
  watch(
    [() => route.query.task, () => route.query.highlightObjective, tasksLoading, tasksCompletions],
    ([taskQueryParam, , loading]) => {
      if (taskQueryParam && !loading) {
        handleTaskQueryParam();
      }
    },
    { immediate: true }
  );
  // Helper Methods for Undo
  const handleTaskObjectives = (
    objectives: TaskObjective[],
    action: 'setTaskObjectiveComplete' | 'setTaskObjectiveUncomplete'
  ) => {
    objectives.forEach((o) => {
      if (action === 'setTaskObjectiveComplete') {
        tarkovStore.setTaskObjectiveComplete(o.id);
        // When completing objectives, also set the count to the required amount
        if (o.count !== undefined && o.count > 0) {
          tarkovStore.setObjectiveCount(o.id, o.count);
        }
      } else {
        // When uncompleting, only uncomplete if count is below the required amount
        const currentCount = tarkovStore.getObjectiveCount(o.id);
        const requiredCount = o.count ?? 1;
        if (currentCount < requiredCount) {
          tarkovStore.setTaskObjectiveUncomplete(o.id);
        }
      }
    });
  };
  const clearTaskObjectives = (objectives: TaskObjective[]) => {
    objectives.forEach((objective) => {
      if (!objective?.id) return;
      tarkovStore.setTaskObjectiveUncomplete(objective.id);
      const currentCount = tarkovStore.getObjectiveCount(objective.id);
      if ((objective.count ?? 0) > 0 || currentCount > 0) {
        tarkovStore.setObjectiveCount(objective.id, 0);
      }
    });
  };
  const handleAlternatives = (
    alternatives: string[] | undefined,
    taskAction: 'setTaskComplete' | 'setTaskUncompleted' | 'setTaskFailed',
    objectiveAction: 'setTaskObjectiveComplete' | 'setTaskObjectiveUncomplete'
  ) => {
    if (!Array.isArray(alternatives)) return;
    alternatives.forEach((a: string) => {
      if (taskAction === 'setTaskComplete') {
        tarkovStore.setTaskComplete(a);
      } else if (taskAction === 'setTaskUncompleted') {
        tarkovStore.setTaskUncompleted(a);
      } else if (taskAction === 'setTaskFailed') {
        tarkovStore.setTaskFailed(a);
      }
      const alternativeTask = tasks.value.find((task) => task.id === a);
      if (alternativeTask?.objectives) {
        if (taskAction === 'setTaskFailed') {
          clearTaskObjectives(alternativeTask.objectives);
        } else {
          handleTaskObjectives(alternativeTask.objectives, objectiveAction);
        }
      }
    });
  };
  const updateTaskStatus = (statusKey: string, taskName: string, showUndo = false) => {
    // Clear any existing timeout
    if (notificationTimeout.value !== null) {
      clearTimeout(notificationTimeout.value);
      notificationTimeout.value = null;
    }
    taskStatus.value = t(statusKey, { name: taskName });
    taskStatusUpdated.value = true;
    showUndoButton.value = showUndo;
    // Auto-close after 5 seconds (matching toast default timeout)
    notificationTimeout.value = setTimeout(() => {
      taskStatusUpdated.value = false;
      notificationTimeout.value = null;
    }, 5000);
  };
  const closeNotification = () => {
    if (notificationTimeout.value !== null) {
      clearTimeout(notificationTimeout.value);
      notificationTimeout.value = null;
    }
    taskStatusUpdated.value = false;
  };
  const onTaskAction = (event: {
    taskId: string;
    taskName: string;
    action: string;
    undoKey?: string;
    statusKey?: string;
  }) => {
    undoData.value = {
      taskId: event.taskId,
      taskName: event.taskName,
      action: event.action,
    };
    if (event.undoKey) {
      updateTaskStatus(event.undoKey, event.taskName, false);
    } else if (event.statusKey) {
      updateTaskStatus(event.statusKey, event.taskName, true);
    }
  };
  const undoLastAction = () => {
    if (!undoData.value) return;
    const { taskId, taskName, action } = undoData.value;
    if (action === 'complete') {
      // Undo completion by setting task as uncompleted
      tarkovStore.setTaskUncompleted(taskId);
      // Find the task to handle objectives and alternatives
      const taskToUndo = tasks.value.find((task) => task.id === taskId);
      if (taskToUndo?.objectives) {
        handleTaskObjectives(taskToUndo.objectives, 'setTaskObjectiveUncomplete');
        // Using taskToUndo with optional alternatives property
        handleAlternatives(
          (taskToUndo as Task & { alternatives?: string[] }).alternatives,
          'setTaskUncompleted',
          'setTaskObjectiveUncomplete'
        );
      }
      updateTaskStatus('page.tasks.questcard.undocomplete', taskName);
    } else if (action === 'uncomplete') {
      // Undo uncompleting by setting task as completed
      tarkovStore.setTaskComplete(taskId);
      // Find the task to handle objectives and alternatives
      const taskToUndo = tasks.value.find((task) => task.id === taskId);
      if (taskToUndo?.objectives) {
        handleTaskObjectives(taskToUndo.objectives, 'setTaskObjectiveComplete');
        // Using taskToUndo with optional alternatives property
        handleAlternatives(
          (taskToUndo as Task & { alternatives?: string[] }).alternatives,
          'setTaskFailed',
          'setTaskObjectiveComplete'
        );
        // Ensure min level for completion
        const minLevel = taskToUndo.minPlayerLevel;
        if (minLevel !== undefined && tarkovStore.playerLevel() < minLevel) {
          tarkovStore.setLevel(minLevel);
        }
      }
      updateTaskStatus('page.tasks.questcard.undouncomplete', taskName);
    } else if (action === 'resetfailed') {
      // Undo reset by restoring failed state (without altering alternatives)
      tarkovStore.setTaskFailed(taskId);
      const taskToUndo = tasks.value.find((task) => task.id === taskId);
      if (taskToUndo?.objectives) {
        clearTaskObjectives(taskToUndo.objectives);
      }
      updateTaskStatus('page.tasks.questcard.undoresetfailed', taskName);
    } else if (action === 'fail') {
      // Undo manual fail by clearing completion/failed flags
      tarkovStore.setTaskUncompleted(taskId);
      const taskToUndo = tasks.value.find((task) => task.id === taskId);
      if (taskToUndo?.objectives) {
        handleTaskObjectives(taskToUndo.objectives, 'setTaskObjectiveUncomplete');
      }
      updateTaskStatus('page.tasks.questcard.undofailed', taskName);
    }
    showUndoButton.value = false;
    undoData.value = null;
  };
</script>
