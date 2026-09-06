import { mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, inject, isRef, nextTick, ref } from 'vue';
import { jumpToMapObjectiveKey } from '@/features/tasks/task-context';
import { STORAGE_KEYS } from '@/utils/storageKeys';
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
const metadataStoreMock = reactive({
  tasks: [defaultTask],
  loading: false,
  hasInitialized: true,
  languageCode: 'en',
  getApiGameMode: () => 'regular',
  fetchTaskObjectivesData: vi.fn(() => Promise.resolve()),
  fetchTaskRewardsData: vi.fn(() => Promise.resolve()),
  fetchEditionsData: vi.fn(() => Promise.resolve()),
  mapsWithSvg: [] as Array<{ id: string; name: string }>,
  objectives: [],
  sortedTraders: [],
  editions: [],
  objectiveMaps: {},
  objectiveGPS: {},
  fetchMapSpawnsData: vi.fn(() => Promise.resolve()),
  getTaskById: (taskId: string): Task | undefined =>
    metadataStoreMock.tasks.find((task) => task.id === taskId),
});
const mapTaskCountsMock = {
  withHide: 0,
  withoutHide: 1,
};
const visibleTasksRef = ref<Task[]>([defaultTask]);
const focusedTaskRef = ref<Task | null>(null);
const updateVisibleTasksMock = vi.fn();
const isGlobalTaskMock = vi.fn((_task: Task) => false);
const clearPinnedTaskMock = vi.fn(() => {
  focusedTaskRef.value = null;
});
const handleTaskQueryParamMock = vi.fn();
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
        refs[key] = value !== null && isRef(value) ? value : toRef(store, key);
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
vi.mock('@/composables/useTaskDeepLink', () => ({
  useTaskDeepLink: () => ({
    pinnedTask: focusedTaskRef,
    clearPinnedTask: clearPinnedTaskMock,
    handleTaskQueryParam: handleTaskQueryParamMock,
    cleanup: vi.fn(),
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
    currentGameMode: 'pvp',
    getGameEdition: () => 1,
    pvp: {
      apiUpdateHistory: [],
      displayName: null,
      hideoutModules: {},
      hideoutParts: {},
      level: 1,
      pmcFaction: 'USEC',
      prestigeLevel: 0,
      skillOffsets: {},
      skills: {},
      storyChapters: {},
      taskCompletions: {},
      taskObjectives: {},
      traders: {},
      xpOffset: 0,
    },
    pve: {
      apiUpdateHistory: [],
      displayName: null,
      hideoutModules: {},
      hideoutParts: {},
      level: 1,
      pmcFaction: 'USEC',
      prestigeLevel: 0,
      skillOffsets: {},
      skills: {},
      storyChapters: {},
      taskCompletions: {},
      taskObjectives: {},
      traders: {},
      xpOffset: 0,
    },
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
const { leafletGetViewStateSpy, leafletSetViewStateSpy, leafletGetFloorSpy, leafletSetFloorSpy } =
  vi.hoisted(() => ({
    leafletGetViewStateSpy: vi.fn(),
    leafletSetViewStateSpy: vi.fn(),
    leafletGetFloorSpy: vi.fn(),
    leafletSetFloorSpy: vi.fn(),
  }));
vi.mock('@/features/maps/LeafletMap.vue', () => ({
  __esModule: true,
  default: defineComponent({
    props: {
      marks: {
        type: Array,
        default: () => [],
      },
      initialView: {
        type: Object,
        default: null,
      },
      initialFloor: {
        type: String,
        default: undefined,
      },
      showFullscreenToggle: {
        type: Boolean,
        default: false,
      },
      isFullscreen: {
        type: Boolean,
        default: false,
      },
    },
    emits: ['toggle-fullscreen'],
    setup(props, { expose }) {
      expose({
        activateObjectivePopup: () => true,
        closeActivePopup: () => undefined,
        getViewState: leafletGetViewStateSpy,
        setViewState: leafletSetViewStateSpy,
        getFloor: leafletGetFloorSpy,
        setFloor: leafletSetFloorSpy,
      });
      return { props };
    },
    template: `<div data-testid="leaflet-map" :data-marks="JSON.stringify(props.marks ?? [])" :data-initial-view="JSON.stringify(props.initialView ?? null)" :data-initial-floor="props.initialFloor ?? ''">
      <button
        v-if="props.showFullscreenToggle"
        type="button"
        data-testid="map-fullscreen-toggle"
        @click="$emit('toggle-fullscreen')"
      />
    </div>`,
  }),
}));
const UButtonStub = {
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};
const AppTooltipStub = {
  template: '<div><slot /></div>',
};
const defaultGlobalStubs = {
  AppTooltip: AppTooltipStub,
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
  UBadge: true,
  UButton: UButtonStub,
  UCard: true,
  UIcon: true,
};
describe('tasks page', () => {
  let wrapper: Awaited<ReturnType<typeof mountSuspended>>;
  let TasksPage: typeof import('@/pages/tasks.vue').default;
  const mountPage = async () => {
    wrapper?.unmount();
    wrapper = await mountSuspended(TasksPage, {
      global: { stubs: defaultGlobalStubs },
    });
    await vi.waitFor(() => expect(wrapper.find('task-loading-state-stub').exists()).toBe(false));
  };
  const mountAttachedPage = async () => {
    wrapper?.unmount();
    wrapper = await mountSuspended(TasksPage, {
      attachTo: document.body,
      global: { stubs: defaultGlobalStubs },
    });
    await vi.waitFor(() => expect(wrapper.find('task-loading-state-stub').exists()).toBe(false));
  };
  const getLeafletMarks = (): MapObjectiveMark[] => {
    const raw = wrapper.find('[data-testid="leaflet-map"]').attributes('data-marks') ?? '[]';
    return JSON.parse(raw) as MapObjectiveMark[];
  };
  const flushTransition = async () => {
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await nextTick();
  };
  const isInsideInertSubtree = (element: Element | null): boolean => {
    let node: HTMLElement | null = element as HTMLElement | null;
    while (node) {
      if (node.inert) return true;
      node = node.parentElement;
    }
    return false;
  };
  beforeEach(async () => {
    metadataStoreMock.hasInitialized = true;
    metadataStoreMock.loading = false;
    visibleTasksRef.value = [defaultTask];
    focusedTaskRef.value = null;
    updateVisibleTasksMock.mockReset();
    isGlobalTaskMock.mockReset();
    clearPinnedTaskMock.mockClear();
    handleTaskQueryParamMock.mockClear();
    leafletGetViewStateSpy.mockReset();
    leafletSetViewStateSpy.mockReset();
    leafletGetFloorSpy.mockReset();
    leafletSetFloorSpy.mockReset();
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
    localStorage.removeItem(STORAGE_KEYS.tasksMapPanelExpanded);
    const module = await import('@/pages/tasks.vue');
    TasksPage = module.default;
    await mountPage();
  });
  afterEach(() => {
    wrapper?.unmount();
  });
  it('filters merged details before revealing the first cards', async () => {
    wrapper.unmount();
    updateVisibleTasksMock.mockClear();
    let finishRewards: () => void = () => {};
    metadataStoreMock.fetchTaskRewardsData.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRewards = resolve;
        })
    );
    wrapper = await mountSuspended(TasksPage, {
      global: { stubs: defaultGlobalStubs },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(wrapper.find('task-loading-state-stub').exists()).toBe(true);
    expect(wrapper.find('[data-testid="task-card"]').exists()).toBe(false);
    expect(updateVisibleTasksMock).not.toHaveBeenCalled();
    finishRewards();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="task-card"]').exists()).toBe(true));
    expect(updateVisibleTasksMock).toHaveBeenCalled();
  });
  it.each([true, false])(
    'keeps the loading state until the initial filter refresh finishes (has tasks: %s)',
    async (hasTasks) => {
      wrapper.unmount();
      visibleTasksRef.value = [];
      updateVisibleTasksMock.mockClear();
      let finishRefresh: () => void = () => {};
      updateVisibleTasksMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishRefresh = resolve;
          })
      );
      wrapper = await mountSuspended(TasksPage, {
        global: { stubs: defaultGlobalStubs },
      });
      await vi.waitFor(() => expect(updateVisibleTasksMock).toHaveBeenCalled());
      expect(wrapper.find('task-loading-state-stub').exists()).toBe(true);
      expect(wrapper.find('task-empty-state-stub').exists()).toBe(false);
      visibleTasksRef.value = hasTasks ? [defaultTask] : [];
      finishRefresh();
      await vi.waitFor(() => expect(wrapper.find('task-loading-state-stub').exists()).toBe(false));
      expect(wrapper.find('[data-testid="task-card"]').exists()).toBe(hasTasks);
      expect(wrapper.find('task-empty-state-stub').exists()).toBe(!hasTasks);
    }
  );
  it('refreshes after initialization changes even when the task array is unchanged', async () => {
    metadataStoreMock.hasInitialized = false;
    await nextTick();
    expect(wrapper.find('task-loading-state-stub').exists()).toBe(true);
    updateVisibleTasksMock.mockClear();
    metadataStoreMock.hasInitialized = true;
    await vi.waitFor(() => expect(updateVisibleTasksMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(wrapper.find('task-loading-state-stub').exists()).toBe(false));
    expect(wrapper.find('[data-testid="task-card"]').exists()).toBe(true);
  });
  it('ignores a filter refresh settling from an earlier metadata cycle', async () => {
    let finishOld: () => void = () => {};
    let finishCurrent: () => void = () => {};
    updateVisibleTasksMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishOld = resolve;
        })
    );
    metadataStoreMock.loading = true;
    await nextTick();
    updateVisibleTasksMock.mockClear();
    metadataStoreMock.loading = false;
    await vi.waitFor(() => expect(updateVisibleTasksMock).toHaveBeenCalledTimes(1));
    metadataStoreMock.loading = true;
    await nextTick();
    updateVisibleTasksMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCurrent = resolve;
        })
    );
    metadataStoreMock.loading = false;
    await vi.waitFor(() => expect(updateVisibleTasksMock).toHaveBeenCalledTimes(2));
    finishOld();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(wrapper.find('task-loading-state-stub').exists()).toBe(true);
    finishCurrent();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="task-card"]').exists()).toBe(true));
  });
  it('keeps the loading state across a metadata reload until the new refresh finishes', async () => {
    metadataStoreMock.loading = true;
    await nextTick();
    visibleTasksRef.value = [];
    updateVisibleTasksMock.mockClear();
    let finishRefresh: () => void = () => {};
    updateVisibleTasksMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        })
    );
    metadataStoreMock.loading = false;
    await vi.waitFor(() => expect(updateVisibleTasksMock).toHaveBeenCalled());
    expect(wrapper.find('task-loading-state-stub').exists()).toBe(true);
    expect(wrapper.find('task-empty-state-stub').exists()).toBe(false);
    visibleTasksRef.value = [defaultTask];
    finishRefresh();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="task-card"]').exists()).toBe(true));
  });
  it('renders task cards when tasks are available', async () => {
    expect(wrapper.find('[data-testid="task-card"]').exists()).toBe(true);
  });
  it('renders task filter bar', async () => {
    expect(wrapper.find('[data-testid="task-filter"]').exists()).toBe(true);
  });
  it('uses the all status filter for graph visibility without overwriting the stored filter', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'graph';
    preferencesStoreMock.getTaskSecondaryView = 'available';
    await mountPage();
    expect(updateVisibleTasksMock).toHaveBeenCalled();
    const latestCall = updateVisibleTasksMock.mock.calls.at(-1);
    expect(latestCall?.[0]).toMatchObject({
      primaryView: 'graph',
      secondaryView: 'all',
    });
    expect(preferencesStoreMock.getTaskSecondaryView).toBe('available');
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
  it('expands the map panel by default on the map view', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountPage();
    const toggleButton = wrapper.find('[data-testid="map-panel-toggle"]');
    expect(toggleButton.attributes('aria-expanded')).toBe('true');
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
  it('restores the saved map panel expanded state', async () => {
    localStorage.setItem(STORAGE_KEYS.tasksMapPanelExpanded, 'true');
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountPage();
    const toggleButton = wrapper.find('[data-testid="map-panel-toggle"]');
    expect(toggleButton.attributes('aria-expanded')).toBe('true');
  });
  it('expands the map panel when jumping to a map objective from a collapsed state', async () => {
    localStorage.setItem(STORAGE_KEYS.tasksMapPanelExpanded, 'false');
    const TaskCardJumpStub = defineComponent({
      setup() {
        const jumpToMapObjective = inject(jumpToMapObjectiveKey, null);
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
    wrapper?.unmount();
    wrapper = await mountSuspended(TasksPage, {
      global: {
        stubs: {
          ...defaultGlobalStubs,
          TaskCard: TaskCardJumpStub,
        },
      },
    });
    await vi.waitFor(() => expect(wrapper.find('task-loading-state-stub').exists()).toBe(false));
    const toggleButton = wrapper.find('[data-testid="map-panel-toggle"]');
    expect(toggleButton.attributes('aria-expanded')).toBe('false');
    const jumpButton = wrapper.find('[data-testid="jump-to-map-objective"]');
    expect(jumpButton.exists()).toBe(true);
    await jumpButton.trigger('click');
    await nextTick();
    expect(toggleButton.attributes('aria-expanded')).toBe('true');
  });
  it('opens and closes the map full screen overlay', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    const panelViewState = { center: [55.7558, 37.6173] as [number, number], zoom: 12 };
    leafletGetViewStateSpy.mockReturnValue(panelViewState);
    await mountPage();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(false);
    await wrapper.find('[data-testid="map-fullscreen-toggle"]').trigger('click');
    await flushTransition();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(true);
    const fullscreenMap = wrapper.find(
      '[data-testid="map-fullscreen-overlay"] [data-testid="leaflet-map"]'
    );
    expect(fullscreenMap.attributes('data-initial-view')).toBe(JSON.stringify(panelViewState));
    const overlayViewState = { center: [59.939, 30.315] as [number, number], zoom: 14 };
    leafletGetViewStateSpy.mockReturnValue(overlayViewState);
    const exitButton = wrapper.find('[data-testid="map-fullscreen-exit"]');
    expect(exitButton.exists()).toBe(true);
    await exitButton.trigger('click');
    await flushTransition();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(false);
    expect(leafletSetViewStateSpy).toHaveBeenCalledWith(overlayViewState);
  });
  it('carries the inline map floor into the full screen overlay', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    leafletGetFloorSpy.mockReturnValue('3rd Floor');
    await mountPage();
    await wrapper.find('[data-testid="map-fullscreen-toggle"]').trigger('click');
    await flushTransition();
    const fullscreenMap = wrapper.find(
      '[data-testid="map-fullscreen-overlay"] [data-testid="leaflet-map"]'
    );
    expect(fullscreenMap.attributes('data-initial-floor')).toBe('3rd Floor');
  });
  it('restores the full screen floor onto the inline map on close', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    leafletGetFloorSpy.mockReturnValue('Ground Level');
    await mountPage();
    await wrapper.find('[data-testid="map-fullscreen-toggle"]').trigger('click');
    await flushTransition();
    leafletGetFloorSpy.mockReturnValue('2nd Floor');
    await wrapper.find('[data-testid="map-fullscreen-exit"]').trigger('click');
    await flushTransition();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(false);
    expect(leafletSetFloorSpy).toHaveBeenCalledWith('2nd Floor');
  });
  it('closes the map full screen overlay from the in-map control', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountPage();
    await wrapper.find('[data-testid="map-fullscreen-toggle"]').trigger('click');
    await flushTransition();
    const overlayToggle = wrapper.find(
      '[data-testid="map-fullscreen-overlay"] [data-testid="map-fullscreen-toggle"]'
    );
    expect(overlayToggle.exists()).toBe(true);
    await overlayToggle.trigger('click');
    await flushTransition();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(false);
  });
  it('keeps the map full screen control mounted while the map panel is collapsed', async () => {
    localStorage.setItem(STORAGE_KEYS.tasksMapPanelExpanded, 'false');
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountPage();
    const toggleButton = wrapper.find('[data-testid="map-panel-toggle"]');
    expect(toggleButton.attributes('aria-expanded')).toBe('false');
    const panelContent = wrapper.find('#tasks-map-panel-content');
    expect(panelContent.attributes('style')).toContain('display: none');
    expect(panelContent.find('[data-testid="map-fullscreen-toggle"]').exists()).toBe(true);
    await toggleButton.trigger('click');
    await flushTransition();
    expect(toggleButton.attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('#tasks-map-panel-content').attributes('style') ?? '').not.toContain(
      'display: none'
    );
  });
  it('moves focus into the full screen overlay and restores it on close', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountAttachedPage();
    const fullscreenToggle = wrapper.find('[data-testid="map-fullscreen-toggle"]');
    fullscreenToggle.element.focus();
    await fullscreenToggle.trigger('click');
    await flushTransition();
    const overlay = wrapper.find('[data-testid="map-fullscreen-overlay"]');
    expect(overlay.exists()).toBe(true);
    const exitButton = wrapper.find('[data-testid="map-fullscreen-exit"]');
    expect(document.activeElement).toBe(exitButton.element);
    const overlayMapToggle = wrapper.find(
      '[data-testid="map-fullscreen-overlay"] [data-testid="map-fullscreen-toggle"]'
    );
    expect(overlayMapToggle.exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    expect(document.activeElement).toBe(overlayMapToggle.element);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(exitButton.element);
    await exitButton.trigger('click');
    await flushTransition();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(false);
    expect(document.activeElement).toBe(fullscreenToggle.element);
  });
  it('names the map heading after the map and pairs both disclosure controls', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountPage();
    const headerToggle = wrapper.find('[data-testid="map-panel-toggle"]');
    expect(headerToggle.attributes('aria-label')).toBeUndefined();
    expect(headerToggle.text()).toContain('Map One');
    const collapseToggle = wrapper.find('[data-testid="map-collapse-toggle"]');
    expect(collapseToggle.attributes('aria-expanded')).toBe(
      headerToggle.attributes('aria-expanded')
    );
    expect(collapseToggle.attributes('aria-controls')).toBe('tasks-map-panel-content');
    await collapseToggle.trigger('click');
    await flushTransition();
    expect(headerToggle.attributes('aria-expanded')).toBe('false');
    expect(collapseToggle.attributes('aria-expanded')).toBe('false');
  });
  it('marks background content inert while the full screen map is open', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountAttachedPage();
    await wrapper.find('[data-testid="map-fullscreen-toggle"]').trigger('click');
    await flushTransition();
    const overlay = wrapper.find('[data-testid="map-fullscreen-overlay"]');
    expect(overlay.exists()).toBe(true);
    const panelToggleElement = wrapper.find('[data-testid="map-panel-toggle"]').element;
    expect(isInsideInertSubtree(panelToggleElement)).toBe(true);
    expect(isInsideInertSubtree(overlay.element)).toBe(false);
    await wrapper.find('[data-testid="map-fullscreen-exit"]').trigger('click');
    await flushTransition();
    expect(isInsideInertSubtree(panelToggleElement)).toBe(false);
  });
  it('leaves focus alone while a portalled popover is open in full screen', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountAttachedPage();
    await wrapper.find('[data-testid="map-fullscreen-toggle"]').trigger('click');
    await flushTransition();
    const popover = document.createElement('div');
    popover.setAttribute('data-reka-popper-content-wrapper', '');
    const popoverInput = document.createElement('button');
    popover.appendChild(popoverInput);
    document.body.appendChild(popover);
    popoverInput.focus();
    expect(document.activeElement).toBe(popoverInput);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(popoverInput);
    popover.remove();
  });
  it('keeps full screen open when Escape was already handled by a nested control', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountAttachedPage();
    await wrapper.find('[data-testid="map-fullscreen-toggle"]').trigger('click');
    await flushTransition();
    const handledEscape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    handledEscape.preventDefault();
    window.dispatchEvent(handledEscape);
    await flushTransition();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await flushTransition();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(false);
  });
  it('lets an open popover consume Escape before closing full screen', async () => {
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = 'map-1';
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    await mountAttachedPage();
    await wrapper.find('[data-testid="map-fullscreen-toggle"]').trigger('click');
    await flushTransition();
    const popover = document.createElement('div');
    popover.setAttribute('data-reka-popper-content-wrapper', '');
    popover.innerHTML = '<div role="dialog" data-state="open"></div>';
    document.body.appendChild(popover);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await flushTransition();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(true);
    popover.remove();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await flushTransition();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(false);
  });
  it('closes full screen and skips the view restore when the map view is left', async () => {
    const mapViewRef = ref('map-1');
    preferencesStoreMock.getTaskPrimaryView = 'maps';
    preferencesStoreMock.getTaskMapView = mapViewRef as unknown as string;
    metadataStoreMock.mapsWithSvg = [{ id: 'map-1', name: 'Map One' }];
    leafletGetViewStateSpy.mockReturnValue({ center: [1, 2], zoom: 3 });
    leafletGetFloorSpy.mockReturnValue('Ground Level');
    await mountAttachedPage();
    await wrapper.find('[data-testid="map-fullscreen-toggle"]').trigger('click');
    await flushTransition();
    const panelToggleElement = wrapper.find('[data-testid="map-panel-toggle"]').element;
    expect(isInsideInertSubtree(panelToggleElement)).toBe(true);
    mapViewRef.value = 'all';
    await flushTransition();
    expect(wrapper.find('[data-testid="map-fullscreen-overlay"]').exists()).toBe(false);
    expect(leafletSetViewStateSpy).not.toHaveBeenCalled();
    expect(leafletSetFloorSpy).not.toHaveBeenCalled();
    expect(isInsideInertSubtree(panelToggleElement)).toBe(false);
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
  it('shows a focused task section for deep-linked tasks', async () => {
    const focusedTask = createDefaultTask({ id: 'task-focus', name: 'Focused Task' });
    visibleTasksRef.value = [focusedTask, defaultTask];
    focusedTaskRef.value = focusedTask;
    await mountPage();
    expect(wrapper.find('[data-testid="focused-task-section"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('page.tasks.focused_task_section');
    const taskIds = wrapper
      .findAll('[data-testid="task-card"]')
      .map((item: { text: () => string }) => item.text());
    expect(taskIds[0]).toBe('task-focus');
    const clearButton = wrapper.find('button[aria-label="common.clear_focus"]');
    expect(clearButton.exists()).toBe(true);
    await clearButton.trigger('click');
    expect(clearPinnedTaskMock).toHaveBeenCalledTimes(1);
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
