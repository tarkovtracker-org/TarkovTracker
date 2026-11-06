<template>
  <div class="w-full">
    <UAlert
      icon="i-mdi-clipboard-search"
      color="primary"
      variant="soft"
      :title="t(isSearching ? 'page.tasks.no_search_matches' : 'page.tasks.no_tasks_found')"
      :description="
        t(
          isSearching
            ? 'page.tasks.no_search_matches_description'
            : 'page.tasks.no_tasks_found_description'
        )
      "
      :actions="actions"
    />
  </div>
</template>
<script setup lang="ts">
  import { useTaskContentFilters } from '@/features/tasks/composables/useTaskContentFilters';
  defineProps<{
    isSearching?: boolean;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { activeCount, clearAll } = useTaskContentFilters();
  // Offer the way out right where the list came up empty, instead of sending people hunting for it.
  // Filters still apply while searching, so they can be what empties a search too.
  const actions = computed(() => {
    if (activeCount.value === 0) return undefined;
    return [
      {
        label: t('filter_menu.clear_filters', { count: activeCount.value }),
        icon: 'i-mdi-filter-remove-outline',
        color: 'primary' as const,
        variant: 'soft' as const,
        onClick: clearAll,
      },
    ];
  });
</script>
