<template>
  <div class="w-full">
    <DashboardUpNext v-if="showGuidance" in-task-list />
    <UAlert
      v-else
      icon="i-mdi-clipboard-search"
      color="primary"
      variant="soft"
      :title="title"
      :description="description"
      :actions="actions"
    />
  </div>
</template>
<script setup lang="ts">
  import DashboardUpNext from '@/features/dashboard/DashboardUpNext.vue';
  import { useTaskContentFilters } from '@/features/tasks/composables/useTaskContentFilters';
  import { usePreferencesStore } from '@/stores/usePreferences';
  const props = defineProps<{
    isSearching?: boolean;
    reputationFiltered?: boolean;
  }>();
  const emit = defineEmits<{ 'clear-reputation': [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const { activeCount, clearAll } = useTaskContentFilters();
  const preferences = usePreferencesStore();
  const isPersonalAvailableList = computed(
    () =>
      preferences.getTaskPrimaryView === 'all' &&
      preferences.getTaskSecondaryView === 'available' &&
      preferences.getTaskUserView === 'self'
  );
  const showGuidance = computed(
    () =>
      isPersonalAvailableList.value &&
      !props.isSearching &&
      !props.reputationFiltered &&
      activeCount.value === 0
  );
  const title = computed(() => {
    if (props.reputationFiltered) {
      return t(
        'page.tasks.map.raid_plan.no_reputation_matches',
        'No mapped quests match this filter.'
      );
    }
    return t(props.isSearching ? 'page.tasks.no_search_matches' : 'page.tasks.no_tasks_found');
  });
  const description = computed(() => {
    if (props.reputationFiltered) return undefined;
    return t(
      props.isSearching
        ? 'page.tasks.no_search_matches_description'
        : 'page.tasks.no_tasks_found_description'
    );
  });
  // Offer the way out right where the list came up empty, instead of sending people hunting for it.
  // Filters still apply while searching, so they can be what empties a search too.
  const actions = computed(() => {
    const resets = [];
    if (props.reputationFiltered) {
      resets.push({
        label: t('page.tasks.map.raid_plan.clear_reputation_filter', 'Clear reputation filter'),
        color: 'primary' as const,
        variant: 'soft' as const,
        onClick: () => emit('clear-reputation'),
      });
    }
    if (activeCount.value > 0) {
      resets.push({
        label: t('filter_menu.clear_filters', { count: activeCount.value }),
        icon: 'i-mdi-filter-remove-outline',
        color: 'primary' as const,
        variant: 'soft' as const,
        onClick: clearAll,
      });
    }
    return resets;
  });
</script>
