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
          'data-[state=active]:border-surface-200 data-[state=active]:bg-transparent data-[state=active]:text-white light:data-[state=active]:text-surface-50 rounded-none border-b-2 border-transparent px-2 sm:px-3',
      }"
    >
      <template #default="{ item }">
        <div class="flex items-center">
          <span class="sr-only text-[clamp(0.625rem,2vw,0.875rem)] uppercase sm:not-sr-only">
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
    <!-- Unified Filter Bar: Filters + Views -->
    <div
      class="bg-surface-900 flex flex-col gap-3 rounded-lg border border-white/12 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:px-4 sm:py-3"
    >
      <!-- Right side controls -->
      <div class="flex flex-wrap items-center gap-2 sm:gap-3">
        <!-- Item count badge -->
        <UBadge color="neutral" variant="soft" size="md" class="shrink-0 px-3 py-1.5 text-sm">
          {{ countLabel }}
        </UBadge>
        <div class="hidden h-6 w-px bg-white/10 sm:block" />
        <NeededItemsFiltersPopover
          :fir-filter="firFilter"
          :hide-owned="hideOwned"
          :hide-team-items="hideTeamItems"
          :hide-non-fir-special-equipment="hideNonFirSpecialEquipment"
          :kappa-only="kappaOnly"
          :active-count="activeFilters.length"
          :is-kappa-disabled="isKappaDisabled"
          @update:fir-filter="emit('update:firFilter', $event)"
          @update:hide-owned="emit('update:hideOwned', $event)"
          @update:hide-team-items="emit('update:hideTeamItems', $event)"
          @update:hide-non-fir-special-equipment="emit('update:hideNonFirSpecialEquipment', $event)"
          @update:kappa-only="emit('update:kappaOnly', $event)"
          @reset="clearAllFilters"
        />
        <SortControl
          v-model="selectedSortBy"
          :items="sortOptions"
          :label="$t('page.needed_items.sort.label')"
          leading-icon="i-mdi-sort"
          :direction="sortDirection"
          select-class="w-28 sm:w-40"
          @toggle-direction="toggleSortDirection"
        />
        <!-- Divider (hidden on mobile) -->
        <div class="hidden h-6 w-px bg-white/10 sm:block" />
        <NeededItemsViewModeToggle
          :view-mode="viewMode"
          :group-by-item="groupByItem"
          :card-style="cardStyle"
          @update:view-mode="emit('update:viewMode', $event)"
          @update:group-by-item="emit('update:groupByItem', $event)"
          @update:card-style="emit('update:cardStyle', $event)"
        />
      </div>
    </div>
    <ActiveFilterChips test-id-prefix="needed-items-active-filters" :filters="activeFilters" />
  </div>
</template>
<script setup lang="ts">
  import ActiveFilterChips from '@/components/ui/ActiveFilterChips.vue';
  import SortControl from '@/components/ui/SortControl.vue';
  import {
    normalizeNeededItemsFilterType,
    normalizeNeededItemsSortBy,
  } from '@/features/neededitems/neededItemsFilterNormalization';
  import NeededItemsFiltersPopover from '@/features/neededitems/NeededItemsFiltersPopover.vue';
  import NeededItemsViewModeToggle from '@/features/neededitems/NeededItemsViewModeToggle.vue';
  import type { ActiveFilter } from '@/types/filters';
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
  }>();
  const emit = defineEmits<{
    'update:modelValue': [value: FilterType];
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
  const activeFilter = computed({
    get: () => props.modelValue,
    set: (value: unknown) => {
      emit('update:modelValue', normalizeNeededItemsFilterType(value));
    },
  });
  // Light theme picks whichever numeral clears AA on each badge: white stays on
  // info-500 and surface-500, while the pale surface-600 badge and the saturated
  // success-500 badge (where white is only ~3.9:1 but ink is ~4.2:1) switch to ink.
  const getTabBadgeColor = (tab: FilterTab): string => {
    switch (tab.value) {
      case 'completed':
        return 'bg-success-500 light:text-surface-50';
      case 'tasks':
      case 'hideout':
        return tab.count > 0 ? 'bg-info-500' : 'bg-surface-600 light:text-surface-50';
      case 'all':
      default:
        return tab.count > 0 ? 'bg-surface-500' : 'bg-surface-600 light:text-surface-50';
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
  const countLabel = computed(() =>
    props.groupByItem && props.ungroupedCount !== props.totalCount
      ? t('page.needed_items.unique_items_count', {
          unique: props.totalCount,
          total: props.ungroupedCount,
        })
      : `${props.totalCount} ${t('page.needed_items.items')}`
  );
  // Kappa only narrows task needs, so it does nothing on the Hideout tab.
  const isKappaDisabled = computed(() => props.modelValue === 'hideout');
  interface FilterChipDescriptor {
    key: string;
    isActive: () => boolean;
    labelKey: () => string;
    clear: () => void;
  }
  const filterChipDescriptors: FilterChipDescriptor[] = [
    {
      key: 'fir',
      isActive: () => props.firFilter !== 'all',
      labelKey: () => `page.needed_items.filters.chips.${props.firFilter.replace('-', '_')}`,
      clear: () => emit('update:firFilter', 'all'),
    },
    {
      key: 'hide_owned',
      isActive: () => props.hideOwned,
      labelKey: () => 'page.needed_items.filters.chips.hide_owned',
      clear: () => emit('update:hideOwned', false),
    },
    {
      key: 'hide_team',
      isActive: () => props.hideTeamItems,
      labelKey: () => 'page.needed_items.filters.chips.hide_team',
      clear: () => emit('update:hideTeamItems', false),
    },
    {
      key: 'hide_special_equipment',
      isActive: () => props.hideNonFirSpecialEquipment,
      labelKey: () => 'page.needed_items.filters.chips.hide_special_equipment',
      clear: () => emit('update:hideNonFirSpecialEquipment', false),
    },
    {
      key: 'kappa_only',
      isActive: () => props.kappaOnly && !isKappaDisabled.value,
      labelKey: () => 'page.needed_items.filters.chips.kappa_only',
      clear: () => emit('update:kappaOnly', false),
    },
  ];
  const activeFilters = computed<ActiveFilter[]>(() =>
    filterChipDescriptors
      .filter((descriptor) => descriptor.isActive())
      .map((descriptor) => ({
        key: descriptor.key,
        label: t(descriptor.labelKey()),
        clear: descriptor.clear,
      }))
  );
  // Reset clears every saved filter, including Kappa only while it is idle on the Hideout tab.
  const clearAllFilters = () => {
    emit('update:firFilter', 'all');
    emit('update:hideOwned', false);
    emit('update:hideTeamItems', false);
    emit('update:hideNonFirSpecialEquipment', false);
    emit('update:kappaOnly', false);
  };
  const sortOptions = computed(() => [
    {
      label: t('common.priority'),
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
