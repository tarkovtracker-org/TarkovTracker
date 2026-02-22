import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, inject, isRef, nextTick, ref } from 'vue';
import type { Task, TaskObjective } from '@/types/tarkov';
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
const mapTask: Task = createDefaultTask({ id: 'task-map', name: 'Map Task' });
const globalTask: Task = createDefaultTask({ id: 'task-global', name: 'Global Task' });
function createMapObjective(overrides: Partial<TaskObjective> = {}): TaskObjective {
  return {
    id: 'obj-1',
    type: 'visit',
    taskId: 'task-map-objective',
    possibleLocations: [{ map: { id: 'map-1' }, positions: [{ x: 10, y: 0, z: 20 }] }],
    ...overrides,
  };
}
type MapObjectiveZone = { map: { id: string }; outline: { x: number; z: number }[] };
type MapObjectiveLocation = {
  map: { id: string };
  positions?: Array<{ x: number; y?: number; z: number }>;
};
type MapObjectiveMark = {
  id?: string;
  zones: MapObjectiveZone[];
  possibleLocations?: MapObjectiveLocation[];
  users?: string[];
};
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
  getPinnedTaskIds: [] as string[],
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
  objectives: [],
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
const isGlobalTaskMock = vi.fn((_task: Task) => false);
const progressStoreMock = {
  visibleTeamStores: { self: {} } as Record<string, Record<string, never>>,
  tasksCompletions: {} as Record<string, Record<string, boolean>>,
  tasksFailed: {} as Record<string, Record<string, boolean>>,
  unlockedTasks: {} as Record<string, Record<string, boolean>>,
  objectiveCompletions: {} as Record<string, Record<string, boolean>>,
};
const selfCompletedObjectiveIds = new Set<string>();
const selfCompletedTaskIds = new Set<string>();
const selfFailedTaskIds = new Set<string>();
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
    isGlobalTask: isGlobalTaskMock,
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
  useProgressStore: () => progressStoreMock,
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getGameEdition: () => 1,
    isTaskObjectiveComplete: (objectiveId: string) => selfCompletedObjectiveIds.has(objectiveId),
    isTaskComplete: (taskId: string) => selfCompletedTaskIds.has(taskId),
    isTaskFailed: (taskId: string) => selfFailedTaskIds.has(taskId),
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({
    replace: vi.fn(() => Promise.resolve()),
    push: vi.fn(() => Promise.resolve()),
  }),
}));
vi.mock('@/features/maps/LeafletMap.vue', () => ({
  __esModule: true,
  default: defineComponent({
    props: {
      marks: {
        type: Array,
        default: () => [],
      },
    },
    setup(props, { expose }) {
      expose({
        activateObjectivePopup: () => true,
        closeActivePopup: () => undefined,
      });
      return { props };
    },
    template: '<div data-testid="leaflet-map" :data-marks="JSON.stringify(props.marks ?? [])" />',
  }),
}));
const UButtonStub = {
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};
const defaultGlobalStubs = {
  TaskCard: {
    props: ['accentVariant', 'task'],
    template: '<div data-testid="task-card" :data-accent="accentVariant">{{ task.id }}</div>',
  },
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
  const mountPage = async () => {
    wrapper = await mountSuspended(TasksPage, {
      global: { stubs: defaultGlobalStubs },
    });
  };
  const getLeafletMarks = (): MapObjectiveMark[] => {
    const raw = wrapper.find('[data-testid="leaflet-map"]').attributes('data-marks') ?? '[]';
    return JSON.parse(raw) as MapObjectiveMark[];
  };
  beforeEach(async () => {
    visibleTasksRef.value = [defaultTask];
    updateVisibleTasksMock.mockReset();
    isGlobalTaskMock.mockReset();
    isGlobalTaskMock.mockImplementation((_task: Task) => false);
    preferencesStoreMock.getTaskPrimaryView = 'all';
    preferencesStoreMock.getTaskSecondaryView = 'available';
    preferencesStoreMock.getTaskMapView = 'all';
    preferencesStoreMock.getHideGlobalTasks = false;
    preferencesStoreMock.getPinnedTaskIds = [];
    preferencesStoreMock.getHideCompletedMapObjectives = false;
    preferencesStoreMock.mapTeamAllHidden = false;
    preferencesStoreMock.setHideCompletedMapObjectives.mockReset();
    progressStoreMock.visibleTeamStores = { self: {} };
    progressStoreMock.tasksCompletions = {};
    progressStoreMock.tasksFailed = {};
    progressStoreMock.unlockedTasks = {};
    progressStoreMock.objectiveCompletions = {};
    selfCompletedObjectiveIds.clear();
    selfCompletedTaskIds.clear();
    selfFailedTaskIds.clear();
    metadataStoreMock.mapsWithSvg = [];
    metadataStoreMock.fetchMapSpawnsData.mockClear();
    mapTaskCountsMock.withHide = 0;
    mapTaskCountsMock.withoutHide = 1;
    const module = await import('@/pages/tasks.vue');
    TasksPage = module.default;
    await mountPage();
  });
  it('renders task cards when tasks are available', async () => {
    expect(wrapper.find('[data-testid="task-card"]').exists()).toBe(true);
  });
  it('renders task filter bar', async () => {
    expect(wrapper.find('[data-testid="task-filter"]').exists()).toBe(true);
  });
  it('keeps initial task slice when tasks arrive after mount', async () => {
    visibleTasksRef.value = [];
    await mountPage();
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
    await mountPage();
    const toggleButton = wrapper.find(
      'button[aria-label="page.tasks.map.map_complete_tasks_toggle_show"]'
    );
    expect(toggleButton.exists()).toBe(true);
    await toggleButton.trigger('click');
    expect(preferencesStoreMock.setHideCompletedMapObjectives).toHaveBeenCalledWith(false);
  });
  it('collapses and expands the map panel from the map header toggle', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountPage();
    const toggleButton = wrapper.find('[data-testid="map-panel-toggle"]');
    expect(toggleButton.exists()).toBe(true);
    expect(toggleButton.attributes('aria-expanded')).toBe('true');
    await toggleButton.trigger('click');
    await nextTick();
    expect(toggleButton.attributes('aria-expanded')).toBe('false');
    await toggleButton.trigger('click');
    await nextTick();
    expect(toggleButton.attributes('aria-expanded')).toBe('true');
  });
  it('expands the map panel when jumping to a map objective from a collapsed state', async () => {
    const TaskCardJumpStub = defineComponent({
      setup() {
        const jumpToMapObjective = inject<((id: string) => void) | null>(
          'jumpToMapObjective',
          null
        );
        return {
          jumpToMapObjective,
        };
      },
      template:
        '<button data-testid="jump-to-map-objective" @click="jumpToMapObjective?.(\'obj-1\')">Jump</button>',
    });
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    wrapper = await mountSuspended(TasksPage, {
      global: {
        stubs: {
          ...defaultGlobalStubs,
          TaskCard: TaskCardJumpStub,
        },
      },
    });
    const toggleButton = wrapper.find('[data-testid="map-panel-toggle"]');
    expect(toggleButton.attributes('aria-expanded')).toBe('true');
    await toggleButton.trigger('click');
    await nextTick();
    expect(toggleButton.attributes('aria-expanded')).toBe('false');
    const jumpButton = wrapper.find('[data-testid="jump-to-map-objective"]');
    expect(jumpButton.exists()).toBe(true);
    await jumpButton.trigger('click');
    await nextTick();
    expect(toggleButton.attributes('aria-expanded')).toBe('true');
  });
  it('shows re-hide footer action in map section when hidden tasks are visible', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    preferencesStoreMock.getHideCompletedMapObjectives = false;
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountPage();
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
    await mountPage();
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
  it('shows map tasks first and then global tasks in map view', async () => {
    visibleTasksRef.value = [mapTask, globalTask];
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    preferencesStoreMock.getHideGlobalTasks = false;
    isGlobalTaskMock.mockImplementation((task: Task) => task.id === 'task-global');
    await mountPage();
    expect(
      wrapper
        .findAll('[data-testid="task-card"]')
        .map((item: { text: () => string }) => item.text())
    ).toEqual(['task-map', 'task-global']);
    expect(wrapper.text()).toContain('page.tasks.global_tasks_section');
  });
  it('does not show global section when global tasks are disabled', async () => {
    visibleTasksRef.value = [mapTask];
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    preferencesStoreMock.getHideGlobalTasks = true;
    isGlobalTaskMock.mockImplementation((task: Task) => task.id === 'task-global');
    await mountPage();
    expect(wrapper.text()).not.toContain('page.tasks.global_tasks_section');
  });
  it('keeps global accent for pinned global tasks in map view', async () => {
    visibleTasksRef.value = [globalTask];
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    preferencesStoreMock.getHideGlobalTasks = false;
    preferencesStoreMock.getPinnedTaskIds = ['task-global'];
    isGlobalTaskMock.mockImplementation((task: Task) => task.id === 'task-global');
    await mountPage();
    expect(wrapper.find('[data-testid="task-card"]').attributes('data-accent')).toBe('global');
  });
  it('keeps teammate objective markers when self already completed the same task objective', async () => {
    const task = createDefaultTask({
      id: 'task-map-objective',
      name: 'Map Objective Task',
      objectives: [createMapObjective()],
    });
    visibleTasksRef.value = [task];
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    preferencesStoreMock.getTaskSecondaryView = 'all';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    progressStoreMock.visibleTeamStores = { self: {}, 'teammate-1': {} };
    progressStoreMock.tasksCompletions = {
      [task.id]: { self: true, 'teammate-1': false },
    };
    progressStoreMock.tasksFailed = {
      [task.id]: { self: false, 'teammate-1': false },
    };
    progressStoreMock.unlockedTasks = {
      [task.id]: { self: false, 'teammate-1': true },
    };
    progressStoreMock.objectiveCompletions = {
      'obj-1': { self: true, 'teammate-1': false },
    };
    selfCompletedObjectiveIds.add('obj-1');
    selfCompletedTaskIds.add(task.id);
    await mountPage();
    expect(getLeafletMarks()).toEqual([
      expect.objectContaining({
        id: 'obj-1',
        users: ['teammate-1'],
      }),
    ]);
  });
  it('treats locked self tasks as teammate objectives on map markers', async () => {
    const task = createDefaultTask({
      id: 'task-map-objective',
      name: 'Map Objective Task',
      objectives: [createMapObjective()],
    });
    visibleTasksRef.value = [task];
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    preferencesStoreMock.getTaskSecondaryView = 'all';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    progressStoreMock.visibleTeamStores = { self: {}, 'teammate-1': {} };
    progressStoreMock.tasksCompletions = {
      [task.id]: { self: false, 'teammate-1': false },
    };
    progressStoreMock.tasksFailed = {
      [task.id]: { self: false, 'teammate-1': false },
    };
    progressStoreMock.unlockedTasks = {
      [task.id]: { self: false, 'teammate-1': true },
    };
    progressStoreMock.objectiveCompletions = {
      'obj-1': { self: false, 'teammate-1': false },
    };
    await mountPage();
    expect(getLeafletMarks()).toEqual([
      expect.objectContaining({
        id: 'obj-1',
        users: ['teammate-1'],
      }),
    ]);
  });
  it('keeps self marker ownership when objective is active for self and teammate', async () => {
    const task = createDefaultTask({
      id: 'task-map-objective',
      name: 'Map Objective Task',
      objectives: [createMapObjective()],
    });
    visibleTasksRef.value = [task];
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    preferencesStoreMock.getTaskSecondaryView = 'all';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    progressStoreMock.visibleTeamStores = { self: {}, 'teammate-1': {} };
    progressStoreMock.tasksCompletions = {
      [task.id]: { self: false, 'teammate-1': false },
    };
    progressStoreMock.tasksFailed = {
      [task.id]: { self: false, 'teammate-1': false },
    };
    progressStoreMock.unlockedTasks = {
      [task.id]: { self: true, 'teammate-1': true },
    };
    progressStoreMock.objectiveCompletions = {
      'obj-1': { self: false, 'teammate-1': false },
    };
    await mountPage();
    expect(getLeafletMarks()).toEqual([
      expect.objectContaining({
        id: 'obj-1',
        users: ['self', 'teammate-1'],
      }),
    ]);
  });
});
