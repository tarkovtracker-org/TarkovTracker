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
    />
  </div>
</template>
<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
  defineProps<{
    isSearching?: boolean;
  }>();
</script>
