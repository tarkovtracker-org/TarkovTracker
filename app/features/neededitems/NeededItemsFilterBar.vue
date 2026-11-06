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
          v-model:fir-filter="firFilter"
          v-model:hide-owned="hideOwned"
          v-model:hide-team-items="hideTeamItems"
          v-model:hide-non-fir-special-equipment="hideNonFirSpecialEquipment"
          v-model:kappa-only="kappaOnly"
          :active-count="activeFilters.length"
          :can-reset="hasSavedFilters"
          :is-kappa-disabled="isKappaDisabled"
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
          v-model:view-mode="viewMode"
          v-model:group-by-item="groupByItem"
          v-model:card-style="cardStyle"
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
  import type {
    NeededItemsFilterType,
    NeededItemsFirFilter,
    NeededItemsSortBy,
    NeededItemsSortDirection,
  } from '@/features/neededitems/neededitems-constants';
  import type {
    NeededItemsCardStyle,
    NeededItemsViewMode,
  } from '@/features/neededitems/neededItemsFilterNormalization';
  import type { ActiveFilter } from '@/types/filters';
  const props = defineProps<{
    filterTabs: FilterTab[];
    totalCount: number;
    ungroupedCount: number;
  }>();
  const filterType = defineModel<NeededItemsFilterType>({ required: true });
  const viewMode = defineModel<NeededItemsViewMode>('viewMode', { required: true });
  const firFilter = defineModel<NeededItemsFirFilter>('firFilter', { required: true });
  const groupByItem = defineModel<boolean>('groupByItem', { required: true });
  const hideTeamItems = defineModel<boolean>('hideTeamItems', { required: true });
  const hideNonFirSpecialEquipment = defineModel<boolean>('hideNonFirSpecialEquipment', {
    required: true,
  });
  const kappaOnly = defineModel<boolean>('kappaOnly', { required: true });
  const sortBy = defineModel<NeededItemsSortBy>('sortBy', { required: true });
  const sortDirection = defineModel<NeededItemsSortDirection>('sortDirection', { required: true });
  const hideOwned = defineModel<boolean>('hideOwned', { required: true });
  const cardStyle = defineModel<NeededItemsCardStyle>('cardStyle', { required: true });
  const { t } = useI18n({ useScope: 'global' });
  const activeFilter = computed({
    get: () => filterType.value,
    set: (value: unknown) => {
      filterType.value = normalizeNeededItemsFilterType(value);
    },
  });
  // Completed only gets a tab once something is done, or while it is the picked filter.
  const isTabShown = (tab: FilterTab) =>
    tab.value !== 'completed' || tab.count > 0 || tab.value === filterType.value;
  const visibleFilterTabs = computed(() => props.filterTabs.filter(isTabShown));
  const countLabel = computed(() =>
    groupByItem.value && props.ungroupedCount !== props.totalCount
      ? t('page.needed_items.unique_items_count', {
          unique: props.totalCount,
          total: props.ungroupedCount,
        })
      : t('page.needed_items.items_count', { count: props.totalCount }, props.totalCount)
  );
  // Kappa only narrows task needs, so it does nothing on the Hideout tab.
  const isKappaDisabled = computed(() => filterType.value === 'hideout');
  interface FilterChipDescriptor {
    key: string;
    isActive: () => boolean;
    labelKey: () => string;
    clear: () => void;
  }
  const filterChipDescriptors: FilterChipDescriptor[] = [
    {
      key: 'fir',
      isActive: () => firFilter.value !== 'all',
      labelKey: () => `page.needed_items.filters.chips.${firFilter.value.replace('-', '_')}`,
      clear: () => (firFilter.value = 'all'),
    },
    {
      key: 'hide_owned',
      isActive: () => hideOwned.value,
      labelKey: () => 'page.needed_items.filters.chips.hide_owned',
      clear: () => (hideOwned.value = false),
    },
    {
      key: 'hide_team',
      isActive: () => hideTeamItems.value,
      labelKey: () => 'page.needed_items.filters.chips.hide_team',
      clear: () => (hideTeamItems.value = false),
    },
    {
      key: 'hide_special_equipment',
      isActive: () => hideNonFirSpecialEquipment.value,
      labelKey: () => 'page.needed_items.filters.chips.hide_special_equipment',
      clear: () => (hideNonFirSpecialEquipment.value = false),
    },
    {
      key: 'kappa_only',
      isActive: () => kappaOnly.value && !isKappaDisabled.value,
      labelKey: () => 'page.needed_items.filters.chips.kappa_only',
      clear: () => (kappaOnly.value = false),
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
    () => activeFilters.value.length > 0 || (kappaOnly.value && isKappaDisabled.value)
  );
  const clearAllFilters = () => {
    filterChipDescriptors.forEach((descriptor) => descriptor.clear());
  };
  const sortOptions = computed(() => [
    {
      label: t('common.priority'),
      value: 'priority' as NeededItemsSortBy,
      icon: 'i-mdi-alert-circle-outline',
    },
    {
      label: t('page.needed_items.sort.name'),
      value: 'name' as NeededItemsSortBy,
      icon: 'i-mdi-format-title',
    },
    {
      label: t('page.needed_items.sort.category'),
      value: 'category' as NeededItemsSortBy,
      icon: 'i-mdi-shape-outline',
    },
    {
      label: t('page.needed_items.sort.count'),
      value: 'count' as NeededItemsSortBy,
      icon: 'i-mdi-counter',
    },
  ]);
  const selectedSortBy = computed({
    get: () => sortBy.value,
    set: (value: unknown) => {
      setSort(value);
    },
  });
  const setSort = (value: unknown) => {
    const normalizedSortBy = normalizeNeededItemsSortBy(value);
    if (sortBy.value === normalizedSortBy) {
      toggleSortDirection();
      return;
    }
    sortBy.value = normalizedSortBy;
    sortDirection.value =
      normalizedSortBy === 'priority' || normalizedSortBy === 'count' ? 'desc' : 'asc';
  };
  const toggleSortDirection = () => {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  };
</script>
