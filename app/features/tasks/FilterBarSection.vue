<template>
  <section class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
    <div class="mb-2 flex items-center gap-2">
      <UIcon name="i-mdi-filter-variant" class="text-success-400 h-4 w-4" />
      <h3 class="text-xs font-semibold tracking-wide text-white uppercase">
        {{ t('page.tasks.settings.tabs.filter_bar') }}
      </h3>
    </div>
    <p class="text-surface-500 mb-2 text-xs">
      {{ t('page.tasks.settings.filter_bar.hint') }}
    </p>
    <div class="space-y-1">
      <label
        v-for="filter in filters"
        :key="filter.key"
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="filter.model.value" />
        <span class="text-surface-200 text-sm">
          {{ t(`page.tasks.settings.filter_bar.${filter.key}`, filter.key) }}
        </span>
      </label>
    </div>
  </section>
</template>
<script setup lang="ts">
  const props = defineProps<{
    showAllFilter: boolean;
    showAvailableFilter: boolean;
    showLockedFilter: boolean;
    showCompletedFilter: boolean;
    showFailedFilter: boolean;
  }>();
  const emit = defineEmits<{
    'update:showAllFilter': [value: boolean];
    'update:showAvailableFilter': [value: boolean];
    'update:showLockedFilter': [value: boolean];
    'update:showCompletedFilter': [value: boolean];
    'update:showFailedFilter': [value: boolean];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const showAllFilterModel = computed({
    get: () => props.showAllFilter,
    set: (value: boolean) => emit('update:showAllFilter', value),
  });
  const showAvailableFilterModel = computed({
    get: () => props.showAvailableFilter,
    set: (value: boolean) => emit('update:showAvailableFilter', value),
  });
  const showLockedFilterModel = computed({
    get: () => props.showLockedFilter,
    set: (value: boolean) => emit('update:showLockedFilter', value),
  });
  const showCompletedFilterModel = computed({
    get: () => props.showCompletedFilter,
    set: (value: boolean) => emit('update:showCompletedFilter', value),
  });
  const showFailedFilterModel = computed({
    get: () => props.showFailedFilter,
    set: (value: boolean) => emit('update:showFailedFilter', value),
  });
  const filters = [
    { key: 'all_filter', model: showAllFilterModel },
    { key: 'available_filter', model: showAvailableFilterModel },
    { key: 'locked_filter', model: showLockedFilterModel },
    { key: 'completed_filter', model: showCompletedFilterModel },
    { key: 'failed_filter', model: showFailedFilterModel },
  ];
</script>
