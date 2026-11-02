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
      <div class="space-y-5 px-4 py-4">
        <PreferenceSettingGroups :groups="groups" test-id-prefix="settings-task-setting" />
        <section :aria-labelledby="taskViewDefaultsLabelId">
          <h3
            :id="taskViewDefaultsLabelId"
            class="text-surface-400 mb-1 px-2 text-xs font-semibold tracking-wide uppercase"
          >
            {{ $t('settings.interface.tasks.view_defaults_section') }}
          </h3>
          <div class="space-y-2 px-2 md:max-w-xs">
            <p class="text-surface-100 text-sm">{{ $t('common.hideout') }}</p>
            <SelectMenuFixed
              v-model="hideoutDefaultView"
              :items="hideoutViewOptions"
              value-key="value"
              label-key="label"
            />
          </div>
        </section>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import PreferenceSettingGroups from '@/components/ui/PreferenceSettingGroups.vue';
  import { useTaskDisplaySettings } from '@/features/tasks/composables/useTaskDisplaySettings';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { PreferenceSettingGroup } from '@/types/filters';
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  // The tasks page settings drawer renders the same groups, so both surfaces stay in sync.
  const { groups: taskDisplayGroups } = useTaskDisplaySettings();
  const taskViewDefaultsLabelId = useId();
  const availabilityGroup = computed<PreferenceSettingGroup>(() => ({
    key: 'availability',
    title: t('settings.interface.tasks.availability_section'),
    settings: [
      {
        key: 'require_trader_levels',
        label: t('settings.interface.tasks.require_trader_levels'),
        get: () => preferencesStore.getTasksRequireTraderLevels,
        set: (value) => preferencesStore.setTasksRequireTraderLevels(value),
      },
    ],
  }));
  const groups = computed(() => [...taskDisplayGroups.value, availabilityGroup.value]);
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
