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
      {{ scopeText }}
      <UButton
        variant="link"
        color="primary"
        size="xs"
        class="ml-1 p-0 align-baseline"
        @click="$emit('clear')"
      >
        {{ clearText }}
      </UButton>
    </span>
  </div>
</template>
<script setup lang="ts">
  import type { TaskSecondaryView } from '@/types/taskFilter';
  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps<{
    pinnedStatus?: TaskSecondaryView | null;
    query: string;
    returnStatus: TaskSecondaryView;
    visible: boolean;
  }>();
  defineEmits<{
    clear: [];
  }>();
  const statusLabel = (status: TaskSecondaryView) => t(`common.${status}`);
  const scopeText = computed(() =>
    props.pinnedStatus
      ? t('page.tasks.search_scope.pinned_status', {
          query: props.query,
          status: statusLabel(props.pinnedStatus),
        })
      : t('page.tasks.search_scope.all_statuses', { query: props.query })
  );
  // Name the tab clearing returns to whenever it differs from the one being shown.
  const clearText = computed(() =>
    (props.pinnedStatus ?? 'all') === props.returnStatus
      ? t('common.clear_search')
      : t('page.tasks.search_scope.clear_and_return', { status: statusLabel(props.returnStatus) })
  );
</script>
