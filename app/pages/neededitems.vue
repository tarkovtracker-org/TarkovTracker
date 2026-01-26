<template>
  <div class="px-4 py-6">
    <!-- Filter Bar -->
    <NeededItemsFilterBar
      v-model="activeFilter"
      v-model:search="search"
      v-model:view-mode="viewMode"
      v-model:fir-filter="firFilter"
      v-model:group-by-item="groupByItem"
      v-model:hide-non-fir-special-equipment="hideNonFirSpecialEquipment"
      v-model:hide-team-items="hideTeamItems"
      v-model:kappa-only="kappaOnly"
      :filter-tabs="filterTabsWithCounts"
      :total-count="displayItems.length"
      :ungrouped-count="filteredItems.length"
    />
    <!-- Items Container -->
    <UCard class="bg-contentbackground border border-white/5">
      <!-- Error state with retry button -->
      <div
        v-if="itemsError"
        class="text-surface-400 flex flex-col items-center justify-center gap-4 p-8"
      >
        <UIcon name="i-mdi-alert-circle" class="text-error-400 h-8 w-8" />
        <span class="text-error-400">
          {{ $t('page.neededitems.error', 'Failed to load items.') }}
        </span>
        <UButton color="primary" @click="ensureNeededItemsData">
          {{ $t('page.neededitems.retry', 'Retry') }}
        </UButton>
      </div>
      <!-- Loading state while items are being fetched -->
      <div
        v-else-if="!itemsReady"
        class="text-surface-400 flex items-center justify-center gap-2 p-8"
      >
        <UIcon name="i-mdi-loading" class="h-5 w-5 animate-spin" />
        <span>{{ $t('page.neededitems.loading', 'Loading items...') }}</span>
      </div>
      <template v-else>
        <div v-if="displayItems.length === 0" class="text-surface-400 p-8 text-center">
          {{ $t('page.neededitems.empty', 'No items match your search.') }}
        </div>
        <!-- Grouped View -->
        <div v-else-if="groupByItem" class="p-2">
          <div
            class="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            <NeededItemGroupedCard
              v-for="(group, index) in visibleGroupedItems"
              :key="group.item.id"
              :grouped-item="group"
              :active-filter="activeFilter"
              :data-index="index"
              class="h-full"
              style="content-visibility: auto; contain-intrinsic-size: auto 220px"
            />
          </div>
          <div
            v-if="visibleCount < displayItems.length"
            ref="gridSentinel"
            class="h-1 w-full"
          ></div>
        </div>
        <!-- List View -->
        <div v-else-if="viewMode === 'list'">
          <div
            v-for="(item, index) in visibleIndividualItems"
            :key="`${item.needType}-${item.id}`"
            class="border-b border-white/5 pb-1"
            style="content-visibility: auto; contain-intrinsic-size: auto 128px"
          >
            <NeededItem
              :need="item"
              item-style="row"
              :initially-visible="index < adjustedRenderCount"
            />
          </div>
          <div
            v-if="visibleCount < displayItems.length"
            ref="listSentinel"
            class="h-1 w-full"
          ></div>
        </div>
        <!-- Grid View -->
        <div v-else class="p-2">
          <div
            class="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            <NeededItem
              v-for="(item, index) in visibleIndividualItems"
              :key="`${item.needType}-${item.id}`"
              :need="item"
              item-style="card"
              :initially-visible="index < adjustedRenderCount"
              :data-index="index"
              class="h-full"
              style="content-visibility: auto; contain-intrinsic-size: auto 240px"
            />
          </div>
          <div
            v-if="visibleCount < displayItems.length"
            ref="gridSentinel"
            class="h-1 w-full"
          ></div>
        </div>
      </template>
    </UCard>
  </div>
</template>
<script setup lang="ts">
  import { storeToRefs } from 'pinia';
  import { computed, nextTick, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    useInfiniteScroll,
    type UseInfiniteScrollOptions,
  } from '@/composables/useInfiniteScroll';
  import { useSharedBreakpoints } from '@/composables/useSharedBreakpoints';
  import NeededItem from '@/features/neededitems/NeededItem.vue';
  import {
    getNeededItemData,
    getNeededItemId,
    isNonFirSpecialEquipment,
  } from '@/features/neededitems/neededItemFilters';
  import NeededItemGroupedCard from '@/features/neededitems/NeededItemGroupedCard.vue';
  import {
    BATCH_SIZE_GRID,
    BATCH_SIZE_LIST,
    DEFAULT_INITIAL_RENDER_COUNT,
    INFINITE_SCROLL_MARGIN,
    MIN_RENDER_COUNTS,
    SCREEN_SIZE_MULTIPLIERS,
  } from '@/features/neededitems/neededitems-constants';
  import type {
    NeededItemsFirFilter,
    NeededItemsFilterType,
  } from '@/features/neededitems/neededitems-constants';
  import NeededItemsFilterBar from '@/features/neededitems/NeededItemsFilterBar.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type {
    GroupedNeededItem,
    NeededItemHideoutModule,
    NeededItemTaskObjective,
  } from '@/types/tarkov';
  import { isTaskAvailableForEdition } from '@/utils/editionHelpers';
  import { logger } from '@/utils/logger';
  // Route meta for layout behavior
  definePageMeta({
    usesWindowScroll: true,
  });
  // Page metadata
  useSeoMeta({
    title: 'Needed Items',
    description:
      'View all items needed for your active quests and hideout upgrades. Filter by quest, craft, and find-in-raid requirements.',
  });
  const props = defineProps({
    baseRenderCount: {
      type: Number,
      default: DEFAULT_INITIAL_RENDER_COUNT,
      validator: (value: number) => Number.isFinite(value) && value > 0,
    },
  });
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const progressStore = useProgressStore();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const { neededItemTaskObjectives, neededItemHideoutModules, itemsFullLoaded, items } =
    storeToRefs(metadataStore);
  const { belowMd, xs } = useSharedBreakpoints();
  const ensureNeededItemsData = () => {
    if (!itemsLoaded.value && !metadataStore.itemsLoading) {
      void metadataStore.fetchItemsLiteData();
    }
    if (!metadataStore.tasksObjectivesHydrated && !metadataStore.tasksObjectivesPending) {
      void metadataStore.fetchTaskObjectivesData();
    }
    if (!metadataStore.hideoutStations.length && !metadataStore.hideoutLoading) {
      void metadataStore.fetchHideoutData();
    }
  };
  onMounted(() => {
    ensureNeededItemsData();
  });
  // View mode state with persistence (two-way binding with preferences store)
  const viewMode = computed({
    get: () => preferencesStore.getNeededItemsViewMode as 'list' | 'grid',
    set: (value) => preferencesStore.setNeededItemsViewMode(value),
  });
  // Scale by layout + screen size to reduce upfront render on small screens.
  const adjustedRenderCount = computed(() => {
    // Base count comes from props.baseRenderCount.
    const baseCount = props.baseRenderCount;
    // Adjust for view mode (grid uses SCREEN_SIZE_MULTIPLIERS.gridView).
    // Use Math.max to avoid shrinking below baseCount.
    const viewAdjusted =
      viewMode.value === 'grid'
        ? Math.max(baseCount, Math.ceil(baseCount * SCREEN_SIZE_MULTIPLIERS.gridView))
        : baseCount;
    if (xs.value) {
      // XS screens: apply SCREEN_SIZE_MULTIPLIERS.xs and clamp to MIN_RENDER_COUNTS.xs.
      return Math.max(MIN_RENDER_COUNTS.xs, Math.ceil(viewAdjusted * SCREEN_SIZE_MULTIPLIERS.xs));
    }
    if (belowMd.value) {
      // belowMd screens: apply SCREEN_SIZE_MULTIPLIERS.belowMd and clamp to MIN_RENDER_COUNTS.belowMd.
      return Math.max(
        MIN_RENDER_COUNTS.belowMd,
        Math.ceil(viewAdjusted * SCREEN_SIZE_MULTIPLIERS.belowMd)
      );
    }
    // Larger screens return the view-adjusted count.
    return viewAdjusted;
  });
  // Filter state with persistence (two-way binding with preferences store)
  const activeFilter = computed({
    get: () => preferencesStore.getNeededTypeView as NeededItemsFilterType,
    set: (value) => preferencesStore.setNeededTypeView(value),
  });
  const search = ref('');
  const firFilter = computed({
    get: () => preferencesStore.getNeededItemsFirFilter as NeededItemsFirFilter,
    set: (value) => preferencesStore.setNeededItemsFirFilter(value),
  });
  const groupByItem = computed({
    get: () => preferencesStore.getNeededItemsGroupByItem,
    set: (value) => preferencesStore.setNeededItemsGroupByItem(value),
  });
  const hideNonFirSpecialEquipment = computed({
    get: () => preferencesStore.getNeededItemsHideNonFirSpecialEquipment,
    set: (value) => preferencesStore.setNeededItemsHideNonFirSpecialEquipment(value),
  });
  const kappaOnly = computed({
    get: () => preferencesStore.getNeededItemsKappaOnly,
    set: (value) => preferencesStore.setNeededItemsKappaOnly(value),
  });
  // Team filter preferences (two-way binding with preferences store)
  const hideTeamItems = computed({
    get: () => preferencesStore.itemsTeamAllHidden,
    set: (value) => preferencesStore.setItemsTeamHideAll(value),
  });
  // Get user's faction for filtering task objectives
  const userFaction = computed(() => progressStore.playerFaction['self'] ?? 'USEC');
  // Get user's game edition for filtering task objectives
  const userEdition = computed(() => tarkovStore.getGameEdition());
  const itemsLoaded = computed(() => (items.value?.length ?? 0) > 0);
  const itemsError = computed(() => metadataStore.itemsError);
  const itemsReady = computed(() => itemsLoaded.value && !metadataStore.itemsLoading);
  const fullItemsQueued = ref(false);
  const queueFullItemsLoad = (
    options: {
      priority?: 'normal' | 'high';
      timeout?: number;
      minTime?: number;
      delayMs?: number;
    } = {}
  ) => {
    if (itemsFullLoaded.value) return;
    const { priority = 'normal', timeout = 5000, minTime = 16, delayMs = 1500 } = options;
    if (priority !== 'high' && fullItemsQueued.value) return;
    if (priority !== 'high') {
      fullItemsQueued.value = true;
    }
    const run = () => {
      void metadataStore.ensureItemsFullLoaded(false, { priority, timeout, minTime });
    };
    if (typeof window === 'undefined' || delayMs <= 0 || priority === 'high') {
      run();
      return;
    }
    window.setTimeout(run, delayMs);
  };
  watch(
    itemsLoaded,
    (loaded) => {
      if (loaded && !itemsFullLoaded.value) {
        queueFullItemsLoad();
      }
    },
    { immediate: true }
  );
  watch(hideNonFirSpecialEquipment, (enabled) => {
    if (enabled && !itemsFullLoaded.value) {
      queueFullItemsLoad({ priority: 'high', timeout: 800, minTime: 8, delayMs: 0 });
    }
  });
  const allItems = computed(() => {
    const combined = [
      ...(neededItemTaskObjectives.value || []),
      ...(neededItemHideoutModules.value || []),
    ];
    // Aggregate items by (taskId/hideoutModule, itemId) to combine duplicate items
    // from different objectives in the same task
    const aggregated = new Map<string, NeededItemTaskObjective | NeededItemHideoutModule>();
    for (const need of combined) {
      let key: string;
      let itemId: string | undefined;
      if (need.needType === 'taskObjective') {
        // Filter by edition: skip task objectives for tasks not available for user's edition
        if (!isTaskAvailableForEdition(need.taskId, userEdition.value, metadataStore.editions)) {
          continue;
        }
        // Filter by faction: skip task objectives for tasks that don't match user's faction
        const task = metadataStore.getTaskById(need.taskId);
        if (task && task.factionName !== 'Any' && task.factionName !== userFaction.value) {
          continue;
        }
        itemId = getNeededItemId(need);
        if (!itemId) {
          logger.warn('[NeededItems] Skipping objective without item/markerItem:', need);
          continue;
        }
        // Aggregate by taskId + itemId (combines multiple objectives for same item in same task)
        key = `task:${need.taskId}:${itemId}`;
      } else {
        itemId = getNeededItemId(need);
        if (!itemId) {
          logger.warn('[NeededItems] Skipping hideout requirement without item:', need);
          continue;
        }
        // Aggregate by hideout module + itemId (combines multiple requirements for same item)
        key = `hideout:${need.hideoutModule.id}:${itemId}`;
      }
      const existing = aggregated.get(key);
      if (existing) {
        // Item already exists for this task/module, sum the counts
        existing.count += need.count;
      } else {
        // First occurrence, clone the object to avoid mutating original
        aggregated.set(key, { ...need });
      }
    }
    // Return all items - filtering by completion status is done in filteredItems
    return Array.from(aggregated.values());
  });
  // Helper to check if the parent task/module is completed for self
  const isParentCompleted = (need: NeededItemTaskObjective | NeededItemHideoutModule): boolean => {
    if (need.needType === 'taskObjective') {
      // Check if the parent task is completed (turned in)
      return progressStore.tasksCompletions?.[need.taskId]?.['self'] ?? false;
    } else if (need.needType === 'hideoutModule') {
      // Check if the parent module is completed (built)
      return progressStore.moduleCompletions?.[need.hideoutModule.id]?.['self'] ?? false;
    }
    return false;
  };
  // Calculate item counts for each filter tab (single-pass for performance)
  const filterTabsWithCounts = computed(() => {
    const counts = { tasks: 0, hideout: 0, completed: 0, incomplete: 0 };
    for (const item of allItems.value) {
      const completed = isParentCompleted(item);
      if (completed) {
        counts.completed++;
      } else {
        counts.incomplete++;
        if (item.needType === 'taskObjective') counts.tasks++;
        else counts.hideout++;
      }
    }
    return [
      {
        label: t('page.neededitems.filters.all', 'All'),
        value: 'all' as NeededItemsFilterType,
        icon: 'i-mdi-clipboard-list',
        count: counts.incomplete,
      },
      {
        label: t('page.neededitems.filters.tasks', 'Tasks'),
        value: 'tasks' as NeededItemsFilterType,
        icon: 'i-mdi-checkbox-marked-circle-outline',
        count: counts.tasks,
      },
      {
        label: t('page.neededitems.filters.hideout', 'Hideout'),
        value: 'hideout' as NeededItemsFilterType,
        icon: 'i-mdi-home',
        count: counts.hideout,
      },
      {
        label: t('page.neededitems.filters.completed', 'Completed'),
        value: 'completed' as NeededItemsFilterType,
        icon: 'i-mdi-check-all',
        count: counts.completed,
      },
    ];
  });
  const filteredItems = computed(() => {
    let items = allItems.value;
    // Filter by completion status first
    if (activeFilter.value === 'completed') {
      // Show only items where the parent task/module is completed
      items = items.filter((item) => isParentCompleted(item));
    } else {
      // For All, Tasks, Hideout tabs - hide items where parent is completed
      items = items.filter((item) => !isParentCompleted(item));
      // Then filter by type (All, Tasks, Hideout)
      if (activeFilter.value === 'tasks') {
        items = items.filter((item) => item.needType === 'taskObjective');
      } else if (activeFilter.value === 'hideout') {
        items = items.filter((item) => item.needType === 'hideoutModule');
      }
    }
    // Filter by FIR status
    if (firFilter.value === 'fir') {
      items = items.filter((item) => item.foundInRaid === true);
    } else if (firFilter.value === 'non-fir') {
      items = items.filter((item) => !item.foundInRaid);
    }
    // Filter out noisy "special equipment" items that are non-FIR (e.g., MS2000 Markers, Wi-Fi Cameras)
    const applySpecialEquipmentFilter =
      hideNonFirSpecialEquipment.value && itemsFullLoaded.value === true;
    items = items.filter(
      (need) =>
        need.needType !== 'taskObjective' ||
        !applySpecialEquipmentFilter ||
        !isNonFirSpecialEquipment(need as NeededItemTaskObjective)
    );
    // Filter task items to only show Kappa-required quests (hideout items remain visible)
    if (kappaOnly.value) {
      items = items.filter((need) => {
        if (need.needType !== 'taskObjective') {
          return true;
        }
        const task = metadataStore.getTaskById(need.taskId);
        return task?.kappaRequired === true;
      });
    }
    // Filter by search - searches item name, task name, and hideout station name
    if (search.value) {
      const searchLower = search.value.toLowerCase();
      items = items.filter((item) => {
        const itemObj = getNeededItemData(item);
        const itemName = itemObj?.name;
        const itemShortName = itemObj?.shortName;
        if (
          itemName?.toLowerCase()?.includes(searchLower) ||
          itemShortName?.toLowerCase()?.includes(searchLower)
        ) {
          return true;
        }
        // Search by task name for task objectives
        if (item.needType === 'taskObjective') {
          const task = metadataStore.getTaskById((item as NeededItemTaskObjective).taskId);
          if (task?.name?.toLowerCase().includes(searchLower)) {
            return true;
          }
        }
        // Search by hideout station name and level for hideout modules
        if (item.needType === 'hideoutModule') {
          const hideoutModule = (item as NeededItemHideoutModule).hideoutModule;
          const station = metadataStore.getStationById(hideoutModule.stationId);
          if (station?.name) {
            // Match station name alone (e.g., "Lavatory")
            if (station.name.toLowerCase().includes(searchLower)) {
              return true;
            }
            // Match station name with level (e.g., "Lavatory 1" or "Lavatory Level 1")
            const stationWithLevel = `${station.name} ${hideoutModule.level}`.toLowerCase();
            const stationWithLevelText =
              `${station.name} level ${hideoutModule.level}`.toLowerCase();
            if (
              stationWithLevel.includes(searchLower) ||
              stationWithLevelText.includes(searchLower)
            ) {
              return true;
            }
          }
        }
        return false;
      });
    }
    return items;
  });
  // Group items by itemId for aggregated view
  type GroupedNeededItemAccumulator = Omit<GroupedNeededItem, 'total' | 'currentCount'>;
  const groupedItems = computed((): GroupedNeededItem[] => {
    const groups = new Map<string, GroupedNeededItemAccumulator>();
    for (const need of filteredItems.value) {
      const itemId = getNeededItemId(need);
      if (!itemId) continue;
      const itemData = getNeededItemData(need);
      if (!itemData || !itemData.name) continue;
      const existingGroup = groups.get(itemId);
      if (!existingGroup) {
        groups.set(itemId, {
          item: {
            id: itemData.id,
            name: itemData.name,
            iconLink: itemData.iconLink,
            image512pxLink: itemData.image512pxLink,
            wikiLink: itemData.wikiLink,
            link: itemData.link,
          },
          taskFir: 0,
          taskFirCurrent: 0,
          taskNonFir: 0,
          taskNonFirCurrent: 0,
          hideoutFir: 0,
          hideoutFirCurrent: 0,
          hideoutNonFir: 0,
          hideoutNonFirCurrent: 0,
        });
      }
      const group = groups.get(itemId)!;
      const count = need.count || 1;
      // Get current count for this specific need (capped at needed)
      let needCurrentCount = 0;
      if (need.needType === 'taskObjective') {
        const objectiveCount = tarkovStore.getObjectiveCount(need.id);
        needCurrentCount = Math.min(objectiveCount ?? 0, count);
        if (need.foundInRaid) {
          group.taskFir += count;
          group.taskFirCurrent += needCurrentCount;
        } else {
          group.taskNonFir += count;
          group.taskNonFirCurrent += needCurrentCount;
        }
      } else {
        const hideoutPartCount = tarkovStore.getHideoutPartCount(need.id);
        needCurrentCount = Math.min(hideoutPartCount ?? 0, count);
        if (need.foundInRaid) {
          group.hideoutFir += count;
          group.hideoutFirCurrent += needCurrentCount;
        } else {
          group.hideoutNonFir += count;
          group.hideoutNonFirCurrent += needCurrentCount;
        }
      }
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        total: group.taskFir + group.taskNonFir + group.hideoutFir + group.hideoutNonFir,
        currentCount:
          group.taskFirCurrent +
          group.taskNonFirCurrent +
          group.hideoutFirCurrent +
          group.hideoutNonFirCurrent,
      }))
      .sort((a, b) => b.total - a.total);
  });
  // Display items - either grouped or individual
  const displayItems = computed(() => {
    if (groupByItem.value) {
      return groupedItems.value;
    }
    return filteredItems.value;
  });
  const initialVisibleCount = computed(() => {
    if (groupByItem.value) {
      return BATCH_SIZE_GRID;
    }
    if (viewMode.value === 'list') {
      return adjustedRenderCount.value;
    }
    return Math.max(adjustedRenderCount.value, BATCH_SIZE_GRID * 2);
  });
  const visibleCount = ref(initialVisibleCount.value);
  // Separate computed for grouped items to ensure proper typing
  const visibleGroupedItems = computed(() => {
    return groupedItems.value.slice(0, visibleCount.value);
  });
  // Separate computed for individual items (list and grid views)
  const visibleIndividualItems = computed(() => {
    return filteredItems.value.slice(0, visibleCount.value);
  });
  const loadMore = () => {
    if (visibleCount.value < displayItems.value.length) {
      const batchSize = viewMode.value === 'list' ? BATCH_SIZE_LIST : BATCH_SIZE_GRID;
      visibleCount.value += batchSize;
    }
  };
  // Sentinel refs for infinite scroll
  const gridSentinel = ref<HTMLElement | null>(null);
  const listSentinel = ref<HTMLElement | null>(null);
  // Determine which sentinel to use based on view mode
  const currentSentinel = computed(() => {
    if (groupByItem.value) return gridSentinel.value;
    return viewMode.value === 'list' ? listSentinel.value : gridSentinel.value;
  });
  // Enable infinite scroll
  const infiniteScrollEnabled = computed(() => {
    return visibleCount.value < displayItems.value.length;
  });
  const infiniteScrollOptions: UseInfiniteScrollOptions & {
    autoFill?: boolean;
    autoLoadOnReady?: boolean;
  } = {
    enabled: infiniteScrollEnabled,
    rootMargin: INFINITE_SCROLL_MARGIN,
    autoFill: false,
    autoLoadOnReady: true,
    useScrollFallback: true,
  };
  // Set up infinite scroll
  const { checkAndLoadMore } = useInfiniteScroll(currentSentinel, loadMore, infiniteScrollOptions);
  // Reset visible count when search or filter changes
  const resetVisibleCount = () => {
    visibleCount.value = initialVisibleCount.value;
  };
  watch(
    [search, activeFilter, firFilter, groupByItem, hideNonFirSpecialEquipment, kappaOnly, viewMode],
    () => {
      resetVisibleCount();
      nextTick(() => {
        checkAndLoadMore();
      });
    }
  );
</script>
