import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { isDashboardFilterActive, useDashboardFilters } from '@/composables/useDashboardFilters';
const createPreferencesStore = (
  overrides: Partial<{
    getHideNonKappaTasks: boolean;
    getOnlyTasksWithRequiredKeys: boolean;
    getShowLightkeeperTasks: boolean;
    getShowNonSpecialTasks: boolean;
  }> = {}
) =>
  reactive({
    getHideNonKappaTasks: false,
    getOnlyTasksWithRequiredKeys: false,
    getShowLightkeeperTasks: true,
    getShowNonSpecialTasks: true,
    ...overrides,
  });
describe('useDashboardFilters', () => {
  it('reports an inactive state when all dashboard task filters are open', () => {
    const preferencesStore = createPreferencesStore();
    expect(isDashboardFilterActive(preferencesStore)).toBe(false);
    const { hasDashboardFiltersActive } = useDashboardFilters(preferencesStore);
    expect(hasDashboardFiltersActive.value).toBe(false);
  });
  it('reports an active state when task type filters are narrowed', () => {
    const preferencesStore = createPreferencesStore({
      getHideNonKappaTasks: true,
      getShowNonSpecialTasks: false,
    });
    const { hasDashboardFiltersActive } = useDashboardFilters(preferencesStore);
    expect(hasDashboardFiltersActive.value).toBe(true);
  });
  it('stays reactive when the required keys filter changes', () => {
    const preferencesStore = createPreferencesStore();
    const { hasDashboardFiltersActive } = useDashboardFilters(preferencesStore);
    expect(hasDashboardFiltersActive.value).toBe(false);
    preferencesStore.getOnlyTasksWithRequiredKeys = true;
    expect(hasDashboardFiltersActive.value).toBe(true);
  });
});
