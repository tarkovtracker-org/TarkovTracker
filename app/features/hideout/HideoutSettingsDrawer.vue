<template>
  <SettingsDrawer
    page-key="hideout"
    :mode="mode"
    :title="t('page.hideout.settings.title')"
    data-help-target="hideout-settings-panel"
  >
    <PreferenceSettingGroups :groups="groups" test-id-prefix="hideout-setting" />
  </SettingsDrawer>
</template>
<script setup lang="ts">
  import PreferenceSettingGroups from '@/components/ui/PreferenceSettingGroups.vue';
  import SettingsDrawer from '@/components/ui/SettingsDrawer.vue';
  import type { PreferenceSetting, PreferenceSettingGroup } from '@/types/filters';
  interface Props {
    collapseCompleted: boolean;
    isHelpTourActive?: boolean;
    mode?: 'overlay' | 'docked';
    requireSkillLevels: boolean;
    requireStationLevels: boolean;
    requireTraderLoyalty: boolean;
    sortReadyFirst: boolean;
  }
  type BooleanPropKey = Exclude<keyof Props, 'isHelpTourActive' | 'mode'>;
  const props = withDefaults(defineProps<Props>(), {
    isHelpTourActive: false,
    mode: 'overlay',
  });
  const emit = defineEmits<{
    'update:collapseCompleted': [value: boolean];
    'update:requireSkillLevels': [value: boolean];
    'update:requireStationLevels': [value: boolean];
    'update:requireTraderLoyalty': [value: boolean];
    'update:sortReadyFirst': [value: boolean];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const updaters: Record<BooleanPropKey, (value: boolean) => void> = {
    collapseCompleted: (value) => emit('update:collapseCompleted', value),
    requireSkillLevels: (value) => emit('update:requireSkillLevels', value),
    requireStationLevels: (value) => emit('update:requireStationLevels', value),
    requireTraderLoyalty: (value) => emit('update:requireTraderLoyalty', value),
    sortReadyFirst: (value) => emit('update:sortReadyFirst', value),
  };
  // The help tour opens this drawer to point at it, so switches stay read-only until it ends.
  const toSetting = (
    key: string,
    prop: BooleanPropKey,
    label: string,
    description?: string
  ): PreferenceSetting => ({
    key,
    label,
    description,
    disabled: props.isHelpTourActive,
    get: () => props[prop],
    set: updaters[prop],
  });
  const groups = computed<PreferenceSettingGroup[]>(() => [
    {
      key: 'page_options',
      title: t('page.hideout.settings.page_options'),
      settings: [
        toSetting('collapse_completed', 'collapseCompleted', t('page.hideout.collapse_completed')),
        toSetting('sort_ready_first', 'sortReadyFirst', t('page.hideout.sort.ready_first')),
      ],
    },
    {
      key: 'requirements',
      title: t('page.hideout.prereq_filters.title'),
      hint: t('page.hideout.settings.requirements_help'),
      settings: [
        toSetting(
          'station_levels',
          'requireStationLevels',
          t('page.hideout.prereq_filters.station_levels')
        ),
        toSetting(
          'skill_levels',
          'requireSkillLevels',
          t('page.hideout.prereq_filters.skill_levels')
        ),
        toSetting(
          'trader_loyalty',
          'requireTraderLoyalty',
          t('page.hideout.prereq_filters.trader_loyalty')
        ),
      ],
    },
  ]);
</script>
