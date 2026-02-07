<template>
  <div class="mb-6 space-y-3">
    <!-- Primary Filter: ALL / TASKS / HIDEOUT (Centered) -->
    <div
      role="tablist"
      :aria-label="$t('needed_items.filter_type_label')"
      class="bg-surface-900 flex flex-wrap items-center justify-center gap-1 overflow-x-auto rounded-lg border border-white/12 px-3 py-2.5 shadow-sm sm:gap-2 sm:px-4 sm:py-3"
    >
      <UButton
        v-if="allTab"
        role="tab"
        :aria-selected="modelValue === allTab.value"
        :tabindex="modelValue === allTab.value ? 0 : -1"
        :variant="'ghost'"
        :color="'neutral'"
        size="sm"
        class="shrink-0 px-2 sm:px-3"
        :class="{
          'border-surface-200 rounded-none border-b-2': modelValue === allTab.value,
        }"
        @click="$emit('update:modelValue', allTab.value)"
      >
        <UIcon :name="allTab.icon" class="h-4 w-4 sm:mr-1 sm:h-5 sm:w-5" />
        <span class="hidden text-[clamp(0.625rem,2vw,0.875rem)] sm:inline">
          {{ allTab.label.toUpperCase() }}
        </span>
        <span
          :class="[
            'ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white sm:ml-2 sm:h-7 sm:min-w-7 sm:px-1.5 sm:text-sm',
            getTabBadgeColor(allTab),
          ]"
        >
          {{ allTab.count }}
        </span>
      </UButton>
      <span
        v-if="showAllDivider"
        aria-hidden="true"
        class="bg-surface-700/60 h-6 w-px self-center"
      ></span>
      <!-- Remaining tabs -->
      <UButton
        v-for="tab in otherTabs"
        :key="tab.value"
        role="tab"
        :aria-selected="modelValue === tab.value"
        :tabindex="modelValue === tab.value ? 0 : -1"
        :variant="'ghost'"
        :color="'neutral'"
        size="sm"
        class="shrink-0 px-2 sm:px-3"
        :class="{
          'border-surface-200 rounded-none border-b-2': modelValue === tab.value,
        }"
        @click="$emit('update:modelValue', tab.value)"
      >
        <UIcon :name="tab.icon" class="h-4 w-4 sm:mr-1 sm:h-5 sm:w-5" />
        <span class="hidden text-[clamp(0.625rem,2vw,0.875rem)] sm:inline">
          {{ tab.label.toUpperCase() }}
        </span>
        <span
          :class="[
            'ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white sm:ml-2 sm:h-7 sm:min-w-7 sm:px-1.5 sm:text-sm',
            getTabBadgeColor(tab),
          ]"
        >
          {{ tab.count }}
        </span>
      </UButton>
    </div>
    <!-- Unified Filter Bar: Search + Filters + Views -->
    <div
      class="bg-surface-900 flex flex-col gap-3 rounded-lg border border-white/12 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:px-4 sm:py-3"
    >
      <!-- Search (grows to fill space) -->
      <div class="flex-1">
        <UInput
          ref="searchInput"
          :model-value="search"
          :placeholder="$t('page.needed_items.search_placeholder')"
          icon="i-mdi-magnify"
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
        <!-- Divider (hidden on mobile) -->
        <div class="hidden h-6 w-px bg-white/10 sm:block" />
        <!-- Sort Popover -->
        <UPopover>
          <UButton
            icon="i-mdi-sort"
            color="neutral"
            variant="ghost"
            size="sm"
            class="shrink-0"
            :title="$t('page.needed_items.sort.label')"
            :aria-label="$t('page.needed_items.sort.label')"
          />
          <template #content>
            <div class="w-64 space-y-3 p-3">
              <div class="text-surface-400 text-xs font-medium">
                {{ $t('page.needed_items.sort.by') }}
              </div>
              <div class="flex flex-col gap-2">
                <UButton
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  :variant="sortBy === opt.value ? 'soft' : 'ghost'"
                  :color="sortBy === opt.value ? 'primary' : 'neutral'"
                  size="sm"
                  class="justify-between"
                  @click="setSort(opt.value)"
                >
                  <span class="flex items-center gap-2">
                    <UIcon :name="opt.icon" class="h-4 w-4" />
                    {{ opt.label }}
                  </span>
                  <UIcon
                    v-if="sortBy === opt.value"
                    :name="sortDirection === 'asc' ? 'i-mdi-arrow-up' : 'i-mdi-arrow-down'"
                    class="h-4 w-4"
                  />
                </UButton>
              </div>
            </div>
          </template>
        </UPopover>
        <!-- Filters Popover -->
        <UPopover>
          <UButton
            icon="i-mdi-filter-variant"
            color="neutral"
            variant="ghost"
            size="sm"
            class="shrink-0"
            :title="$t('page.needed_items.filters.label')"
            :aria-label="$t('page.needed_items.filters.label')"
          >
            <UBadge
              v-if="activeFiltersCount > 0"
              color="primary"
              variant="soft"
              size="sm"
              class="ml-1 px-1.5 py-0.5"
            >
              {{ activeFiltersCount }}
            </UBadge>
          </UButton>
          <template #content>
            <div class="w-80 space-y-3 p-3">
              <div class="text-surface-400 text-xs font-medium">
                {{ $t('page.needed_items.filters.sections.items') }}
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  :variant="firFilter === 'fir' ? 'soft' : 'ghost'"
                  :color="firFilter === 'fir' ? 'success' : 'neutral'"
                  size="sm"
                  @click="$emit('update:firFilter', firFilter === 'fir' ? 'all' : 'fir')"
                >
                  <UIcon name="i-mdi-checkbox-marked-circle" class="mr-1 h-4 w-4" />
                  {{ $t('page.needed_items.filters.fir') }}
                </UButton>
                <UButton
                  :variant="firFilter === 'non-fir' ? 'soft' : 'ghost'"
                  :color="firFilter === 'non-fir' ? 'warning' : 'neutral'"
                  size="sm"
                  @click="$emit('update:firFilter', firFilter === 'non-fir' ? 'all' : 'non-fir')"
                >
                  <UIcon name="i-mdi-checkbox-blank-circle-outline" class="mr-1 h-4 w-4" />
                  {{ $t('page.needed_items.filters.non_fir') }}
                </UButton>
                <!-- Hide Owned Toggle -->
                <UButton
                  :variant="hideOwned ? 'soft' : 'ghost'"
                  :color="hideOwned ? 'primary' : 'neutral'"
                  size="sm"
                  @click="$emit('update:hideOwned', !hideOwned)"
                >
                  <UIcon name="i-mdi-check-circle-outline" class="mr-1 h-4 w-4" />
                  {{
                    hideOwned
                      ? $t('page.needed_items.filters.show_owned')
                      : $t('page.needed_items.filters.hide_owned')
                  }}
                </UButton>
                <AppTooltip
                  :text="$t('page.needed_items.filters.hide_non_fir_special_equipment_title')"
                >
                  <UButton
                    :variant="hideNonFirSpecialEquipment ? 'soft' : 'ghost'"
                    :color="hideNonFirSpecialEquipment ? 'primary' : 'neutral'"
                    size="sm"
                    @click="$emit('update:hideNonFirSpecialEquipment', !hideNonFirSpecialEquipment)"
                  >
                    <UIcon name="i-mdi-briefcase-outline" class="mr-1 h-4 w-4" />
                    {{
                      hideNonFirSpecialEquipment
                        ? $t('page.needed_items.filters.no_special')
                        : $t('page.needed_items.filters.special')
                    }}
                  </UButton>
                </AppTooltip>
                <AppTooltip
                  :text="
                    isKappaDisabled
                      ? $t('page.needed_items.filters.kappa_only_disabled_tooltip')
                      : $t('page.needed_items.filters.kappa_only_tooltip')
                  "
                >
                  <UButton
                    :variant="kappaOnly ? 'soft' : 'ghost'"
                    :color="kappaOnly ? 'warning' : 'neutral'"
                    size="sm"
                    :disabled="isKappaDisabled"
                    @click="$emit('update:kappaOnly', !kappaOnly)"
                  >
                    <UIcon name="i-mdi-trophy" class="mr-1 h-4 w-4" />
                    {{ $t('page.needed_items.filters.kappa_only') }}
                  </UButton>
                </AppTooltip>
              </div>
              <div class="border-t border-white/10 pt-3">
                <div class="text-surface-400 mb-2 text-xs font-medium">
                  {{ $t('page.needed_items.filters.sections.team') }}
                </div>
                <UButton
                  :variant="hideTeamItems ? 'soft' : 'ghost'"
                  :color="hideTeamItems ? 'error' : 'neutral'"
                  size="sm"
                  class="w-full justify-start"
                  @click="$emit('update:hideTeamItems', !hideTeamItems)"
                >
                  <UIcon name="i-mdi-account-group-outline" class="mr-1 h-4 w-4" />
                  {{
                    hideTeamItems
                      ? $t('page.needed_items.filters.hide_team_needs')
                      : $t('page.needed_items.filters.show_team_needs')
                  }}
                </UButton>
              </div>
            </div>
          </template>
        </UPopover>
        <!-- Divider (hidden on mobile) -->
        <div class="hidden h-6 w-px bg-white/10 sm:block" />
        <!-- View Mode Buttons -->
        <div class="flex items-center gap-1">
          <UButton
            icon="i-mdi-view-list"
            :color="!groupByItem && viewMode === 'list' ? 'primary' : 'neutral'"
            :variant="!groupByItem && viewMode === 'list' ? 'soft' : 'ghost'"
            size="sm"
            :title="$t('page.needed_items.view.list')"
            :aria-label="$t('page.needed_items.view.list')"
            @click="setViewMode('list')"
          />
          <UButton
            icon="i-mdi-view-grid"
            :color="!groupByItem && viewMode === 'grid' ? 'primary' : 'neutral'"
            :variant="!groupByItem && viewMode === 'grid' ? 'soft' : 'ghost'"
            size="sm"
            :title="$t('page.needed_items.view.grid')"
            :aria-label="$t('page.needed_items.view.grid')"
            @click="setViewMode('grid')"
          />
          <UButton
            icon="i-mdi-group"
            :color="groupByItem ? 'primary' : 'neutral'"
            :variant="groupByItem ? 'soft' : 'ghost'"
            size="sm"
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
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
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
  const allTab = computed(() => props.filterTabs.find((tab) => tab.value === 'all'));
  const otherTabs = computed(() =>
    props.filterTabs.filter((tab) => {
      if (tab.value === 'all') return false;
      if (tab.value === 'completed' && tab.count <= 0) return false;
      return true;
    })
  );
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
  const showAllDivider = computed(() => allTab.value && otherTabs.value.length > 0);
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
  const isKappaDisabled = computed(() => {
    return props.modelValue === 'hideout';
  });
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
  const setViewMode = (mode: ViewMode) => {
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
    emit('update:groupByItem', true);
  };
  const setSort = (value: SortBy) => {
    if (props.sortBy === value) {
      emit('update:sortDirection', props.sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      emit('update:sortBy', value);
      emit('update:sortDirection', value === 'priority' || value === 'count' ? 'desc' : 'asc');
    }
  };
</script>
