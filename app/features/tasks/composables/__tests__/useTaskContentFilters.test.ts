import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useTaskContentFilters } from '@/features/tasks/composables/useTaskContentFilters';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const createStore = () =>
  reactive({
    getShowNonSpecialTasks: true,
    getHideNonKappaTasks: false,
    getShowLightkeeperTasks: true,
    getOnlyTasksWithRequiredKeys: false,
    getTaskSharedByAllOnly: false,
    getHideGlobalTasks: false,
    getHideCompletedMapObjectives: false,
    getTaskPrimaryView: 'all',
    getTaskUserView: 'self',
    getTaskSecondaryView: 'available',
    setShowNonSpecialTasks(value: boolean) {
      this.getShowNonSpecialTasks = value;
    },
    setHideNonKappaTasks(value: boolean) {
      this.getHideNonKappaTasks = value;
    },
    setShowLightkeeperTasks(value: boolean) {
      this.getShowLightkeeperTasks = value;
    },
    setOnlyTasksWithRequiredKeys(value: boolean) {
      this.getOnlyTasksWithRequiredKeys = value;
    },
    setTaskSharedByAllOnly(value: boolean) {
      this.getTaskSharedByAllOnly = value;
    },
    setHideGlobalTasks(value: boolean) {
      this.getHideGlobalTasks = value;
    },
    setHideCompletedMapObjectives(value: boolean) {
      this.getHideCompletedMapObjectives = value;
    },
  });
let store = createStore();
const teamStore = reactive({ teammates: [] as string[] });
vi.mock('@/stores/usePreferences', () => ({ usePreferencesStore: () => store }));
vi.mock('@/stores/useTeamStore', () => ({ useTeamStore: () => teamStore }));
const chipKeys = (filters: ReturnType<typeof useTaskContentFilters>) =>
  filters.activeFilters.value.map((filter) => filter.key);
describe('useTaskContentFilters', () => {
  beforeEach(() => {
    store = createStore();
    teamStore.teammates = [];
  });
  it('treats every type as selected and inactive by default', () => {
    const filters = useTaskContentFilters();
    expect(filters.isTypeSelected('regular')).toBe(true);
    expect(filters.isTypeSelected('kappa')).toBe(true);
    expect(filters.isTypeSelected('lightkeeper')).toBe(true);
    expect(filters.activeCount.value).toBe(0);
  });
  it('treats an empty saved selection as every type instead of an empty list', () => {
    store.getShowNonSpecialTasks = false;
    store.getHideNonKappaTasks = true;
    store.getShowLightkeeperTasks = false;
    const filters = useTaskContentFilters();
    expect(filters.isTypeSelected('kappa')).toBe(true);
    expect(filters.isTypeLocked('kappa')).toBe(false);
    expect(filters.activeCount.value).toBe(0);
  });
  it('keeps the last selected type locked on', () => {
    const filters = useTaskContentFilters();
    filters.toggleType('regular');
    filters.toggleType('lightkeeper');
    expect(filters.isTypeLocked('kappa')).toBe(true);
    filters.toggleType('kappa');
    expect(store.getHideNonKappaTasks).toBe(false);
    expect(store.getShowNonSpecialTasks).toBe(false);
    expect(store.getShowLightkeeperTasks).toBe(false);
    expect(filters.activeFilters.value).toEqual([
      expect.objectContaining({ key: 'types', label: 'page.tasks.filters.types.kappa' }),
    ]);
  });
  it('only reports team and map chips where those filters apply', () => {
    store.getTaskSharedByAllOnly = true;
    store.getHideGlobalTasks = true;
    store.getHideCompletedMapObjectives = true;
    const filters = useTaskContentFilters();
    expect(chipKeys(filters)).toEqual([]);
    store.getTaskUserView = 'all';
    store.getTaskPrimaryView = 'maps';
    expect(chipKeys(filters)).toEqual(['team_shared', 'global_hidden', 'map_complete_hidden']);
    store.getTaskSecondaryView = 'completed';
    expect(chipKeys(filters)).toEqual(['global_hidden', 'map_complete_hidden']);
  });
  it('clears every active filter at once', () => {
    store.getTaskPrimaryView = 'maps';
    store.getShowLightkeeperTasks = false;
    store.getOnlyTasksWithRequiredKeys = true;
    store.getHideGlobalTasks = true;
    store.getHideCompletedMapObjectives = true;
    const filters = useTaskContentFilters();
    expect(filters.activeCount.value).toBe(4);
    filters.clearAll();
    expect(filters.activeCount.value).toBe(0);
    expect(store.getShowLightkeeperTasks).toBe(true);
    expect(store.getOnlyTasksWithRequiredKeys).toBe(false);
    expect(store.getHideGlobalTasks).toBe(false);
    expect(store.getHideCompletedMapObjectives).toBe(false);
  });
  it('lets Reset clear saved filters that sit idle in the current view', () => {
    const filters = useTaskContentFilters();
    expect(filters.hasSavedFilters.value).toBe(false);
    store.getShowNonSpecialTasks = false;
    store.getTaskSharedByAllOnly = true;
    store.getHideGlobalTasks = true;
    store.getHideCompletedMapObjectives = true;
    expect(filters.activeCount.value).toBe(1);
    filters.clearAll();
    expect(store.getTaskSharedByAllOnly).toBe(true);
    expect(filters.hasSavedFilters.value).toBe(true);
    store.getOnlyTasksWithRequiredKeys = true;
    store.getShowNonSpecialTasks = false;
    filters.resetAll();
    expect(filters.hasSavedFilters.value).toBe(false);
    expect(store.getShowNonSpecialTasks).toBe(true);
    expect(store.getOnlyTasksWithRequiredKeys).toBe(false);
    expect(store.getTaskSharedByAllOnly).toBe(false);
    expect(store.getHideGlobalTasks).toBe(false);
    expect(store.getHideCompletedMapObjectives).toBe(false);
  });
  it.each([
    ['getShowNonSpecialTasks', false],
    ['getOnlyTasksWithRequiredKeys', true],
    ['getTaskSharedByAllOnly', true],
    ['getHideGlobalTasks', true],
    ['getHideCompletedMapObjectives', true],
  ] as const)('reports %s as a saved filter', (key, value) => {
    const filters = useTaskContentFilters();
    (store as Record<string, unknown>)[key] = value;
    expect(filters.hasSavedFilters.value).toBe(true);
  });
});
