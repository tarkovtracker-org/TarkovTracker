<template>
  <div class="flex min-h-full overflow-x-hidden">
    <div class="min-w-0 flex-1 px-3 py-6 sm:px-6">
      <div class="mx-auto max-w-350">
        <slot name="header" />
        <div class="mb-3 flex justify-end">
          <UButton
            data-testid="stash-import-open"
            icon="i-mdi-image-search"
            variant="soft"
            :disabled="!stashImportReady"
            @click="stashImportOpen = true"
          >
            {{ $t('stash_import.title') }}
          </UButton>
        </div>
        <StashImportDialog
          v-if="stashImportOpen"
          :needs="allItems"
          @close="stashImportOpen = false"
        />
        <NeededItemsFilterBar
          v-model="activeFilter"
          v-model:view-mode="viewMode"
          v-model:fir-filter="firFilter"
          v-model:group-by-item="groupByItem"
          v-model:hide-non-fir-special-equipment="hideNonFirSpecialEquipment"
          v-model:hide-team-items="hideTeamItems"
          v-model:kappa-only="kappaOnly"
          v-model:sort-by="sortBy"
          v-model:sort-direction="sortDirection"
          v-model:hide-owned="hideOwned"
          :filter-tabs="filterTabsWithCounts"
          :total-count="displayItems.length"
          :ungrouped-count="groupedNeedCount"
        />
        <div
          v-if="itemsError"
          :class="statePanelClass"
          class="flex-col gap-4 text-center"
          aria-live="polite"
        >
          <UIcon name="i-mdi-alert-circle" class="text-error-400 h-8 w-8" />
          <span class="text-error-400">
            {{ $t('page.needed_items.error') }}
          </span>
          <UButton color="primary" @click="ensureNeededItemsData">
            {{ $t('common.refresh_button') }}
          </UButton>
        </div>
        <div v-else-if="!itemsReady" :class="statePanelClass" class="gap-2" aria-live="polite">
          <UIcon name="i-mdi-loading" class="h-5 w-5 animate-spin" />
          <span>{{ $t('page.needed_items.loading') }}</span>
        </div>
        <div
          v-else-if="displayItems.length === 0"
          :class="statePanelClass"
          class="flex-col gap-1 text-center"
          aria-live="polite"
        >
          <UIcon name="i-mdi-package-variant-closed-check" class="text-surface-500 mb-2 size-8" />
          <span>{{ $t('page.needed_items.empty') }}</span>
        </div>
        <NeededItemsResults
          v-else
          ref="results"
          :group-by-item="groupByItem"
          :view-mode="viewMode"
          :grouped-items="visibleGroupedItems"
          :items="visibleIndividualItems"
          :objectives-by-item-id="objectivesByItemId"
          :search="search"
          :has-more="visibleCount < displayItems.length"
        />
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
      <div v-if="isDesktopSideRailOpen" class="hidden w-104 shrink-0 px-4 py-6 lg:block">
        <PageHelpPanel v-if="isDesktopHelpPanelOpen" page-key="needed_items" mode="docked" />
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
        <PageHelpPanel v-if="isMobileHelpPanelOpen" page-key="needed_items" mode="overlay" />
      </Transition>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
  import { usePageHelpState } from '@/composables/usePageHelpState';
  import { useProductAnalytics } from '@/composables/useProductAnalytics';
  import { useRouteSearchQuery } from '@/composables/useRouteSearchQuery';
  import {
    INFINITE_SCROLL_BATCH_SIZE,
    INFINITE_SCROLL_MARGIN,
    INITIAL_RENDER_COUNT,
  } from '@/features/neededitems/neededitems-constants';
  import NeededItemsFilterBar from '@/features/neededitems/NeededItemsFilterBar.vue';
  import NeededItemsResults from '@/features/neededitems/NeededItemsResults.vue';
  import { logger } from '@/utils/logger';
  import { perfNow, roundPerfMs } from '@/utils/perf';
  const { t } = useI18n({ useScope: 'global' });
  const stashImportOpen = ref(false);
  const StashImportDialog = defineAsyncComponent(
    () => import('@/features/stash-import/StashImportDialog.vue')
  );
  const { trackNeededItemsView } = useProductAnalytics();
  const { isOpen: isHelpOpen } = usePageHelpState('needed_items');
  const { isDesktopHelpPanelOpen, isDesktopSideRailOpen, isMobileHelpPanelOpen } =
    usePageSideRailState({ helpOpen: isHelpOpen });
  const route = useRoute();
  // The app-bar search writes `?q=`; this page only reads it.
  const { searchQuery: search } = useRouteSearchQuery();
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
  const { belowMd } = useSharedBreakpoints();
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
    filteredItems,
    allItems,
    groupedItems,
    groupedNeedCount,
    displayItems,
    objectivesByItemId,
    filterTabsWithCounts,
    itemsReady,
    stashImportReady,
    itemsError,
    ensureNeededItemsData,
  } = useNeededItems({ perfDebug, search, t });
  const statePanelClass =
    'bg-surface-900 text-surface-400 flex items-center justify-center rounded-lg border border-white/10 p-8';
  const selectedNeededItemsView = computed<'combined' | 'grid' | 'list'>(() => {
    if (groupByItem.value) {
      return 'combined';
    }
    return viewMode.value;
  });
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
  const initialVisibleCount = computed(() => {
    const count = INITIAL_RENDER_COUNT[viewMode.value];
    return belowMd.value ? Math.ceil(count / 2) : count;
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
  const results = useTemplateRef('results');
  const currentSentinel = computed(() => results.value?.sentinel ?? null);
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
  // Layout changes count as view changes too: Items and Needs both come as list or grid.
  watch(
    () => [selectedNeededItemsView.value, viewMode.value] as const,
    ([currentView, layout], previous) => {
      trackNeededItemsView({
        layout,
        previousView: previous?.[0],
        source: previous ? 'change' : 'page_load',
        view: currentView,
      });
    },
    { flush: 'post', immediate: true }
  );
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
