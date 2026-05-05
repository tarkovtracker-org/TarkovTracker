import { usePreferencesStore } from '@/stores/usePreferences';
import type { ComputedRef } from '#imports';
export interface DashboardFilterPreferences {
  getHideNonKappaTasks: boolean;
  getOnlyTasksWithRequiredKeys: boolean;
  getShowLightkeeperTasks: boolean;
  getShowNonSpecialTasks: boolean;
}
export const isDashboardFilterActive = (preferencesStore: DashboardFilterPreferences): boolean => {
  const showKappaTasks = preferencesStore.getHideNonKappaTasks !== true;
  const showNonSpecialTasks = preferencesStore.getShowNonSpecialTasks !== false;
  const showLightkeeperTasks = preferencesStore.getShowLightkeeperTasks !== false;
  const onlyTasksWithRequiredKeys = preferencesStore.getOnlyTasksWithRequiredKeys === true;
  return (
    !(showKappaTasks && showNonSpecialTasks && showLightkeeperTasks) || onlyTasksWithRequiredKeys
  );
};
export function useDashboardFilters(
  preferencesStore: DashboardFilterPreferences = usePreferencesStore()
): {
  hasDashboardFiltersActive: ComputedRef<boolean>;
} {
  const hasDashboardFiltersActive = computed(() => isDashboardFilterActive(preferencesStore));
  return {
    hasDashboardFiltersActive,
  };
}
