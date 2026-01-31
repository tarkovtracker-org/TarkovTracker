import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isRef, ref } from 'vue';
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
    visibleTasks: ref([defaultTask]),
    reloadingTasks: ref(false),
    updateVisibleTasks: vi.fn(() => Promise.resolve()),
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
  useMetadataStore: () => ({
    tasks: [defaultTask],
    loading: false,
    hasInitialized: true,
    mapsWithSvg: [],
    sortedTraders: [],
    editions: [],
    objectiveMaps: {},
    objectiveGPS: {},
  }),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    getTaskPrimaryView: 'all',
    getTaskSecondaryView: 'available',
    getTaskUserView: 'self',
    getTaskMapView: 'all',
    getTaskTraderView: 'all',
    getTaskSortMode: 'none',
    getTaskSortDirection: 'asc',
    getTaskSharedByAllOnly: false,
    getHideNonKappaTasks: false,
    getShowNonSpecialTasks: true,
    getShowLightkeeperTasks: true,
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    tasksCompletions: {},
    tasksFailed: {},
    unlockedTasks: {},
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
  default: { template: '<div data-testid="leaflet-map" />' },
}));
const defaultGlobalStubs = {
  TaskCard: { template: '<div data-testid="task-card" />' },
  TaskFilterBar: { template: '<div data-testid="task-filter" />' },
  TaskEmptyState: true,
  TaskLoadingState: true,
  Teleport: true,
  Transition: false,
  UAlert: true,
  UButton: true,
  UCard: true,
  UIcon: true,
};
describe('tasks page', () => {
  let wrapper: Awaited<ReturnType<typeof mountSuspended>>;
  let TasksPage: typeof import('@/pages/tasks.vue').default;
  beforeEach(async () => {
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
});
