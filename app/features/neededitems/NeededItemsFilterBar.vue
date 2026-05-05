<template>
  <div class="mb-6 space-y-3">
    <!-- Primary Filter: ALL / TASKS / HIDEOUT (Centered) -->
    <UTabs
      v-model="activeFilter"
      :items="filterTabItems"
      :content="false"
      color="neutral"
      variant="link"
      class="bg-surface-900 rounded-lg border border-white/12 px-3 py-2.5 shadow-sm sm:px-4 sm:py-3"
      :ui="{
        root: 'w-full',
        list: 'flex flex-wrap items-center justify-center gap-1 border-b-0 p-0 sm:gap-2',
        indicator: 'hidden',
        leadingIcon: 'h-4 w-4 sm:h-5 sm:w-5',
        trigger:
          'data-[state=active]:border-surface-200 data-[state=active]:bg-transparent data-[state=active]:text-white rounded-none border-b-2 border-transparent px-2 sm:px-3',
      }"
    >
      <template #default="{ item }">
        <div class="flex items-center">
          <span class="hidden text-[clamp(0.625rem,2vw,0.875rem)] uppercase sm:inline">
            {{ item.label }}
          </span>
          <span
            :class="[
              'ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white sm:ml-2 sm:h-7 sm:min-w-7 sm:px-1.5 sm:text-sm',
              item.badgeClass,
            ]"
          >
            {{ item.count }}
          </span>
        </div>
      </template>
    </UTabs>
    <!-- Unified Filter Bar: Search + Filters + Views -->
    <div
      class="bg-surface-900 flex flex-col gap-3 rounded-lg border border-white/12 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:px-4 sm:py-3"
    >
      <!-- Search (grows to fill space) -->
      <div class="flex-1">
        <label :for="searchInputId" class="sr-only">
          {{ $t('page.needed_items.search_placeholder') }}
        </label>
        <UInput
          :id="searchInputId"
          ref="searchInput"
          :model-value="search"
          :placeholder="$t('page.needed_items.search_placeholder')"
          icon="i-mdi-magnify"
          name="needed-items-search"
          size="md"
          :ui="{ trailing: 'pe-1' }"
          class="w-full"
          @update:model-value="$emit('update:search', $event)"
        >
          <template v-if="search?.length" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-mdi-close-circle"
              :aria-label="$t('page.needed_items.clear_search')"
              @click="$emit('update:search', '')"
            />
          </template>
        </UInput>
      </div>
      <!-- Right side controls -->
      <div class="flex flex-wrap items-center gap-2 sm:gap-3">
        <!-- Item count badge -->
        <UBadge color="neutral" variant="soft" size="md" class="shrink-0 px-3 py-1.5 text-sm">
          <template v-if="groupByItem && ungroupedCount !== totalCount">
            {{ totalCount }} unique ({{ ungroupedCount }} total)
          </template>
          <template v-else>{{ totalCount }} {{ $t('page.needed_items.items') }}</template>
        </UBadge>
        <div class="hidden h-6 w-px bg-white/10 sm:block" />
        <SelectMenuFixed
          v-model="selectedSortBy"
          :items="sortOptions"
          value-key="value"
          size="sm"
          class="w-28 sm:w-40"
          :aria-label="$t('page.needed_items.sort.label')"
        >
          <template #leading>
            <UIcon name="i-mdi-sort" class="h-4 w-4" />
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
        <!-- Divider (hidden on mobile) -->
        <div class="hidden h-6 w-px bg-white/10 sm:block" />
        <!-- View Mode Buttons -->
        <div class="flex items-center gap-1">
          <UButton
            icon="i-mdi-view-list"
            :color="!groupByItem && viewMode === 'list' ? 'primary' : 'neutral'"
            :variant="!groupByItem && viewMode === 'list' ? 'soft' : 'ghost'"
            size="sm"
            :disabled="isListViewActive"
            :title="$t('page.needed_items.view.list')"
            :aria-label="$t('page.needed_items.view.list')"
            @click="setViewMode('list')"
          />
          <UButton
            icon="i-mdi-view-grid"
            :color="!groupByItem && viewMode === 'grid' ? 'primary' : 'neutral'"
            :variant="!groupByItem && viewMode === 'grid' ? 'soft' : 'ghost'"
            size="sm"
            :disabled="isGridViewActive"
            :title="$t('page.needed_items.view.grid')"
            :aria-label="$t('page.needed_items.view.grid')"
            @click="setViewMode('grid')"
          />
          <UButton
            icon="i-mdi-group"
            :color="groupByItem ? 'primary' : 'neutral'"
            :variant="groupByItem ? 'soft' : 'ghost'"
            size="sm"
            :disabled="isGroupedViewActive"
            :title="$t('page.needed_items.view.combined')"
            :aria-label="$t('page.needed_items.view.combined')"
            @click="setGroupedView"
          />
          <!-- Card Style Toggle (Only visible in Grid View and not Grouped) -->
          <div
            v-if="!groupByItem && viewMode === 'grid'"
            class="ml-1 border-l border-white/10 pl-1"
          >
            <UButton
              :icon="cardStyle === 'compact' ? 'i-mdi-image' : 'i-mdi-image-text'"
              color="neutral"
              variant="ghost"
              size="sm"
              :title="
                cardStyle === 'compact'
                  ? $t('needed_items.switch_to_expanded')
                  : $t('needed_items.switch_to_compact')
              "
              :aria-label="
                cardStyle === 'compact'
                  ? $t('needed_items.switch_to_expanded')
                  : $t('needed_items.switch_to_compact')
              "
              @click="$emit('update:cardStyle', cardStyle === 'compact' ? 'expanded' : 'compact')"
            />
          </div>
        </div>
        <AppTooltip :text="t('page.needed_items.settings.title', 'Needed Items Settings')">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-mdi-cog"
            :aria-label="t('page.needed_items.settings.title', 'Needed Items Settings')"
            :aria-pressed="isSettingsDrawerOpen"
            :class="isSettingsDrawerOpen ? 'bg-white/10 text-white' : 'text-surface-400'"
            @click="toggleSettingsDrawer"
          >
            <UBadge v-if="activeFiltersCount > 0" color="primary" variant="soft" size="sm">
              {{ activeFiltersCount }}
            </UBadge>
          </UButton>
        </AppTooltip>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
  import {
    normalizeNeededItemsFilterType,
    normalizeNeededItemsSortBy,
  } from '@/features/neededitems/neededItemsFilterNormalization';
  import type { UInputInstance } from '@/types/ui';
  type FilterType = 'all' | 'tasks' | 'hideout' | 'completed';
  type ViewMode = 'list' | 'grid';
  type FirFilter = 'all' | 'fir' | 'non-fir';
  type SortBy = 'priority' | 'name' | 'category' | 'count';
  type SortDirection = 'asc' | 'desc';
  type CardStyle = 'compact' | 'expanded';
  interface FilterTab {
    label: string;
    value: FilterType;
    icon: string;
    count: number;
  }
  const props = defineProps<{
    modelValue: FilterType;
    search: string;
    viewMode: ViewMode;
    filterTabs: FilterTab[];
    totalCount: number;
    ungroupedCount: number;
    firFilter: FirFilter;
    groupByItem: boolean;
    hideTeamItems: boolean;
    hideNonFirSpecialEquipment: boolean;
    kappaOnly: boolean;
    sortBy: SortBy;
    sortDirection: SortDirection;
    hideOwned: boolean;
    cardStyle: CardStyle;
    autoFocus?: boolean;
  }>();
  const emit = defineEmits<{
    'update:modelValue': [value: FilterType];
    'update:search': [value: string];
    'update:viewMode': [value: ViewMode];
    'update:firFilter': [value: FirFilter];
    'update:groupByItem': [value: boolean];
    'update:hideTeamItems': [value: boolean];
    'update:hideNonFirSpecialEquipment': [value: boolean];
    'update:kappaOnly': [value: boolean];
    'update:sortBy': [value: SortBy];
    'update:sortDirection': [value: SortDirection];
    'update:hideOwned': [value: boolean];
    'update:cardStyle': [value: CardStyle];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const searchInputId = `needed-items-search-${useId()}`;
  const activeFilter = computed({
    get: () => props.modelValue,
    set: (value: unknown) => {
      emit('update:modelValue', normalizeNeededItemsFilterType(value));
    },
  });
  const getTabBadgeColor = (tab: FilterTab): string => {
    switch (tab.value) {
      case 'completed':
        return 'bg-success-500';
      case 'tasks':
      case 'hideout':
        return tab.count > 0 ? 'bg-info-500' : 'bg-surface-600';
      case 'all':
      default:
        return tab.count > 0 ? 'bg-surface-500' : 'bg-surface-600';
    }
  };
  const filterTabItems = computed(() => {
    return props.filterTabs
      .filter((tab) => {
        if (tab.value === 'completed' && tab.count <= 0) return false;
        return true;
      })
      .map((tab) => ({
        ...tab,
        badgeClass: getTabBadgeColor(tab),
      }));
  });
  const activeFiltersCount = computed(() => {
    let count = 0;
    if (props.firFilter !== 'all') {
      count += 1;
    }
    if (props.hideNonFirSpecialEquipment) {
      count += 1;
    }
    if (props.hideTeamItems) {
      count += 1;
    }
    if (props.kappaOnly) {
      count += 1;
    }
    if (props.hideOwned) {
      count += 1;
    }
    return count;
  });
  const { isOpen: isSettingsDrawerOpen, toggle: toggleSettingsDrawer } =
    usePageSettingsDrawer('needed_items');
  const sortOptions = computed(() => [
    {
      label: t('page.needed_items.sort.priority'),
      value: 'priority' as SortBy,
      icon: 'i-mdi-alert-circle-outline',
    },
    {
      label: t('page.needed_items.sort.name'),
      value: 'name' as SortBy,
      icon: 'i-mdi-format-title',
    },
    {
      label: t('page.needed_items.sort.category'),
      value: 'category' as SortBy,
      icon: 'i-mdi-shape-outline',
    },
    {
      label: t('page.needed_items.sort.count'),
      value: 'count' as SortBy,
      icon: 'i-mdi-counter',
    },
  ]);
  const selectedSortBy = computed({
    get: () => props.sortBy,
    set: (value: unknown) => {
      setSort(value);
    },
  });
  const sortDirectionIcon = computed(() => {
    return props.sortDirection === 'asc' ? 'i-mdi-arrow-up' : 'i-mdi-arrow-down';
  });
  const sortDirectionLabel = computed(() => {
    return props.sortDirection === 'asc'
      ? t('page.tasks.sort.ascending')
      : t('page.tasks.sort.descending');
  });
  const isListViewActive = computed(() => !props.groupByItem && props.viewMode === 'list');
  const isGridViewActive = computed(() => !props.groupByItem && props.viewMode === 'grid');
  const isGroupedViewActive = computed(() => props.groupByItem);
  const setViewMode = (mode: ViewMode) => {
    if (
      (mode === 'list' && isListViewActive.value) ||
      (mode === 'grid' && isGridViewActive.value)
    ) {
      return;
    }
    emit('update:groupByItem', false);
    emit('update:viewMode', mode);
  };
  const searchInput = ref<UInputInstance | null>(null);
  const focusSearch = () => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement as HTMLElement | null;
    if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
    if (active?.isContentEditable) return;
    searchInput.value?.inputRef?.focus();
  };
  onMounted(() => {
    if (props.autoFocus) {
      nextTick(() => {
        focusSearch();
      });
    }
  });
  const setGroupedView = () => {
    if (isGroupedViewActive.value) return;
    emit('update:groupByItem', true);
  };
  const setSort = (value: unknown) => {
    const normalizedSortBy = normalizeNeededItemsSortBy(value);
    if (props.sortBy === normalizedSortBy) {
      emit('update:sortDirection', props.sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      emit('update:sortBy', normalizedSortBy);
      emit(
        'update:sortDirection',
        normalizedSortBy === 'priority' || normalizedSortBy === 'count' ? 'desc' : 'asc'
      );
    }
  };
  const toggleSortDirection = () => {
    emit('update:sortDirection', props.sortDirection === 'asc' ? 'desc' : 'asc');
  };
</script>
