<template>
  <div>
    <div class="px-4 py-6">
      <TaskLoadingState v-if="isLoading" />
      <div v-else>
        <!-- Task Filter Bar -->
        <TaskFilterBar v-model:search-query="searchQuery" />
        <!-- Map Display (shown when MAPS view is selected) -->
        <div v-if="showMapDisplay" class="mb-6">
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
          <div
            v-for="task in visibleTasksSlice"
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
  import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue';
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
  const pinnedTaskTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const pinnedTask = computed(() => {
    if (!pinnedTaskId.value) return null;
    return filteredTasks.value.find((task) => task.id === pinnedTaskId.value) ?? null;
  });
  // Progressive rendering - load tasks incrementally for smooth scrolling
  const INITIAL_BATCH = 15;
  const BATCH_SIZE = 10;
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
  // Reset visible count when filters change
  watch(filteredTasks, () => {
    visibleTaskCount.value = INITIAL_BATCH;
    if (pinnedTaskId.value && !filteredTasks.value.some((task) => task.id === pinnedTaskId.value)) {
      pinnedTaskId.value = null;
    }
    nextTick(() => {
      checkAndLoadMore();
    });
  });
  const taskListRef = ref<HTMLElement | null>(null);
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
  const highlightTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const highlightTask = (taskElement: HTMLElement) => {
    taskElement.classList.add(
      'ring-2',
      'ring-primary-500',
      'ring-offset-2',
      'ring-offset-surface-900'
    );
    if (highlightTimeout.value) {
      clearTimeout(highlightTimeout.value);
    }
    highlightTimeout.value = setTimeout(() => {
      taskElement.classList.remove(
        'ring-2',
        'ring-primary-500',
        'ring-offset-2',
        'ring-offset-surface-900'
      );
      highlightTimeout.value = null;
    }, 2000);
  };
  onBeforeUnmount(() => {
    updateDebouncedSearch.cancel();
    if (highlightTimeout.value) {
      clearTimeout(highlightTimeout.value);
      highlightTimeout.value = null;
    }
    if (pinnedTaskTimeout.value) {
      clearTimeout(pinnedTaskTimeout.value);
      pinnedTaskTimeout.value = null;
    }
  });
  const scrollToTask = async (taskId: string) => {
    await nextTick();
    const taskIndex = filteredTasks.value.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return;
    const pinTaskToTop = () => {
      pinnedTaskId.value = taskId;
      if (pinnedTaskTimeout.value) {
        clearTimeout(pinnedTaskTimeout.value);
      }
      pinnedTaskTimeout.value = setTimeout(() => {
        pinnedTaskId.value = null;
        pinnedTaskTimeout.value = null;
      }, 8000);
    };
    // If task is already in DOM, scroll to it
    const taskElement = document.getElementById(`task-${taskId}`);
    if (taskElement) {
      const rect = taskElement.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (isVisible) {
        highlightTask(taskElement);
        return;
      }
      const nearbyThreshold = window.innerHeight * 1.5;
      const isNearby = Math.abs(rect.top) <= nearbyThreshold;
      if (isNearby) {
        taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightTask(taskElement);
        return;
      }
      pinTaskToTop();
      await nextTick();
      const pinnedElement = document.getElementById(`task-${taskId}`);
      if (pinnedElement) {
        highlightTask(pinnedElement);
      }
      return;
    }
    pinTaskToTop();
    await nextTick();
    const newTaskElement = document.getElementById(`task-${taskId}`);
    if (!newTaskElement) return;
    highlightTask(newTaskElement);
  };
  const handleTaskQueryParam = async () => {
    const taskId = getQueryString(route.query.task);
    if (!taskId || tasksLoading.value) return;
    const taskInMetadata = tasks.value.find((t) => t.id === taskId);
    if (!taskInMetadata) return;
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
    // Clear search query so the target task is visible
    if (searchQuery.value) {
      searchQuery.value = '';
    }
    // Wait for filter/watch updates to settle
    await nextTick();
    // scrollToTask handles scrolling directly via scrollIntoView
    await scrollToTask(taskId);
    // Clear the query param to avoid re-triggering on filter changes
    const nextQuery = { ...route.query } as Record<string, string | string[] | undefined>;
    delete nextQuery.task;
    router.replace({ query: nextQuery });
  };
  // Watch for task query param and handle it when tasks are loaded
  watch(
    [() => route.query.task, tasksLoading, tasksCompletions],
    ([taskQueryParam, loading]) => {
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
