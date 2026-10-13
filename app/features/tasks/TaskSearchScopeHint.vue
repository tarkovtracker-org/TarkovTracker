<template>
  <div
    v-if="visible"
    data-testid="task-search-scope-hint"
    class="text-surface-300 -mt-1 mb-3 flex items-start gap-2 px-1 text-xs sm:text-sm"
    role="status"
  >
    <UIcon
      name="i-mdi-magnify"
      class="text-surface-400 mt-0.5 h-4 w-4 shrink-0"
      aria-hidden="true"
    />
    <span class="min-w-0">
      {{ t('page.tasks.search_scope.all_statuses', { query }) }}
      <UButton
        variant="link"
        color="primary"
        size="xs"
        class="ml-1 p-0 align-baseline"
        @click="$emit('clear')"
      >
        {{ t('common.clear_search') }}
      </UButton>
    </span>
  </div>
</template>
<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
  defineProps<{
    query: string;
    visible: boolean;
  }>();
  defineEmits<{
    clear: [];
  }>();
</script>
