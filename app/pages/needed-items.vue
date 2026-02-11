<template>
  <div class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-[1400px]">
      <NeededItemsFilterBar
        v-model="activeFilter"
        v-model:search="search"
        v-model:view-mode="viewMode"
        v-model:fir-filter="firFilter"
        v-model:group-by-item="groupByItem"
        v-model:hide-non-fir-special-equipment="hideNonFirSpecialEquipment"
        v-model:hide-team-items="hideTeamItems"
        v-model:kappa-only="kappaOnly"
        v-model:sort-by="sortBy"
        v-model:sort-direction="sortDirection"
        v-model:hide-owned="hideOwned"
        v-model:card-style="cardStyle"
        :filter-tabs="filterTabsWithCounts"
        :total-count="displayItems.length"
        :ungrouped-count="filteredItems.length"
      />
      <UCard class="bg-contentbackground border border-white/5">
        <div
          v-if="itemsError"
          class="text-surface-400 flex flex-col items-center justify-center gap-4 p-8"
          aria-live="polite"
        >
          <UIcon name="i-mdi-alert-circle" class="text-error-400 h-8 w-8" />
          <span class="text-error-400">
            {{ $t('page.needed_items.error') }}
          </span>
          <UButton color="primary" @click="ensureNeededItemsData">
            {{ $t('page.needed_items.retry') }}
          </UButton>
        </div>
        <div
          v-else-if="!itemsReady"
          class="text-surface-400 flex items-center justify-center gap-2 p-8"
          aria-live="polite"
        >
          <UIcon name="i-mdi-loading" class="h-5 w-5 animate-spin" />
          <span>{{ $t('page.needed_items.loading') }}</span>
        </div>
        <template v-else>
          <div
            v-if="displayItems.length === 0"
            class="text-surface-400 p-8 text-center"
            aria-live="polite"
          >
            {{ $t('page.needed_items.empty') }}
          </div>
          <div v-else-if="groupByItem" class="p-2">
            <div
              class="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            >
              <NeededItemGroupedCard
                v-for="(group, index) in visibleGroupedItems"
                :key="group.item.id"
                :grouped-item="group"
                :task-objectives="objectivesByItemId.get(group.item.id)?.taskObjectives ?? []"
                :hideout-modules="objectivesByItemId.get(group.item.id)?.hideoutModules ?? []"
                :active-filter="activeFilter"
                :data-index="index"
                class="content-visibility-auto-220 h-full"
              />
            </div>
            <div
              v-if="visibleCount < displayItems.length"
              ref="gridSentinel"
              class="h-1 w-full"
            ></div>
          </div>
          <div v-else-if="viewMode === 'list'">
            <div
              v-for="(item, index) in visibleIndividualItems"
              :key="`${item.needType}-${item.id}`"
              class="content-visibility-auto-128 border-b border-white/5 pb-1"
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
          <div v-else class="p-2">
            <div
              class="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            >
              <NeededItem
                v-for="(item, index) in visibleIndividualItems"
                :key="`${item.needType}-${item.id}`"
                :need="item"
                item-style="card"
                :card-style="cardStyle"
                :initially-visible="index < adjustedRenderCount"
                :data-index="index"
                class="content-visibility-auto-240 h-full"
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
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import NeededItem from '@/features/neededitems/NeededItem.vue';
  import NeededItemGroupedCard from '@/features/neededitems/NeededItemGroupedCard.vue';
  import {
    DEFAULT_INITIAL_RENDER_COUNT,
    INFINITE_SCROLL_BATCH_SIZE,
    INFINITE_SCROLL_MARGIN,
    MIN_RENDER_COUNTS,
    SCREEN_SIZE_MULTIPLIERS,
  } from '@/features/neededitems/neededitems-constants';
  import NeededItemsFilterBar from '@/features/neededitems/NeededItemsFilterBar.vue';
  import { logger } from '@/utils/logger';
  import { perfNow, roundPerfMs } from '@/utils/perf';
  definePageMeta({
    usesWindowScroll: true,
  });
  const { t } = useI18n({ useScope: 'global' });
  useSeoMeta({
    title: () => t('page.needed_items.title'),
    description: () => t('page.needed_items.meta_description'),
  });
  const props = withDefaults(
    defineProps<{
      baseRenderCount?: number;
    }>(),
    {
      baseRenderCount: DEFAULT_INITIAL_RENDER_COUNT,
    }
  );
  const search = ref('');
  const route = useRoute();
  const PERF_QUERY_PARAM = 'perfNeededItems';
  const perfDebug = computed(() => {
    const rawValue = route.query[PERF_QUERY_PARAM];
    const normalizedValue = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (typeof normalizedValue !== 'string') return false;
    const normalizedFlag = normalizedValue.toLowerCase();
    return (
      normalizedFlag === '1' ||
      normalizedFlag === 'true' ||
      normalizedFlag === 'yes' ||
      normalizedFlag === 'on'
    );
  });
  const logPerf = (event: string, payload: Record<string, unknown> = {}) => {
    if (!perfDebug.value) return;
    logger.info(`[NeededItemsPerf] ${event}`, payload);
  };
  const perfSessionStartedAt = ref<number | null>(null);
  const hasUserScrolled = ref(false);
  const canPageScroll = ref(false);
  const updatePageScrollState = () => {
    if (typeof window === 'undefined') return;
    const doc = document.documentElement;
    canPageScroll.value = doc.scrollHeight > window.innerHeight + 1;
  };
  const markUserScrolled = () => {
    if (hasUserScrolled.value) return;
    hasUserScrolled.value = true;
    if (perfDebug.value) {
      logPerf('user-scroll-activated');
    }
  };
  const { belowMd, xs } = useSharedBreakpoints();
  const {
    activeFilter,
    firFilter,
    groupByItem,
    hideNonFirSpecialEquipment,
    hideTeamItems,
    kappaOnly,
    hideOwned,
    sortBy,
    sortDirection,
    viewMode,
    cardStyle,
    filteredItems,
    groupedItems,
    displayItems,
    objectivesByItemId,
    filterTabsWithCounts,
    itemsReady,
    itemsError,
    ensureNeededItemsData,
  } = useNeededItems({ perfDebug, search, t });
  useNeededItemsRouteSync({ activeFilter });
  onMounted(() => {
    if (perfDebug.value) {
      perfSessionStartedAt.value = perfNow();
      logPerf('session-start', {
        fullPath: route.fullPath,
        groupByItem: groupByItem.value,
        viewMode: viewMode.value,
      });
    }
    if (typeof window !== 'undefined') {
      hasUserScrolled.value = window.scrollY > 0;
      window.addEventListener('scroll', markUserScrolled, { passive: true });
      window.addEventListener('resize', updatePageScrollState, { passive: true });
      nextTick(() => {
        updatePageScrollState();
      });
    }
    ensureNeededItemsData();
  });
  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', markUserScrolled);
      window.removeEventListener('resize', updatePageScrollState);
    }
  });
  const baseRenderCount = computed(() => {
    const value = props.baseRenderCount;
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_INITIAL_RENDER_COUNT;
  });
  const adjustedRenderCount = computed(() => {
    const baseCount = baseRenderCount.value;
    const viewAdjusted =
      viewMode.value === 'grid'
        ? Math.max(baseCount, Math.ceil(baseCount * SCREEN_SIZE_MULTIPLIERS.gridView))
        : baseCount;
    if (xs.value) {
      return Math.max(MIN_RENDER_COUNTS.xs, Math.ceil(viewAdjusted * SCREEN_SIZE_MULTIPLIERS.xs));
    }
    if (belowMd.value) {
      return Math.max(
        MIN_RENDER_COUNTS.belowMd,
        Math.ceil(viewAdjusted * SCREEN_SIZE_MULTIPLIERS.belowMd)
      );
    }
    return viewAdjusted;
  });
  const initialVisibleCount = computed(() => {
    if (groupByItem.value) {
      const groupedMinimum = xs.value || belowMd.value ? INFINITE_SCROLL_BATCH_SIZE : 30;
      return Math.max(adjustedRenderCount.value, groupedMinimum);
    }
    if (viewMode.value === 'list') {
      return adjustedRenderCount.value;
    }
    return Math.max(adjustedRenderCount.value, INFINITE_SCROLL_BATCH_SIZE * 2);
  });
  const visibleCount = ref(initialVisibleCount.value);
  const visibleGroupedItems = computed(() => {
    return groupedItems.value.slice(0, visibleCount.value);
  });
  const visibleIndividualItems = computed(() => {
    return filteredItems.value.slice(0, visibleCount.value);
  });
  const loadMoreCallCount = ref(0);
  const loadMore = () => {
    const previousVisibleCount = visibleCount.value;
    if (previousVisibleCount >= displayItems.value.length) return;
    const startedAt = perfDebug.value ? perfNow() : 0;
    const batchSize = INFINITE_SCROLL_BATCH_SIZE;
    const nextVisibleCount = Math.min(previousVisibleCount + batchSize, displayItems.value.length);
    visibleCount.value = nextVisibleCount;
    if (!perfDebug.value) return;
    loadMoreCallCount.value += 1;
    const callNumber = loadMoreCallCount.value;
    const basePayload = {
      batchSize,
      callNumber,
      from: previousVisibleCount,
      to: nextVisibleCount,
      totalItems: displayItems.value.length,
    };
    nextTick(() => {
      const nextTickMs = roundPerfMs(perfNow() - startedAt);
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          logPerf('load-more', {
            ...basePayload,
            nextTickMs,
            paintMs: roundPerfMs(perfNow() - startedAt),
          });
        });
        return;
      }
      logPerf('load-more', { ...basePayload, nextTickMs });
    });
  };
  const gridSentinel = ref<HTMLElement | null>(null);
  const listSentinel = ref<HTMLElement | null>(null);
  const currentSentinel = computed(() => {
    if (groupByItem.value) return gridSentinel.value;
    return viewMode.value === 'list' ? listSentinel.value : gridSentinel.value;
  });
  const infiniteScrollEnabled = computed(() => {
    if (visibleCount.value >= displayItems.value.length) return false;
    if (!canPageScroll.value) return true;
    return hasUserScrolled.value;
  });
  const infiniteScrollOptions = {
    enabled: infiniteScrollEnabled,
    rootMargin: INFINITE_SCROLL_MARGIN,
    autoFill: false,
    autoLoadOnReady: true,
    maxAutoLoadsPerScrollTrigger: 1,
    scrollThrottleMs: 120,
    useScrollFallback: true,
    debug: perfDebug,
    debugLabel: 'needed-items',
    maxAutoLoads: 12,
  };
  const { checkAndLoadMore } = useInfiniteScroll(currentSentinel, loadMore, infiniteScrollOptions);
  const resetVisibleCount = () => {
    visibleCount.value = initialVisibleCount.value;
  };
  watch(
    [
      search,
      activeFilter,
      firFilter,
      groupByItem,
      hideNonFirSpecialEquipment,
      hideTeamItems,
      kappaOnly,
      viewMode,
      sortBy,
      sortDirection,
      hideOwned,
    ],
    () => {
      if (perfDebug.value) {
        logPerf('filters-changed', {
          activeFilter: activeFilter.value,
          firFilter: firFilter.value,
          groupByItem: groupByItem.value,
          hideNonFirSpecialEquipment: hideNonFirSpecialEquipment.value,
          hideOwned: hideOwned.value,
          hideTeamItems: hideTeamItems.value,
          kappaOnly: kappaOnly.value,
          searchLength: search.value.length,
          sortBy: sortBy.value,
          sortDirection: sortDirection.value,
          viewMode: viewMode.value,
        });
      }
      resetVisibleCount();
      nextTick(() => {
        updatePageScrollState();
        checkAndLoadMore();
      });
    }
  );
  watch(itemsReady, (ready, wasReady) => {
    if (!perfDebug.value || !ready || wasReady) return;
    const startedAt = perfSessionStartedAt.value;
    logPerf('items-ready', {
      elapsedMs: startedAt === null ? null : roundPerfMs(perfNow() - startedAt),
      filteredItems: filteredItems.value.length,
      groupedItems: groupedItems.value.length,
      totalItems: displayItems.value.length,
      visibleCount: visibleCount.value,
    });
  });
  watch(visibleCount, (currentCount, previousCount) => {
    updatePageScrollState();
    if (!perfDebug.value) return;
    logPerf('visible-count-changed', {
      from: previousCount,
      to: currentCount,
      totalItems: displayItems.value.length,
    });
  });
  watch(
    () => displayItems.value.length,
    (newLength, oldLength) => {
      if (perfDebug.value) {
        logPerf('display-items-length-changed', {
          from: oldLength,
          to: newLength,
          visibleCount: visibleCount.value,
        });
      }
      nextTick(() => {
        updatePageScrollState();
        checkAndLoadMore();
      });
    }
  );
</script>
