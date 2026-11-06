<template>
  <FiltersPopover
    test-id-prefix="task-filters"
    :title="t('page.tasks.filters.title')"
    :active-count="activeCount"
    :can-reset="hasSavedFilters"
    @reset="resetAll"
  >
    <FilterSection
      :title="t('page.tasks.filters.types.title')"
      :hint="t('page.tasks.filters.types.hint')"
    >
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="type in typeOptions"
          :key="type.key"
          type="button"
          :data-testid="`task-type-${type.key}`"
          :aria-pressed="isTypeSelected(type.key)"
          :aria-disabled="isTypeLocked(type.key) || undefined"
          :title="isTypeLocked(type.key) ? t('page.tasks.filters.types.locked_hint') : undefined"
          :class="typeButtonClass(type.key)"
          @click="toggleType(type.key)"
        >
          <UIcon
            :name="isTypeSelected(type.key) ? 'i-mdi-check' : type.icon"
            class="h-3.5 w-3.5 shrink-0"
            :class="isTypeSelected(type.key) ? '' : type.iconClass"
            aria-hidden="true"
          />
          {{ t(`page.tasks.filters.types.${type.key}`) }}
        </button>
      </div>
    </FilterSection>
    <FilterSection :title="t('page.tasks.filters.narrow.title')">
      <PreferenceSwitch
        v-model="onlyTasksWithRequiredKeys"
        test-id="task-filter-required-keys"
        :label="t('page.tasks.filters.narrow.required_keys')"
        :description="t('page.tasks.filters.narrow.required_keys_hint')"
      />
      <PreferenceSwitch
        v-if="hasTeammates || sharedByAllOnly"
        v-model="sharedByAllOnly"
        test-id="task-filter-team-shared"
        :label="t('page.tasks.filters.narrow.team_shared')"
        :description="t('page.tasks.filters.narrow.team_shared_hint')"
      />
    </FilterSection>
    <FilterSection v-if="isMapsView" :title="t('page.tasks.filters.map.title')">
      <PreferenceSwitch
        v-model="showGlobalTasks"
        test-id="task-filter-global-tasks"
        :label="t('page.tasks.filters.map.global_tasks')"
        :description="t('page.tasks.filters.map.global_tasks_hint')"
      />
      <PreferenceSwitch
        v-model="hideCompletedMapObjectives"
        test-id="task-filter-map-complete"
        :label="t('page.tasks.filters.map.hide_map_complete')"
        :description="t('page.tasks.filters.map.hide_map_complete_hint')"
      />
    </FilterSection>
  </FiltersPopover>
</template>
<script setup lang="ts">
  import FilterSection from '@/components/ui/FilterSection.vue';
  import FiltersPopover from '@/components/ui/FiltersPopover.vue';
  import PreferenceSwitch from '@/components/ui/PreferenceSwitch.vue';
  import { useTaskContentFilters } from '@/features/tasks/composables/useTaskContentFilters';
  import type { TaskTypeKey } from '@/features/tasks/composables/useTaskContentFilters';
  const { t } = useI18n({ useScope: 'global' });
  const {
    activeCount,
    hasSavedFilters,
    hasTeammates,
    hideCompletedMapObjectives,
    isMapsView,
    isTypeLocked,
    isTypeSelected,
    onlyTasksWithRequiredKeys,
    resetAll,
    sharedByAllOnly,
    showGlobalTasks,
    toggleType,
  } = useTaskContentFilters();
  const typeOptions: Array<{ key: TaskTypeKey; icon: string; iconClass: string }> = [
    { key: 'regular', icon: 'i-mdi-clipboard-text-outline', iconClass: 'text-surface-400' },
    { key: 'kappa', icon: 'i-mdi-trophy', iconClass: 'text-kappa' },
    { key: 'lightkeeper', icon: 'i-mdi-lighthouse', iconClass: 'text-lightkeeper' },
  ];
  const typeButtonClass = (type: TaskTypeKey) => [
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
    isTypeSelected(type)
      ? 'border-primary-500/45 bg-primary-500/12 text-white light:text-primary-700'
      : 'border-white/10 text-surface-300 hover:border-white/20 hover:text-white light:hover:text-surface-50',
    isTypeLocked(type) ? 'cursor-not-allowed' : 'cursor-pointer',
  ];
</script>
