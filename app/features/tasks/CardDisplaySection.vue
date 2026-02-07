<template>
  <section class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
    <div class="mb-2 flex items-center gap-2">
      <UIcon name="i-mdi-card-text" class="text-info-400 h-4 w-4" />
      <h3 class="text-xs font-semibold tracking-wide text-white uppercase">
        {{ t('page.tasks.settings.tabs.appearance') }}
      </h3>
    </div>
    <p class="text-surface-500 mb-2 text-xs">
      {{ t('page.tasks.settings.appearance.hint') }}
    </p>
    <div class="space-y-1">
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="showRequiredLabelsModel" />
        <span class="text-surface-200 text-sm">
          {{ t('page.tasks.settings.appearance.required_labels') }}
        </span>
      </label>
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="showExperienceRewardsModel" />
        <span class="text-surface-200 text-sm">
          {{ t('page.tasks.settings.appearance.experience_rewards') }}
        </span>
      </label>
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="showNextQuestsModel" />
        <span class="text-surface-200 text-sm">
          {{ t('page.tasks.settings.appearance.next_tasks') }}
        </span>
      </label>
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="showPreviousQuestsModel" />
        <span class="text-surface-200 text-sm">
          {{ t('page.tasks.settings.appearance.previous_tasks') }}
        </span>
      </label>
      <label
        class="hover:bg-surface-700/50 flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
      >
        <UCheckbox v-model="hideCompletedTaskObjectivesModel" />
        <span class="text-surface-200 text-sm">
          {{ t('page.tasks.settings.appearance.collapse_completed_objectives') }}
        </span>
      </label>
    </div>
  </section>
</template>
<script setup lang="ts">
  const props = defineProps<{
    showRequiredLabels: boolean;
    showExperienceRewards: boolean;
    showNextQuests: boolean;
    showPreviousQuests: boolean;
    hideCompletedTaskObjectives: boolean;
  }>();
  const emit = defineEmits<{
    'update:showRequiredLabels': [value: boolean];
    'update:showExperienceRewards': [value: boolean];
    'update:showNextQuests': [value: boolean];
    'update:showPreviousQuests': [value: boolean];
    'update:hideCompletedTaskObjectives': [value: boolean];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const showRequiredLabelsModel = computed({
    get: () => props.showRequiredLabels,
    set: (value: boolean) => emit('update:showRequiredLabels', value),
  });
  const showExperienceRewardsModel = computed({
    get: () => props.showExperienceRewards,
    set: (value: boolean) => emit('update:showExperienceRewards', value),
  });
  const showNextQuestsModel = computed({
    get: () => props.showNextQuests,
    set: (value: boolean) => emit('update:showNextQuests', value),
  });
  const showPreviousQuestsModel = computed({
    get: () => props.showPreviousQuests,
    set: (value: boolean) => emit('update:showPreviousQuests', value),
  });
  const hideCompletedTaskObjectivesModel = computed({
    get: () => props.hideCompletedTaskObjectives,
    set: (value: boolean) => emit('update:hideCompletedTaskObjectives', value),
  });
</script>
