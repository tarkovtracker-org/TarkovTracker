import { usePreferencesStore } from '@/stores/usePreferences';
import type { PreferenceSetting, PreferenceSettingGroup } from '@/types/filters';
type PreferencesStore = ReturnType<typeof usePreferencesStore>;
type Translate = (key: string) => string;
const cardSettings = (store: PreferencesStore, t: Translate): PreferenceSetting[] => [
  {
    key: 'required_labels',
    label: t('page.tasks.settings.cards.required_labels'),
    description: t('page.tasks.settings.cards.required_labels_hint'),
    get: () => store.getShowRequiredLabels,
    set: (value) => store.setShowRequiredLabels(value),
  },
  {
    key: 'experience_rewards',
    label: t('page.tasks.settings.cards.experience_rewards'),
    get: () => store.getShowExperienceRewards,
    set: (value) => store.setShowExperienceRewards(value),
  },
  {
    key: 'rewards',
    label: t('page.tasks.settings.cards.rewards'),
    description: t('page.tasks.settings.cards.rewards_hint'),
    get: () => !store.getHideTaskRewards,
    set: (value) => store.setHideTaskRewards(!value),
  },
  {
    key: 'previous_tasks',
    label: t('page.tasks.settings.cards.previous_tasks'),
    get: () => store.getShowPreviousQuests,
    set: (value) => store.setShowPreviousQuests(value),
  },
  {
    key: 'next_tasks',
    label: t('page.tasks.settings.cards.next_tasks'),
    get: () => store.getShowNextQuests,
    set: (value) => store.setShowNextQuests(value),
  },
  {
    key: 'start_collapsed',
    label: t('page.tasks.settings.cards.start_collapsed'),
    description: t('page.tasks.settings.cards.start_collapsed_hint'),
    get: () => store.getTaskCollapseDefault,
    set: (value) => store.setTaskCollapseDefault(value),
  },
  {
    key: 'collapse_completed_objectives',
    label: t('page.tasks.settings.cards.collapse_completed_objectives'),
    description: t('page.tasks.settings.cards.collapse_completed_objectives_hint'),
    get: () => store.getHideCompletedTaskObjectives,
    set: (value) => store.setHideCompletedTaskObjectives(value),
  },
];
const statusTabSettings = (store: PreferencesStore, t: Translate): PreferenceSetting[] => [
  {
    key: 'all',
    label: t('common.all'),
    get: () => store.getShowAllFilter,
    set: (value) => store.setShowAllFilter(value),
  },
  {
    key: 'available',
    label: t('common.available'),
    get: () => store.getShowAvailableFilter,
    set: (value) => store.setShowAvailableFilter(value),
  },
  {
    key: 'locked',
    label: t('common.locked'),
    get: () => store.getShowLockedFilter,
    set: (value) => store.setShowLockedFilter(value),
  },
  {
    key: 'completed',
    label: t('common.completed'),
    get: () => store.getShowCompletedFilter,
    set: (value) => store.setShowCompletedFilter(value),
  },
  {
    key: 'failed',
    label: t('common.failed'),
    get: () => store.getShowFailedFilter,
    set: (value) => store.setShowFailedFilter(value),
  },
];
const behaviorSettings = (store: PreferencesStore, t: Translate): PreferenceSetting[] => [
  {
    key: 'impact_respects_filters',
    label: t('page.tasks.settings.behavior.impact_respects_filters'),
    description: t('page.tasks.settings.behavior.impact_respects_filters_hint'),
    get: () => store.getRespectTaskFiltersForImpact,
    set: (value) => store.setRespectTaskFiltersForImpact(value),
  },
  {
    key: 'manual_fail_actions',
    label: t('page.tasks.settings.behavior.manual_fail_actions'),
    description: t('page.tasks.settings.behavior.manual_fail_actions_hint'),
    get: () => store.getEnableManualTaskFail,
    set: (value) => store.setEnableManualTaskFail(value),
  },
];
/** Saved task-page preferences that change how tasks look or behave, not which tasks show. */
export function useTaskDisplaySettings() {
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const groups = computed<PreferenceSettingGroup[]>(() => [
    {
      key: 'cards',
      title: t('page.tasks.settings.cards.title'),
      settings: cardSettings(preferencesStore, t),
    },
    {
      key: 'status_tabs',
      title: t('page.tasks.settings.status_tabs.title'),
      hint: t('page.tasks.settings.status_tabs.hint'),
      settings: statusTabSettings(preferencesStore, t),
    },
    {
      key: 'behavior',
      title: t('page.tasks.settings.behavior.title'),
      settings: behaviorSettings(preferencesStore, t),
    },
  ]);
  return { groups };
}
