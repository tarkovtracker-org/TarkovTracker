import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isRef, nextTick, ref } from 'vue';
import type { Task } from '@/types/tarkov';
/**
 * Factory to create a default Task with all required properties.
 * Use this instead of type assertions to ensure compile-time safety.
 */
function createDefaultTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Sample Task',
    kappaRequired: false,
    lightkeeperRequired: false,
    experience: 0,
    objectives: [],
    taskRequirements: [],
    minPlayerLevel: 1,
    ...overrides,
  };
}
const defaultTask: Task = createDefaultTask();
const TASK_SEARCH_DEBOUNCE_MS = 180;
const preferencesStoreMock = {
  getTaskPrimaryView: 'all',
  getTaskSecondaryView: 'available',
  getTaskUserView: 'self',
  getTaskMapView: 'all',
  getTaskTraderView: 'all',
  getTaskSortMode: 'none',
  getTaskSortDirection: 'asc',
  getTaskSharedByAllOnly: false,
  getHideGlobalTasks: false,
  getHideNonKappaTasks: false,
  getShowNonSpecialTasks: true,
  getShowLightkeeperTasks: true,
  getOnlyTasksWithRequiredKeys: false,
  getRespectTaskFiltersForImpact: true,
  getPinnedTaskIds: [],
  getHideCompletedMapObjectives: false,
  mapTeamAllHidden: false,
  togglePinnedTask: vi.fn(),
  setHideCompletedMapObjectives: vi.fn(),
};
const metadataStoreMock = {
  tasks: [defaultTask],
  loading: false,
  hasInitialized: true,
  mapsWithSvg: [] as Array<{ id: string; name: string }>,
  sortedTraders: [],
  editions: [],
  objectiveMaps: {},
  objectiveGPS: {},
  fetchMapSpawnsData: vi.fn(() => Promise.resolve()),
};
const mapTaskCountsMock = {
  withHide: 0,
  withoutHide: 1,
};
const visibleTasksRef = ref<Task[]>([defaultTask]);
const updateVisibleTasksMock = vi.fn();
// Top-level mocks (auto-hoisted by vitest)
vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia');
  return {
    ...actual,
    storeToRefs: (store: Record<string, unknown>) => {
      const refs: Record<string, unknown> = {};
      Object.entries(store).forEach(([key, value]) => {
        refs[key] = value !== null && isRef(value) ? value : ref(value);
      });
      return refs;
    },
  };
});
vi.mock('@/composables/useTaskFiltering', () => ({
  useTaskFiltering: () => ({
    visibleTasks: visibleTasksRef,
    reloadingTasks: ref(false),
    updateVisibleTasks: updateVisibleTasksMock,
    isGlobalTask: () => false,
    calculateFilteredTasksForOptions: (...args: unknown[]) => {
      const hideCompletedMapObjectives = args[2] === true;
      const taskCount = hideCompletedMapObjectives
        ? mapTaskCountsMock.withHide
        : mapTaskCountsMock.withoutHide;
      return Array.from({ length: taskCount }, (_value, index) => ({
        ...defaultTask,
        id: `task-${index + 1}`,
      }));
    },
  }),
}));
vi.mock('@/composables/useInfiniteScroll', () => ({
  useInfiniteScroll: () => ({
    checkAndLoadMore: vi.fn(),
  }),
}));
vi.mock('@/composables/useTarkovTime', () => ({
  useTarkovTime: () => ({
    tarkovTime: ref('12:00'),
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => metadataStoreMock,
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => preferencesStoreMock,
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    visibleTeamStores: { self: {} },
    tasksCompletions: {},
    tasksFailed: {},
    unlockedTasks: {},
    objectiveCompletions: {},
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getGameEdition: () => 1,
    isTaskObjectiveComplete: () => false,
  }),
}));
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({
    replace: vi.fn(() => Promise.resolve()),
    push: vi.fn(() => Promise.resolve()),
  }),
}));
vi.mock('@/features/maps/LeafletMap.vue', () => ({
  __esModule: true,
  default: { template: '<div data-testid="leaflet-map" />' },
}));
const UButtonStub = {
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};
const defaultGlobalStubs = {
  TaskCard: { template: '<div data-testid="task-card" />' },
  TaskFilterBar: {
    emits: ['update:searchQuery'],
    template:
      '<div data-testid="task-filter"><input data-testid="task-search" @input="$emit(\'update:searchQuery\', $event.target.value)" /></div>',
  },
  TaskEmptyState: true,
  TaskLoadingState: true,
  Teleport: true,
  Transition: false,
  UAlert: true,
  UButton: UButtonStub,
  UCard: true,
  UIcon: true,
};
describe('tasks page', () => {
  let wrapper: Awaited<ReturnType<typeof mountSuspended>>;
  let TasksPage: typeof import('@/pages/tasks.vue').default;
  beforeEach(async () => {
    visibleTasksRef.value = [defaultTask];
    updateVisibleTasksMock.mockReset();
    preferencesStoreMock.getTaskPrimaryView = 'all';
    preferencesStoreMock.getTaskMapView = 'all';
    preferencesStoreMock.getHideCompletedMapObjectives = false;
    preferencesStoreMock.setHideCompletedMapObjectives.mockReset();
    metadataStoreMock.mapsWithSvg = [];
    metadataStoreMock.fetchMapSpawnsData.mockClear();
    mapTaskCountsMock.withHide = 0;
    mapTaskCountsMock.withoutHide = 1;
    const module = await import('@/pages/tasks.vue');
    TasksPage = module.default;
    wrapper = await mountSuspended(TasksPage, {
      global: { stubs: defaultGlobalStubs },
    });
  });
  it('renders task cards when tasks are available', async () => {
    expect(wrapper.find('[data-testid="task-card"]').exists()).toBe(true);
  });
  it('renders task filter bar', async () => {
    expect(wrapper.find('[data-testid="task-filter"]').exists()).toBe(true);
  });
  it('keeps initial task slice when tasks arrive after mount', async () => {
    visibleTasksRef.value = [];
    wrapper = await mountSuspended(TasksPage, {
      global: { stubs: defaultGlobalStubs },
    });
    visibleTasksRef.value = Array.from({ length: 20 }, (_value, index) =>
      createDefaultTask({
        id: `task-${index + 1}`,
        name: `Task ${index + 1}`,
      })
    );
    await nextTick();
    expect(wrapper.findAll('[data-testid="task-card"]')).toHaveLength(8);
  });
  it('shows hidden-tasks footer action in map section and can show hidden tasks', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    preferencesStoreMock.getHideCompletedMapObjectives = true;
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    wrapper = await mountSuspended(TasksPage, {
      global: { stubs: defaultGlobalStubs },
    });
    const toggleButton = wrapper.find(
      'button[aria-label="page.tasks.map.map_complete_tasks_toggle_show"]'
    );
    expect(toggleButton.exists()).toBe(true);
    await toggleButton.trigger('click');
    expect(preferencesStoreMock.setHideCompletedMapObjectives).toHaveBeenCalledWith(false);
  });
  it('shows re-hide footer action in map section when hidden tasks are visible', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    preferencesStoreMock.getHideCompletedMapObjectives = false;
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    wrapper = await mountSuspended(TasksPage, {
      global: { stubs: defaultGlobalStubs },
    });
    const toggleButton = wrapper.find(
      'button[aria-label="page.tasks.map.map_complete_tasks_toggle_hide"]'
    );
    expect(toggleButton.exists()).toBe(true);
    await toggleButton.trigger('click');
    expect(preferencesStoreMock.setHideCompletedMapObjectives).toHaveBeenCalledWith(true);
  });
  it('hides map hidden-count notice when search excludes hidden tasks', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    preferencesStoreMock.getHideCompletedMapObjectives = true;
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    mapTaskCountsMock.withoutHide = 2;
    mapTaskCountsMock.withHide = 1;
    wrapper = await mountSuspended(TasksPage, {
      global: { stubs: defaultGlobalStubs },
    });
    const mapVisibilitySelector =
      'button[aria-label="page.tasks.map.map_complete_tasks_toggle_show"]';
    expect(wrapper.find(mapVisibilitySelector).exists()).toBe(true);
    vi.useFakeTimers();
    try {
      await wrapper.find('[data-testid="task-search"]').setValue('no-match-query');
      await vi.advanceTimersByTimeAsync(TASK_SEARCH_DEBOUNCE_MS);
      await nextTick();
      expect(wrapper.find(mapVisibilitySelector).exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
