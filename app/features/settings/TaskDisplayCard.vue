<template>
  <GenericCard
    icon="mdi-checkbox-marked-outline"
    icon-color="info"
    highlight-color="info"
    :fill-height="false"
    :title="$t('settings.interface.tasks.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-6 px-4 py-4">
        <section class="space-y-3" :aria-labelledby="taskDisplayFlagsLabelId">
          <p :id="taskDisplayFlagsLabelId" class="text-surface-400 text-xs font-semibold uppercase">
            {{ $t('settings.interface.tasks.flags_section', 'Task Display') }}
          </p>
          <div class="grid gap-4 md:grid-cols-2">
            <UCheckbox
              v-model="showRequiredLabels"
              :label="$t('settings.interface.tasks.show_required')"
            />
            <UCheckbox
              v-model="showExperienceRewards"
              :label="$t('settings.interface.tasks.show_xp')"
            />
            <UCheckbox v-model="showNextQuests" :label="$t('settings.interface.tasks.show_next')" />
            <UCheckbox
              v-model="showPreviousQuests"
              :label="$t('settings.interface.tasks.show_prev')"
            />
          </div>
        </section>
        <USeparator />
        <section class="space-y-3" :aria-labelledby="taskAvailabilityLabelId">
          <p :id="taskAvailabilityLabelId" class="text-surface-400 text-xs font-semibold uppercase">
            {{ $t('settings.interface.tasks.availability_section', 'Task Availability') }}
          </p>
          <div class="grid gap-4 md:grid-cols-2">
            <UCheckbox
              v-model="tasksRequireTraderLevels"
              :label="$t('settings.interface.tasks.require_trader_levels')"
            />
          </div>
        </section>
        <USeparator />
        <section class="space-y-3" :aria-labelledby="taskViewDefaultsLabelId">
          <p :id="taskViewDefaultsLabelId" class="text-surface-400 text-xs font-semibold uppercase">
            {{ $t('settings.interface.tasks.view_defaults_section', 'Default Views') }}
          </p>
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div class="space-y-2">
              <p class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.interface.tasks.density') }}
              </p>
              <SelectMenuFixed
                v-model="taskCardDensity"
                :items="densityOptions"
                value-key="value"
                label-key="label"
              />
            </div>
            <div class="space-y-2">
              <p class="text-surface-200 text-sm font-semibold">
                {{ $t('common.tasks') }}
              </p>
              <SelectMenuFixed
                v-model="taskDefaultView"
                :items="taskViewOptions"
                value-key="value"
                label-key="label"
              />
            </div>
            <div class="space-y-2">
              <p class="text-surface-200 text-sm font-semibold">
                {{ $t('common.hideout') }}
              </p>
              <SelectMenuFixed
                v-model="hideoutDefaultView"
                :items="hideoutViewOptions"
                value-key="value"
                label-key="label"
              />
            </div>
          </div>
        </section>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const taskDisplayFlagsLabelId = 'settings-task-display-flags-label';
  const taskAvailabilityLabelId = 'settings-task-availability-label';
  const taskViewDefaultsLabelId = 'settings-task-view-defaults-label';
  const showRequiredLabels = computed({
    get: () => preferencesStore.getShowRequiredLabels,
    set: (val) => preferencesStore.setShowRequiredLabels(val),
  });
  const showExperienceRewards = computed({
    get: () => preferencesStore.getShowExperienceRewards,
    set: (val) => preferencesStore.setShowExperienceRewards(val),
  });
  const showNextQuests = computed({
    get: () => preferencesStore.getShowNextQuests,
    set: (val) => preferencesStore.setShowNextQuests(val),
  });
  const showPreviousQuests = computed({
    get: () => preferencesStore.getShowPreviousQuests,
    set: (val) => preferencesStore.setShowPreviousQuests(val),
  });
  const tasksRequireTraderLevels = computed({
    get: () => preferencesStore.getTasksRequireTraderLevels,
    set: (val) => preferencesStore.setTasksRequireTraderLevels(val),
  });
  const taskCardDensity = computed({
    get: () => preferencesStore.getTaskCardDensity,
    set: (val) => preferencesStore.setTaskCardDensity(val),
  });
  const densityOptions = computed(() => [
    { label: t('common.compact'), value: 'compact' },
    { label: t('settings.density.comfortable'), value: 'comfortable' },
  ]);
  const taskDefaultView = computed({
    get: () => preferencesStore.getTaskPrimaryView,
    set: (val) => preferencesStore.setTaskPrimaryView(val),
  });
  const taskViewOptions = computed(() => [
    { label: t('common.list'), value: 'all' },
    { label: t('tasks.view.map'), value: 'maps' },
    { label: t('common.traders'), value: 'traders' },
  ]);
  const hideoutDefaultView = computed({
    get: () => preferencesStore.getHideoutPrimaryView,
    set: (val) => preferencesStore.setHideoutPrimaryView(val),
  });
  const hideoutViewOptions = computed(() => [
    { label: t('common.available'), value: 'available' },
    { label: t('common.all'), value: 'all' },
    { label: t('common.maxed'), value: 'maxed' },
    { label: t('common.locked'), value: 'locked' },
  ]);
</script>
