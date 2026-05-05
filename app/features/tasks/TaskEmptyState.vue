<template>
  <div class="w-full">
    <UAlert
      icon="i-mdi-clipboard-search"
      color="primary"
      variant="soft"
      :title="t('page.tasks.no_tasks_found')"
      :description="
        t(
          'page.tasks.no_tasks_found_description',
          'Try adjusting your filters, selecting a different map, or checking other task categories.'
        )
      "
    />
  </div>
</template>
<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
</script>
