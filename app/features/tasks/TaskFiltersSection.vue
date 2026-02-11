<template>
  <section class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
    <div class="mb-2 flex items-center gap-2">
      <UIcon name="i-mdi-filter-variant" class="text-primary-400 h-4 w-4" />
      <h3 class="text-xs font-semibold tracking-wide text-white uppercase">
        {{ t('page.tasks.settings.tabs.filters') }}
      </h3>
    </div>
    <p class="text-surface-500 mb-2 text-xs">
      {{ t('page.tasks.settings.filters.hint') }}
    </p>
    <div class="space-y-1">
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="showNonSpecialTasksModel" />
        <div class="min-w-0 flex-1">
          <span class="text-surface-200 text-sm">
            {{ t('page.tasks.settings.filters.regular_tasks') }}
          </span>
        </div>
      </label>
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="showKappaTasksModel" />
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <UIcon name="i-mdi-trophy" class="text-kappa h-4 w-4 shrink-0" aria-hidden="true" />
          <span class="text-surface-200 text-sm">
            {{ t('page.tasks.settings.filters.kappa_required') }}
          </span>
        </div>
      </label>
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="showLightkeeperTasksModel" />
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <UIcon
            name="i-mdi-lighthouse"
            class="text-lightkeeper h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span class="text-surface-200 text-sm">
            {{ t('page.tasks.settings.filters.lightkeeper_required') }}
          </span>
        </div>
      </label>
      <label
        v-if="hasTeammates"
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="sharedByAllOnlyModel" />
        <div class="min-w-0 flex-1">
          <span class="text-surface-200 text-sm">
            {{ t('page.tasks.settings.filters.team_shared_only') }}
          </span>
        </div>
      </label>
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="onlyTasksWithRequiredKeysModel" />
        <div class="min-w-0 flex-1">
          <span class="text-surface-200 text-sm">
            {{ t('page.tasks.settings.filters.has_required_keys') }}
          </span>
        </div>
      </label>
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="showGlobalTasksModel" />
        <div class="min-w-0 flex-1">
          <span class="text-surface-200 text-sm">
            {{ t('page.tasks.settings.filters.show_global_tasks') }}
          </span>
        </div>
      </label>
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="respectTaskFiltersForImpactModel" />
        <div class="min-w-0 flex-1">
          <span class="text-surface-200 text-sm">
            {{ t('page.tasks.settings.filters.impact_respects_filters') }}
          </span>
        </div>
      </label>
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="hideCompletedMapObjectivesModel" />
        <div class="min-w-0 flex-1">
          <span class="text-surface-200 text-sm">
            {{ t('page.tasks.settings.filters.hide_completed_map_objectives') }}
          </span>
        </div>
      </label>
    </div>
  </section>
</template>
<script setup lang="ts">
  const props = defineProps<{
    hasTeammates: boolean;
    showNonSpecialTasks: boolean;
    showKappaTasks: boolean;
    showLightkeeperTasks: boolean;
    sharedByAllOnly: boolean;
    onlyTasksWithRequiredKeys: boolean;
    showGlobalTasks: boolean;
    respectTaskFiltersForImpact: boolean;
    hideCompletedMapObjectives: boolean;
  }>();
  const emit = defineEmits<{
    'update:showNonSpecialTasks': [value: boolean];
    'update:showKappaTasks': [value: boolean];
    'update:showLightkeeperTasks': [value: boolean];
    'update:sharedByAllOnly': [value: boolean];
    'update:onlyTasksWithRequiredKeys': [value: boolean];
    'update:showGlobalTasks': [value: boolean];
    'update:respectTaskFiltersForImpact': [value: boolean];
    'update:hideCompletedMapObjectives': [value: boolean];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const showNonSpecialTasksModel = computed({
    get: () => props.showNonSpecialTasks,
    set: (value: boolean) => emit('update:showNonSpecialTasks', value),
  });
  const showKappaTasksModel = computed({
    get: () => props.showKappaTasks,
    set: (value: boolean) => emit('update:showKappaTasks', value),
  });
  const showLightkeeperTasksModel = computed({
    get: () => props.showLightkeeperTasks,
    set: (value: boolean) => emit('update:showLightkeeperTasks', value),
  });
  const sharedByAllOnlyModel = computed({
    get: () => props.sharedByAllOnly,
    set: (value: boolean) => emit('update:sharedByAllOnly', value),
  });
  const onlyTasksWithRequiredKeysModel = computed({
    get: () => props.onlyTasksWithRequiredKeys,
    set: (value: boolean) => emit('update:onlyTasksWithRequiredKeys', value),
  });
  const showGlobalTasksModel = computed({
    get: () => props.showGlobalTasks,
    set: (value: boolean) => emit('update:showGlobalTasks', value),
  });
  const respectTaskFiltersForImpactModel = computed({
    get: () => props.respectTaskFiltersForImpact,
    set: (value: boolean) => emit('update:respectTaskFiltersForImpact', value),
  });
  const hideCompletedMapObjectivesModel = computed({
    get: () => props.hideCompletedMapObjectives,
    set: (value: boolean) => emit('update:hideCompletedMapObjectives', value),
  });
</script>
