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
    BATCH_SIZE_GRID,
    BATCH_SIZE_LIST,
    DEFAULT_INITIAL_RENDER_COUNT,
    INFINITE_SCROLL_MARGIN,
    MIN_RENDER_COUNTS,
    SCREEN_SIZE_MULTIPLIERS,
  } from '@/features/neededitems/neededitems-constants';
  import NeededItemsFilterBar from '@/features/neededitems/NeededItemsFilterBar.vue';
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
  } = useNeededItems({ search, t });
  onMounted(() => {
    ensureNeededItemsData();
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
      return BATCH_SIZE_GRID;
    }
    if (viewMode.value === 'list') {
      return adjustedRenderCount.value;
    }
    return Math.max(adjustedRenderCount.value, BATCH_SIZE_GRID * 2);
  });
  const visibleCount = ref(initialVisibleCount.value);
  const visibleGroupedItems = computed(() => {
    return groupedItems.value.slice(0, visibleCount.value);
  });
  const visibleIndividualItems = computed(() => {
    return filteredItems.value.slice(0, visibleCount.value);
  });
  const loadMore = () => {
    if (visibleCount.value < displayItems.value.length) {
      const batchSize = viewMode.value === 'list' ? BATCH_SIZE_LIST : BATCH_SIZE_GRID;
      visibleCount.value += batchSize;
    }
  };
  const gridSentinel = ref<HTMLElement | null>(null);
  const listSentinel = ref<HTMLElement | null>(null);
  const currentSentinel = computed(() => {
    if (groupByItem.value) return gridSentinel.value;
    return viewMode.value === 'list' ? listSentinel.value : gridSentinel.value;
  });
  const infiniteScrollEnabled = computed(() => {
    return visibleCount.value < displayItems.value.length;
  });
  const infiniteScrollOptions = {
    enabled: infiniteScrollEnabled,
    rootMargin: INFINITE_SCROLL_MARGIN,
    autoFill: true,
    autoLoadOnReady: true,
    useScrollFallback: true,
    maxAutoLoads: 12,
    stickToBottomThreshold: 400,
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
      resetVisibleCount();
      nextTick(() => {
        checkAndLoadMore();
      });
    }
  );
</script>
