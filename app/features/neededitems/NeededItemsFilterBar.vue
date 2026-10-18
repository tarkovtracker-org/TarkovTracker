<template>
  <div class="mb-6 space-y-3">
    <StatusTabBar
      v-model="activeFilter"
      :tabs="visibleFilterTabs"
      :group-label="$t('page.needed_items.filter_tabs_label')"
    >
      <template #actions>
        <UBadge color="neutral" variant="soft" size="md" class="shrink-0 px-3 py-1.5 text-sm">
          {{ countLabel }}
        </UBadge>
        <NeededItemsFiltersPopover
          :fir-filter="firFilter"
          :hide-owned="hideOwned"
          :hide-team-items="hideTeamItems"
          :hide-non-fir-special-equipment="hideNonFirSpecialEquipment"
          :kappa-only="kappaOnly"
          :active-count="activeFilters.length"
          :can-reset="hasSavedFilters"
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
          select-class="w-32 sm:w-40"
          @toggle-direction="toggleSortDirection"
        />
        <div aria-hidden="true" class="hidden h-6 w-px bg-white/10 sm:block" />
        <NeededItemsViewModeToggle
          :view-mode="viewMode"
          :group-by-item="groupByItem"
          :card-style="cardStyle"
          @update:view-mode="emit('update:viewMode', $event)"
          @update:group-by-item="emit('update:groupByItem', $event)"
          @update:card-style="emit('update:cardStyle', $event)"
        />
      </template>
    </StatusTabBar>
    <ActiveFilterChips test-id-prefix="needed-items-active-filters" :filters="activeFilters" />
  </div>
</template>
<script setup lang="ts">
  import ActiveFilterChips from '@/components/ui/ActiveFilterChips.vue';
  import SortControl from '@/components/ui/SortControl.vue';
  import StatusTabBar from '@/components/ui/StatusTabBar.vue';
  import {
    normalizeNeededItemsFilterType,
    normalizeNeededItemsSortBy,
  } from '@/features/neededitems/neededItemsFilterNormalization';
  import NeededItemsFiltersPopover from '@/features/neededitems/NeededItemsFiltersPopover.vue';
  import NeededItemsViewModeToggle from '@/features/neededitems/NeededItemsViewModeToggle.vue';
  import type { FilterTab } from '@/composables/useNeededItems';
  import type { ActiveFilter } from '@/types/filters';
  type FilterType = 'all' | 'tasks' | 'hideout' | 'completed';
  type ViewMode = 'list' | 'grid';
  type FirFilter = 'all' | 'fir' | 'non-fir';
  type SortBy = 'priority' | 'name' | 'category' | 'count';
  type SortDirection = 'asc' | 'desc';
  type CardStyle = 'compact' | 'expanded';
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
  // Completed only gets a tab once something is done, or while it is the picked filter.
  const isTabShown = (tab: FilterTab) =>
    tab.value !== 'completed' || tab.count > 0 || tab.value === props.modelValue;
  const visibleFilterTabs = computed(() => props.filterTabs.filter(isTabShown));
  const countLabel = computed(() =>
    props.groupByItem && props.ungroupedCount !== props.totalCount
      ? t('page.needed_items.unique_items_count', {
          unique: props.totalCount,
          total: props.ungroupedCount,
        })
      : t('page.needed_items.items_count', { count: props.totalCount }, props.totalCount)
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
  const hasSavedFilters = computed(
    () => activeFilters.value.length > 0 || (props.kappaOnly && isKappaDisabled.value)
  );
  const clearAllFilters = () => {
    filterChipDescriptors.forEach((descriptor) => descriptor.clear());
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
