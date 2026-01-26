<template>
  <div class="mb-6 space-y-3">
    <!-- Top Bar: Search (left) | Primary View Tabs (center) | Settings (right) -->
    <div class="bg-surface-950 flex items-center gap-3 rounded-lg px-4 py-2.5">
      <!-- Search - larger width -->
      <div class="w-56 shrink-0 sm:w-64 lg:w-72">
        <UInput
          :model-value="searchQuery"
          :placeholder="t('page.tasks.search.placeholder', 'Search...')"
          :aria-label="t('page.tasks.search.ariaLabel', 'Search tasks')"
          icon="i-mdi-magnify"
          size="sm"
          :ui="{ trailing: 'pe-1' }"
          class="w-full"
          @update:model-value="$emit('update:searchQuery', $event)"
        >
          <template v-if="searchQuery?.length" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="xs"
              icon="i-mdi-close-circle"
              aria-label="Clear search"
              @click="$emit('update:searchQuery', '')"
            />
          </template>
        </UInput>
      </div>
      <!-- Primary View Tabs - centered -->
      <div class="flex flex-1 items-center justify-center gap-1">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="primaryView === 'all'"
          :class="primaryView === 'all' ? 'bg-white/10 text-white' : 'text-gray-400'"
          @click="setPrimaryView('all')"
        >
          <UIcon name="i-mdi-checkbox-multiple-marked" class="h-4 w-4 sm:mr-1.5" />
          <span class="hidden text-xs sm:inline">
            {{ t('page.tasks.primaryviews.all').toUpperCase() }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="primaryView === 'traders'"
          :class="primaryView === 'traders' ? 'bg-white/10 text-white' : 'text-gray-400'"
          @click="setPrimaryView('traders')"
        >
          <UIcon name="i-mdi-account-group" class="h-4 w-4 sm:mr-1.5" />
          <span class="hidden text-xs sm:inline">
            {{ t('page.tasks.primaryviews.traders').toUpperCase() }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="primaryView === 'maps'"
          :class="primaryView === 'maps' ? 'bg-white/10 text-white' : 'text-gray-400'"
          @click="setPrimaryView('maps')"
        >
          <UIcon name="i-mdi-map" class="h-4 w-4 sm:mr-1.5" />
          <span class="hidden text-xs sm:inline">
            {{ t('page.tasks.primaryviews.maps').toUpperCase() }}
          </span>
        </UButton>
      </div>
      <!-- Sort + Settings -->
      <div class="flex shrink-0 items-center gap-2">
        <USelectMenu
          v-model="taskSortMode"
          :items="sortOptions"
          value-key="value"
          size="sm"
          class="w-36 sm:w-44"
        >
          <template #leading>
            <UIcon :name="currentSortIcon" class="h-4 w-4" />
          </template>
          <template #item="{ item }">
            <div class="flex items-center gap-2">
              <UIcon :name="item.icon" class="h-4 w-4" />
              <span>{{ item.label }}</span>
            </div>
          </template>
        </USelectMenu>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :icon="sortDirectionIcon"
          :aria-label="sortDirectionLabel"
          @click="toggleSortDirection"
        />
        <TaskSettingsModal />
      </div>
    </div>
    <!-- Secondary filters: Status Filters + User View (centered) -->
    <div class="bg-surface-950 flex items-center justify-center gap-3 rounded-lg px-4 py-2.5">
      <!-- Status filters (ALL / AVAILABLE / LOCKED / COMPLETED) -->
      <div class="flex items-center gap-1">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="secondaryView === 'all'"
          :class="secondaryView === 'all' ? 'bg-white/10 text-white' : 'text-gray-400'"
          @click="setSecondaryView('all')"
        >
          <UIcon name="i-mdi-format-list-bulleted" class="hidden h-4 w-4 sm:mr-1 sm:block" />
          <span class="text-xs sm:text-sm">ALL</span>
          <span
            class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-xs font-bold text-white"
          >
            {{ statusCounts.all }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="secondaryView === 'available'"
          :class="secondaryView === 'available' ? 'bg-white/10 text-white' : 'text-gray-400'"
          @click="setSecondaryView('available')"
        >
          <UIcon name="i-mdi-clipboard-text" class="hidden h-4 w-4 sm:mr-1 sm:block" />
          <span class="text-xs sm:text-sm">
            {{ t('page.tasks.secondaryviews.available').toUpperCase() }}
          </span>
          <span
            class="bg-primary-500 ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
          >
            {{ statusCounts.available }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="secondaryView === 'locked'"
          :class="secondaryView === 'locked' ? 'bg-white/10 text-white' : 'text-gray-400'"
          @click="setSecondaryView('locked')"
        >
          <UIcon name="i-mdi-lock" class="hidden h-4 w-4 sm:mr-1 sm:block" />
          <span class="text-xs sm:text-sm">
            {{ t('page.tasks.secondaryviews.locked').toUpperCase() }}
          </span>
          <span
            class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-600 px-1 text-xs font-bold text-white"
          >
            {{ statusCounts.locked }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="secondaryView === 'completed'"
          :class="secondaryView === 'completed' ? 'bg-white/10 text-white' : 'text-gray-400'"
          @click="setSecondaryView('completed')"
        >
          <UIcon name="i-mdi-check-circle" class="hidden h-4 w-4 sm:mr-1 sm:block" />
          <span class="text-xs sm:text-sm">
            {{ t('page.tasks.secondaryviews.completed').toUpperCase() }}
          </span>
          <span
            class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1 text-xs font-bold text-white"
          >
            {{ statusCounts.completed }}
          </span>
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="secondaryView === 'failed'"
          :class="secondaryView === 'failed' ? 'bg-white/10 text-white' : 'text-gray-400'"
          @click="setSecondaryView('failed')"
        >
          <UIcon name="i-mdi-close-circle" class="hidden h-4 w-4 sm:mr-1 sm:block" />
          <span class="text-xs sm:text-sm">
            {{ t('page.tasks.secondaryviews.failed', 'FAILED').toUpperCase() }}
          </span>
          <span
            class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white"
          >
            {{ statusCounts.failed }}
          </span>
        </UButton>
      </div>
      <!-- Divider -->
      <div class="h-6 w-px shrink-0 bg-white/20" />
      <!-- Player/Team view buttons -->
      <div class="flex items-center gap-1">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="preferencesStore.getTaskUserView === 'self'"
          :class="
            preferencesStore.getTaskUserView === 'self' ? 'bg-white/10 text-white' : 'text-gray-400'
          "
          @click="onUserViewSelect({ label: currentUserDisplayName, value: 'self' })"
        >
          <UIcon name="i-mdi-account-circle" class="h-4 w-4 sm:mr-1" />
          <span class="hidden text-xs sm:inline sm:text-sm">
            {{ currentUserDisplayName.toUpperCase() }}
          </span>
          <UBadge size="xs" color="primary" variant="solid" class="ml-1">YOU</UBadge>
        </UButton>
        <UButton
          v-for="teamId in visibleTeammates"
          :key="teamId"
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="preferencesStore.getTaskUserView === teamId"
          :class="
            preferencesStore.getTaskUserView === teamId ? 'bg-white/10 text-white' : 'text-gray-400'
          "
          @click="onUserViewSelect({ label: getTeammateDisplayName(teamId), value: teamId })"
        >
          <UIcon name="i-mdi-account" class="h-4 w-4 sm:mr-1" />
          <span class="text-xs sm:text-sm">{{ getTeammateDisplayName(teamId).toUpperCase() }}</span>
        </UButton>
        <UButton
          v-if="visibleTeammates.length > 0"
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="preferencesStore.getTaskUserView === 'all'"
          :class="
            preferencesStore.getTaskUserView === 'all' ? 'bg-white/10 text-white' : 'text-gray-400'
          "
          @click="onUserViewSelect({ label: t('page.tasks.userviews.all'), value: 'all' })"
        >
          <UIcon name="i-mdi-account-multiple" class="h-4 w-4 sm:mr-1" />
          <span class="text-xs sm:text-sm">{{ t('page.tasks.userviews.all').toUpperCase() }}</span>
        </UButton>
      </div>
    </div>
    <!-- Map selector (shown when MAPS is selected) - Horizontal scrollable -->
    <div v-if="primaryView === 'maps' && maps.length > 0" class="w-full overflow-x-auto">
      <div
        class="bg-surface-950 flex w-max min-w-full items-center justify-center gap-1 rounded-lg px-4 py-2.5"
      >
        <button
          v-for="mapOption in mapOptions"
          :key="mapOption.value"
          type="button"
          :aria-pressed="preferencesStore.getTaskMapView === mapOption.value"
          :class="[
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            'hover:bg-white/5',
            'focus:ring-primary-500 focus:ring-1 focus:outline-none',
            preferencesStore.getTaskMapView === mapOption.value
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:text-white',
          ]"
          @click="onMapSelect(mapOption)"
        >
          <span class="whitespace-nowrap">{{ mapOption.label }}</span>
          <span
            :class="[
              'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white',
              (mapOption.count ?? 0) > 0 ? 'bg-primary-500' : 'bg-gray-600',
            ]"
          >
            {{ mapOption.count ?? 0 }}
          </span>
        </button>
        <!-- Divider -->
        <div class="mx-2 h-6 w-px shrink-0 bg-white/20" />
        <!-- Global Tasks Toggle -->
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-pressed="showGlobalTasks"
          :title="
            showGlobalTasks
              ? t('page.tasks.filters.hide_global_tasks', 'Hide Global Tasks')
              : t('page.tasks.filters.show_global_tasks', 'Show Global Tasks')
          "
          :class="showGlobalTasks ? 'bg-white/10 text-white' : 'text-gray-400'"
          @click="toggleGlobalTasks"
        >
          <UIcon name="i-mdi-earth" class="h-4 w-4 sm:mr-1" />
          <span class="hidden text-xs uppercase sm:inline">
            {{
              showGlobalTasks
                ? t('page.tasks.filters.hide_global_tasks', 'Hide Global Tasks')
                : t('page.tasks.filters.show_global_tasks', 'Show Global Tasks')
            }}
          </span>
        </UButton>
      </div>
    </div>
    <!-- Trader selector (shown when TRADERS is selected) - Horizontal scrollable -->
    <div v-if="primaryView === 'traders' && traders.length > 0" class="w-full overflow-x-auto">
      <div class="bg-surface-950 flex w-max min-w-full justify-center gap-1 rounded-lg px-4 py-2.5">
        <button
          v-for="trader in traders"
          :key="trader.id"
          type="button"
          :aria-pressed="preferencesStore.getTaskTraderView === trader.id"
          :class="[
            'flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors',
            'hover:bg-white/5',
            'focus:ring-primary-500 focus:ring-1 focus:outline-none',
            preferencesStore.getTaskTraderView === trader.id
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:text-white',
          ]"
          @click="onTraderSelect({ label: trader.name, value: trader.id })"
        >
          <!-- Trader avatar with count badge -->
          <div class="relative">
            <div class="h-8 w-8 overflow-hidden rounded-full bg-gray-800">
              <img
                v-if="trader.imageLink"
                :src="trader.imageLink"
                :alt="trader.name"
                class="h-full w-full object-cover"
              />
              <UIcon v-else name="i-mdi-account-circle" class="h-full w-full text-gray-400" />
            </div>
            <span
              :class="[
                'absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-bold text-white',
                (traderCounts[trader.id] ?? 0) > 0 ? 'bg-primary-500' : 'bg-gray-600',
              ]"
            >
              {{ traderCounts[trader.id] ?? 0 }}
            </span>
          </div>
          <span class="text-xs font-medium whitespace-nowrap">{{ trader.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useTaskFiltering } from '@/composables/useTaskFiltering';
  import TaskSettingsModal from '@/features/tasks/TaskSettingsModal.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTeamStore } from '@/stores/useTeamStore';
  import { TASK_SORT_MODES, type TaskSortDirection, type TaskSortMode } from '@/types/taskSort';
  defineProps<{
    searchQuery: string;
  }>();
  defineEmits<{
    'update:searchQuery': [value: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const metadataStore = useMetadataStore();
  const progressStore = useProgressStore();
  const teamStore = useTeamStore();
  const { calculateMapTaskTotals, calculateStatusCounts, calculateTraderCounts } =
    useTaskFiltering();
  const maps = computed(() => metadataStore.mapsWithSvg);
  const traders = computed(() => metadataStore.sortedTraders);
  // Get current user's display name
  const currentUserDisplayName = computed(() => {
    return progressStore.getDisplayName('self');
  });
  // Get visible teammates (excluding self)
  const visibleTeammates = computed(() => {
    return teamStore.teammates || [];
  });
  // Helper to get teammate display name
  const getTeammateDisplayName = (teamId: string): string => {
    return progressStore.getDisplayName(teamId);
  };
  // Calculate task counts for badges
  const statusCounts = computed(() => {
    const userView = preferencesStore.getTaskUserView;
    return calculateStatusCounts(userView);
  });
  type SortOption = {
    value: TaskSortMode;
    label: string;
    icon: string;
  };
  const SORT_MODE_ICONS: Record<TaskSortMode, string> = {
    none: 'i-mdi-sort',
    impact: 'i-mdi-chart-line',
    alphabetical: 'i-mdi-sort-alphabetical-ascending',
    level: 'i-mdi-sort-numeric-ascending',
    trader: 'i-mdi-account',
    teammates: 'i-mdi-account-multiple',
    xp: 'i-mdi-star',
  };
  const SORT_MODE_FALLBACK_LABELS: Record<TaskSortMode, string> = {
    none: 'Default order',
    impact: 'Impact',
    alphabetical: 'Alphabetical',
    level: 'Level required',
    trader: 'Trader order',
    teammates: 'Teammates available',
    xp: 'XP Reward',
  };
  const sortOptions = computed<SortOption[]>(() =>
    TASK_SORT_MODES.map((mode) => ({
      value: mode,
      label: t(`page.tasks.sort.${mode}`, SORT_MODE_FALLBACK_LABELS[mode]),
      icon: SORT_MODE_ICONS[mode],
    }))
  );
  const validSortModes = new Set<TaskSortMode>(TASK_SORT_MODES);
  /**
   * Normalize sort mode value from various input formats.
   * Handles: string values, objects with 'value' property, or null/undefined.
   */
  const normalizeSortMode = (value: unknown): TaskSortMode => {
    // Extract candidate from value: direct string, object.value, or null
    let candidate: unknown = null;
    if (typeof value === 'string') {
      candidate = value;
    } else if (value && typeof value === 'object' && 'value' in value) {
      candidate = (value as { value?: unknown }).value;
    }
    // Validate candidate against valid sort modes
    if (typeof candidate === 'string' && validSortModes.has(candidate as TaskSortMode)) {
      return candidate as TaskSortMode;
    }
    return 'none';
  };
  const taskSortMode = computed({
    get: (): TaskSortMode => normalizeSortMode(preferencesStore.getTaskSortMode),
    set: (value: TaskSortMode) => preferencesStore.setTaskSortMode(normalizeSortMode(value)),
  });
  const taskSortDirection = computed({
    get: () => preferencesStore.getTaskSortDirection,
    set: (value: TaskSortDirection) => preferencesStore.setTaskSortDirection(value),
  });
  const sortDirectionIcon = computed(() =>
    taskSortDirection.value === 'asc' ? 'i-mdi-sort-ascending' : 'i-mdi-sort-descending'
  );
  const sortDirectionLabel = computed(() =>
    taskSortDirection.value === 'asc'
      ? t('page.tasks.sort.ascending', 'Ascending')
      : t('page.tasks.sort.descending', 'Descending')
  );
  const toggleSortDirection = () => {
    taskSortDirection.value = taskSortDirection.value === 'asc' ? 'desc' : 'asc';
  };
  const currentSortIcon = computed(() => {
    return SORT_MODE_ICONS[taskSortMode.value] ?? 'i-mdi-sort';
  });
  const traderCounts = computed(() => {
    const userView = preferencesStore.getTaskUserView;
    const secondaryView = preferencesStore.getTaskSecondaryView;
    return calculateTraderCounts(userView, secondaryView);
  });
  const mergedMaps = computed(() => {
    return maps.value.map((map) => {
      const mergedIds = (map as { mergedIds?: string[] }).mergedIds || [];
      const normalizedIds = mergedIds.includes(map.id) ? mergedIds : [map.id, ...mergedIds];
      return {
        id: map.id,
        mergedIds: normalizedIds.length ? normalizedIds : [map.id],
      };
    });
  });
  const mapTaskCounts = computed(() => {
    if (!metadataStore.tasks.length || !mergedMaps.value.length) return {};
    return calculateMapTaskTotals(
      mergedMaps.value,
      metadataStore.tasks,
      preferencesStore.getHideGlobalTasks,
      preferencesStore.getTaskUserView,
      preferencesStore.getTaskSecondaryView
    );
  });
  // Primary view (all / maps / traders)
  const primaryView = computed(() => preferencesStore.getTaskPrimaryView);
  const setPrimaryView = (view: string) => {
    preferencesStore.setTaskPrimaryView(view);
    // When switching to maps, ensure a map is selected
    if (view === 'maps' && maps.value.length > 0 && preferencesStore.getTaskMapView === 'all') {
      const firstMap = maps.value[0];
      if (firstMap?.id) {
        preferencesStore.setTaskMapView(firstMap.id);
      }
    }
    // When switching to traders, ensure a trader is selected
    if (
      view === 'traders' &&
      traders.value.length > 0 &&
      preferencesStore.getTaskTraderView === 'all'
    ) {
      const firstTrader = traders.value[0];
      if (firstTrader?.id) {
        preferencesStore.setTaskTraderView(firstTrader.id);
      }
    }
  };
  // Secondary view (available / locked / completed)
  const secondaryView = computed(() => preferencesStore.getTaskSecondaryView);
  const setSecondaryView = (view: string) => {
    preferencesStore.setTaskSecondaryView(view);
  };
  // Map selection
  const mapOptions = computed(() => {
    const counts = mapTaskCounts.value;
    return maps.value.map((map) => ({
      label: map.name,
      value: map.id,
      count: counts[map.id] ?? 0,
    }));
  });
  const onMapSelect = (selected: { label: string; value: string }) => {
    if (selected?.value) {
      preferencesStore.setTaskMapView(selected.value);
    }
  };
  // Trader selection
  const onTraderSelect = (selected: { label: string; value: string }) => {
    if (selected?.value) {
      preferencesStore.setTaskTraderView(selected.value);
    }
  };
  // User view selection (yourself / all team members)
  const onUserViewSelect = (selected: { label: string; value: string }) => {
    if (selected?.value) {
      preferencesStore.setTaskUserView(selected.value);
    }
  };
  const showGlobalTasks = computed(() => !preferencesStore.getHideGlobalTasks);
  const toggleGlobalTasks = () => {
    preferencesStore.setHideGlobalTasks(!preferencesStore.getHideGlobalTasks);
  };
</script>
