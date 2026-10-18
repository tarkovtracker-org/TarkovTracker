import { usePreferencesStore } from '@/stores/usePreferences';
import { useTeamStore } from '@/stores/useTeamStore';
import { isAllUsersView } from '@/types/taskFilter';
import type { ActiveFilter } from '@/types/filters';
const TASK_TYPE_KEYS = ['regular', 'kappa', 'lightkeeper'] as const;
export type TaskTypeKey = (typeof TASK_TYPE_KEYS)[number];
type PreferencesStore = ReturnType<typeof usePreferencesStore>;
const readTypeState = (store: PreferencesStore): Record<TaskTypeKey, boolean> => ({
  regular: store.getShowNonSpecialTasks,
  kappa: !store.getHideNonKappaTasks,
  lightkeeper: store.getShowLightkeeperTasks,
});
const writeTypeState = (store: PreferencesStore, types: readonly TaskTypeKey[]) => {
  store.setShowNonSpecialTasks(types.includes('regular'));
  store.setHideNonKappaTasks(!types.includes('kappa'));
  store.setShowLightkeeperTasks(types.includes('lightkeeper'));
};
const preferenceModel = (get: () => boolean, set: (value: boolean) => void) =>
  computed({ get, set });
/**
 * Filters that change which tasks the list shows. Task types are additive (a task shows when it
 * belongs to any selected group), and an empty selection already means every task, so the last
 * selected type stays locked on instead of flipping the list back to everything.
 */
export function useTaskContentFilters() {
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const teamStore = useTeamStore();
  const hasTeammates = computed(() => (teamStore.teammates?.length ?? 0) > 0);
  const isMapsView = computed(() => preferencesStore.getTaskPrimaryView === 'maps');
  // Mirrors useTaskFiltering: the team-shared filter only narrows the whole team's Available tab.
  const isTeamSharedApplicable = computed(
    () =>
      isAllUsersView(preferencesStore.getTaskUserView) &&
      preferencesStore.getTaskSecondaryView === 'available'
  );
  const selectedTypes = computed<TaskTypeKey[]>(() => {
    const state = readTypeState(preferencesStore);
    const selected = TASK_TYPE_KEYS.filter((type) => state[type]);
    return selected.length > 0 ? selected : [...TASK_TYPE_KEYS];
  });
  const isTypeSelected = (type: TaskTypeKey) => selectedTypes.value.includes(type);
  const isTypeLocked = (type: TaskTypeKey) =>
    selectedTypes.value.length === 1 && isTypeSelected(type);
  const toggleType = (type: TaskTypeKey) => {
    if (isTypeLocked(type)) return;
    const next = isTypeSelected(type)
      ? selectedTypes.value.filter((selected) => selected !== type)
      : [...selectedTypes.value, type];
    writeTypeState(preferencesStore, next);
  };
  const resetTypes = () => writeTypeState(preferencesStore, TASK_TYPE_KEYS);
  const onlyTasksWithRequiredKeys = preferenceModel(
    () => preferencesStore.getOnlyTasksWithRequiredKeys,
    (value) => preferencesStore.setOnlyTasksWithRequiredKeys(value)
  );
  const sharedByAllOnly = preferenceModel(
    () => preferencesStore.getTaskSharedByAllOnly,
    (value) => preferencesStore.setTaskSharedByAllOnly(value)
  );
  const showGlobalTasks = preferenceModel(
    () => !preferencesStore.getHideGlobalTasks,
    (value) => preferencesStore.setHideGlobalTasks(!value)
  );
  const hideCompletedMapObjectives = preferenceModel(
    () => preferencesStore.getHideCompletedMapObjectives,
    (value) => preferencesStore.setHideCompletedMapObjectives(value)
  );
  const typeLabel = (type: TaskTypeKey) => t(`page.tasks.filters.types.${type}`);
  const typesFilter = (): ActiveFilter[] => {
    if (selectedTypes.value.length === TASK_TYPE_KEYS.length) return [];
    const label = selectedTypes.value.map(typeLabel).join(' + ');
    return [{ key: 'types', label, clear: resetTypes }];
  };
  const toggleFilter = (key: string, isActive: boolean, clear: () => void): ActiveFilter[] =>
    isActive ? [{ key, label: t(`page.tasks.filters.chips.${key}`), clear }] : [];
  const activeFilters = computed<ActiveFilter[]>(() => [
    ...typesFilter(),
    ...toggleFilter('required_keys', onlyTasksWithRequiredKeys.value, () => {
      onlyTasksWithRequiredKeys.value = false;
    }),
    ...toggleFilter('team_shared', isTeamSharedApplicable.value && sharedByAllOnly.value, () => {
      sharedByAllOnly.value = false;
    }),
    ...toggleFilter('global_hidden', isMapsView.value && !showGlobalTasks.value, () => {
      showGlobalTasks.value = true;
    }),
    ...toggleFilter(
      'map_complete_hidden',
      isMapsView.value && hideCompletedMapObjectives.value,
      () => {
        hideCompletedMapObjectives.value = false;
      }
    ),
  ]);
  const activeCount = computed(() => activeFilters.value.length);
  const clearAll = () => {
    activeFilters.value.forEach((filter) => filter.clear());
  };
  // Saved filters include ones idle in the current view (map filters off Maps, team-shared off the
  // whole team's Available tab), so Reset can clear what the chips do not show.
  const savedFilterStates = computed(() => [
    selectedTypes.value.length < TASK_TYPE_KEYS.length,
    onlyTasksWithRequiredKeys.value,
    sharedByAllOnly.value,
    !showGlobalTasks.value,
    hideCompletedMapObjectives.value,
  ]);
  const hasSavedFilters = computed(() => savedFilterStates.value.some(Boolean));
  const resetAll = () => {
    resetTypes();
    onlyTasksWithRequiredKeys.value = false;
    sharedByAllOnly.value = false;
    showGlobalTasks.value = true;
    hideCompletedMapObjectives.value = false;
  };
  return {
    hasTeammates,
    isMapsView,
    isTypeSelected,
    isTypeLocked,
    toggleType,
    onlyTasksWithRequiredKeys,
    sharedByAllOnly,
    showGlobalTasks,
    hideCompletedMapObjectives,
    activeFilters,
    activeCount,
    clearAll,
    hasSavedFilters,
    resetAll,
  };
}
