import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, isRef, reactive, ref } from 'vue';
import type { Task } from '@/types/tarkov';
type QueryRecord = Record<string, string | string[] | undefined>;
const routeState = reactive({
  path: '/tasks',
  query: reactive<QueryRecord>({}),
});
const applyRouteQuery = (query: QueryRecord) => {
  Object.keys(routeState.query).forEach((key) => {
    routeState.query[key] = undefined;
  });
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      routeState.query[key] = value;
    }
  });
};
const replace = vi.fn(async ({ query }: { query: QueryRecord }) => {
  applyRouteQuery(query);
});
mockNuxtImport('useRoute', () => () => routeState);
mockNuxtImport('useRouter', () => () => ({
  currentRoute: { value: routeState },
  replace,
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
  afterEach: vi.fn(),
}));
const metadataTasks = ref<Task[]>([]);
const metadataState = reactive({
  tasksObjectivesHydrated: false,
});
const preferenceState = reactive({
  hideNonKappaTasks: false,
  onlyTasksWithRequiredKeys: true,
  showLightkeeperTasks: true,
  showNonSpecialTasks: true,
  taskPrimaryView: 'all',
  taskSecondaryView: 'all',
});
const setHideNonKappaTasks = vi.fn((value: boolean) => {
  preferenceState.hideNonKappaTasks = value;
});
const setOnlyTasksWithRequiredKeys = vi.fn((value: boolean) => {
  preferenceState.onlyTasksWithRequiredKeys = value;
});
const setShowLightkeeperTasks = vi.fn((value: boolean) => {
  preferenceState.showLightkeeperTasks = value;
});
const setShowNonSpecialTasks = vi.fn((value: boolean) => {
  preferenceState.showNonSpecialTasks = value;
});
const setTaskPrimaryView = vi.fn((value: string) => {
  preferenceState.taskPrimaryView = value;
});
const setTaskSecondaryView = vi.fn((value: string) => {
  preferenceState.taskSecondaryView = value;
});
const tasksCompletions = ref<Record<string, Record<string, boolean>>>({});
const tasksFailed = ref<Record<string, Record<string, boolean>>>({});
const unlockedTasks = ref<Record<string, Record<string, boolean>>>({});
const trackFocusedTaskVisible = vi.fn();
describe('useTaskDeepLink', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    routeState.path = '/tasks';
    applyRouteQuery({});
    metadataTasks.value = [];
    metadataState.tasksObjectivesHydrated = false;
    preferenceState.hideNonKappaTasks = false;
    preferenceState.onlyTasksWithRequiredKeys = true;
    preferenceState.showLightkeeperTasks = true;
    preferenceState.showNonSpecialTasks = true;
    preferenceState.taskPrimaryView = 'all';
    preferenceState.taskSecondaryView = 'all';
    tasksCompletions.value = {};
    tasksFailed.value = {};
    unlockedTasks.value = {};
    vi.doMock('pinia', async () => {
      const actual = await vi.importActual<typeof import('pinia')>('pinia');
      return {
        ...actual,
        storeToRefs: (store: Record<string, unknown>) => {
          const refs: Record<string, unknown> = {};
          Object.entries(store).forEach(([key, value]) => {
            if (typeof value === 'function') return;
            refs[key] = isRef(value) ? value : computed(() => store[key as keyof typeof store]);
          });
          return refs;
        },
      };
    });
    vi.doMock('@/stores/useMetadata', () => ({
      useMetadataStore: () => ({
        tasks: metadataTasks,
        get tasksObjectivesHydrated() {
          return metadataState.tasksObjectivesHydrated;
        },
        getTraderByName: () => undefined,
      }),
    }));
    vi.doMock('@/stores/usePreferences', () => ({
      usePreferencesStore: () => ({
        get getHideNonKappaTasks() {
          return preferenceState.hideNonKappaTasks;
        },
        get getOnlyTasksWithRequiredKeys() {
          return preferenceState.onlyTasksWithRequiredKeys;
        },
        get getShowLightkeeperTasks() {
          return preferenceState.showLightkeeperTasks;
        },
        get getShowNonSpecialTasks() {
          return preferenceState.showNonSpecialTasks;
        },
        get getTaskPrimaryView() {
          return preferenceState.taskPrimaryView;
        },
        get getTaskSecondaryView() {
          return preferenceState.taskSecondaryView;
        },
        setHideNonKappaTasks,
        setOnlyTasksWithRequiredKeys,
        setShowLightkeeperTasks,
        setShowNonSpecialTasks,
        setTaskPrimaryView,
        setTaskSecondaryView,
      }),
    }));
    vi.doMock('@/stores/useProgress', () => ({
      useProgressStore: () => ({
        tasksCompletions,
        tasksFailed,
        unlockedTasks,
      }),
    }));
    vi.doMock('@/composables/useDashboardFocusAnalytics', () => ({
      useDashboardFocusAnalytics: () => ({
        trackFocusedTaskVisible,
      }),
    }));
  });
  it('does not clear required-keys preference before objectives hydrate', async () => {
    metadataTasks.value = [
      {
        id: 'task-no-keys',
        name: 'Task Without Keys',
        requiredKeys: [],
      },
    ];
    applyRouteQuery({ task: 'task-no-keys' });
    const { useTaskDeepLink } = await import('@/composables/useTaskDeepLink');
    const taskDeepLink = useTaskDeepLink({
      filteredTasks: ref([]),
      leafletMapRef: ref(null),
    });
    await taskDeepLink.handleTaskQueryParam();
    expect(setOnlyTasksWithRequiredKeys).not.toHaveBeenCalled();
    expect(preferenceState.onlyTasksWithRequiredKeys).toBe(true);
  });
  it('clears required-keys preference after objectives hydrate when task has no keys', async () => {
    metadataState.tasksObjectivesHydrated = true;
    metadataTasks.value = [
      {
        id: 'task-no-keys',
        name: 'Task Without Keys',
        requiredKeys: [],
      },
    ];
    applyRouteQuery({ task: 'task-no-keys' });
    const { useTaskDeepLink } = await import('@/composables/useTaskDeepLink');
    const taskDeepLink = useTaskDeepLink({
      filteredTasks: ref([]),
      leafletMapRef: ref(null),
    });
    await taskDeepLink.handleTaskQueryParam();
    expect(setOnlyTasksWithRequiredKeys).toHaveBeenCalledWith(false);
    expect(preferenceState.onlyTasksWithRequiredKeys).toBe(false);
  });
  it('hands a plain task link on the maps route to the list route', async () => {
    metadataTasks.value = [{ id: 'task-on-map', name: 'Map Task', requiredKeys: [] }];
    routeState.path = '/tasks/maps';
    applyRouteQuery({ task: 'task-on-map', map: 'map-1' });
    const { useTaskDeepLink } = await import('@/composables/useTaskDeepLink');
    const taskDeepLink = useTaskDeepLink({
      filteredTasks: ref(metadataTasks.value),
      leafletMapRef: ref(null),
    });
    await taskDeepLink.handleTaskQueryParam();
    expect(replace).toHaveBeenCalledWith({
      path: '/tasks',
      query: expect.objectContaining({ task: 'task-on-map', map: 'map-1' }),
    });
    expect(taskDeepLink.pinnedTaskId.value).toBeFalsy();
  });
  it('clears the page search before handing a task link to the list route', async () => {
    metadataTasks.value = [{ id: 'task-on-map', name: 'Map Task', requiredKeys: [] }];
    routeState.path = '/tasks/maps';
    applyRouteQuery({ task: 'task-on-map', q: 'mole' });
    const { useTaskDeepLink } = await import('@/composables/useTaskDeepLink');
    const taskDeepLink = useTaskDeepLink({
      filteredTasks: ref(metadataTasks.value),
      leafletMapRef: ref(null),
    });
    await taskDeepLink.handleTaskQueryParam();
    expect(replace).toHaveBeenNthCalledWith(1, { query: { task: 'task-on-map', q: undefined } });
    expect(replace).toHaveBeenLastCalledWith({
      path: '/tasks',
      query: expect.not.objectContaining({ q: 'mole' }),
    });
  });
  it('clears the page search after a search write still waiting in the queue', async () => {
    metadataTasks.value = [{ id: 'task-on-map', name: 'Map Task', requiredKeys: [] }];
    routeState.path = '/tasks/maps';
    applyRouteQuery({ task: 'task-on-map', q: 'mo' });
    const { queueQueryWrite } = await import('@/utils/routeHelpers');
    const { useRouteSearchQuery } = await import('@/composables/useRouteSearchQuery');
    let landEarlierWrite = () => {};
    const earlierWriteLanded = new Promise<void>((resolve) => (landEarlierWrite = resolve));
    void queueQueryWrite(() => earlierWriteLanded);
    const typedSearch = useRouteSearchQuery().setSearchQuery('mole');
    const { useTaskDeepLink } = await import('@/composables/useTaskDeepLink');
    const taskDeepLink = useTaskDeepLink({
      filteredTasks: ref(metadataTasks.value),
      leafletMapRef: ref(null),
    });
    const deepLink = taskDeepLink.handleTaskQueryParam();
    landEarlierWrite();
    await Promise.all([typedSearch, deepLink]);
    expect(replace).toHaveBeenLastCalledWith({
      path: '/tasks',
      query: expect.not.objectContaining({ q: expect.anything() }),
    });
  });
  it('stops handling a task link once the user leaves while the search clear waits', async () => {
    metadataTasks.value = [{ id: 'task-on-map', name: 'Map Task', requiredKeys: [] }];
    routeState.path = '/tasks/maps';
    applyRouteQuery({ task: 'task-on-map', q: 'mo' });
    const { queueQueryWrite } = await import('@/utils/routeHelpers');
    let landEarlierWrite = () => {};
    const earlierWriteLanded = new Promise<void>((resolve) => (landEarlierWrite = resolve));
    void queueQueryWrite(() => earlierWriteLanded);
    const { useTaskDeepLink } = await import('@/composables/useTaskDeepLink');
    const taskDeepLink = useTaskDeepLink({
      filteredTasks: ref(metadataTasks.value),
      leafletMapRef: ref(null),
    });
    const deepLink = taskDeepLink.handleTaskQueryParam();
    routeState.path = '/hideout';
    landEarlierWrite();
    await deepLink;
    expect(replace).not.toHaveBeenCalled();
  });
  it('keeps the deep-linked task focused even when it is already visible', async () => {
    metadataTasks.value = [
      {
        id: 'task-visible',
        name: 'Visible Task',
        requiredKeys: [],
      },
    ];
    applyRouteQuery({ task: 'task-visible' });
    const taskElement = document.createElement('div');
    taskElement.id = 'task-task-visible';
    taskElement.scrollIntoView = vi.fn();
    document.body.appendChild(taskElement);
    const { useTaskDeepLink } = await import('@/composables/useTaskDeepLink');
    const taskDeepLink = useTaskDeepLink({
      filteredTasks: ref(metadataTasks.value),
      leafletMapRef: ref(null),
    });
    await taskDeepLink.handleTaskQueryParam();
    expect(taskDeepLink.pinnedTaskId.value).toBe('task-visible');
    expect(taskElement.scrollIntoView).toHaveBeenCalled();
    expect(trackFocusedTaskVisible).toHaveBeenCalledWith('task-visible');
    expect(replace).toHaveBeenCalledWith({ query: { status: 'all' } });
  });
  it.each(['locked', 'completed', 'failed'] as const)(
    'keeps a %s task focused after query cleanup synchronizes the status filter',
    async (status) => {
      const task: Task = { id: 'target', name: 'Target', requiredKeys: [] };
      metadataTasks.value = [task];
      preferenceState.taskSecondaryView = 'available';
      if (status === 'completed') tasksCompletions.value.target = { self: true };
      if (status === 'failed') tasksFailed.value.target = { self: true };
      applyRouteQuery({ task: task.id });
      const previousReplace = replace.getMockImplementation()!;
      replace.mockImplementation(async ({ query }) => {
        applyRouteQuery(query);
        preferenceState.taskSecondaryView = String(query.status ?? 'available');
      });
      try {
        const filteredTasks = computed(() =>
          [status, 'all'].includes(preferenceState.taskSecondaryView) ? [task] : []
        );
        const element = document.createElement('div');
        element.id = `task-${task.id}`;
        element.scrollIntoView = vi.fn();
        document.body.appendChild(element);
        const { useTaskDeepLink } = await import('@/composables/useTaskDeepLink');
        const link = useTaskDeepLink({ filteredTasks, leafletMapRef: ref(null) });
        await link.handleTaskQueryParam();
        expect(link.pinnedTask.value?.id).toBe(task.id);
        expect(routeState.query.task).toBeUndefined();
        expect(preferenceState.taskSecondaryView).toBe(status);
      } finally {
        replace.mockImplementation(previousReplace);
      }
    }
  );
  it('waits for the task element to mount before clearing the deep-link query', async () => {
    vi.useFakeTimers();
    try {
      metadataTasks.value = [
        {
          id: 'task-delayed',
          name: 'Delayed Task',
          requiredKeys: [],
        },
      ];
      applyRouteQuery({ task: 'task-delayed' });
      const { useTaskDeepLink } = await import('@/composables/useTaskDeepLink');
      const filteredTasks = ref<Task[]>(metadataTasks.value);
      const taskDeepLink = useTaskDeepLink({
        filteredTasks,
        leafletMapRef: ref(null),
      });
      const handleTaskQueryParamPromise = taskDeepLink.handleTaskQueryParam();
      await vi.advanceTimersByTimeAsync(50);
      const taskElement = document.createElement('div');
      taskElement.id = 'task-task-delayed';
      taskElement.scrollIntoView = vi.fn();
      document.body.appendChild(taskElement);
      await vi.advanceTimersByTimeAsync(25);
      await handleTaskQueryParamPromise;
      expect(taskDeepLink.pinnedTaskId.value).toBe('task-delayed');
      expect(taskElement.scrollIntoView).toHaveBeenCalled();
      expect(trackFocusedTaskVisible).toHaveBeenCalledWith('task-delayed');
      expect(replace).toHaveBeenCalledWith({ query: { status: 'all' } });
    } finally {
      vi.useRealTimers();
    }
  });
  it('waits for filtered tasks to settle before bailing on a deep link', async () => {
    vi.useFakeTimers();
    try {
      metadataTasks.value = [
        {
          id: 'task-filter-delay',
          name: 'Delayed By Filters',
          requiredKeys: [],
        },
      ];
      applyRouteQuery({ task: 'task-filter-delay' });
      const { useTaskDeepLink } = await import('@/composables/useTaskDeepLink');
      const filteredTasks = ref<Task[]>([]);
      const taskDeepLink = useTaskDeepLink({
        filteredTasks,
        leafletMapRef: ref(null),
      });
      const taskElement = document.createElement('div');
      taskElement.id = 'task-task-filter-delay';
      taskElement.scrollIntoView = vi.fn();
      const handleTaskQueryParamPromise = taskDeepLink.handleTaskQueryParam();
      await vi.advanceTimersByTimeAsync(50);
      filteredTasks.value = metadataTasks.value;
      document.body.appendChild(taskElement);
      await vi.advanceTimersByTimeAsync(25);
      await handleTaskQueryParamPromise;
      expect(taskDeepLink.pinnedTaskId.value).toBe('task-filter-delay');
      expect(taskElement.scrollIntoView).toHaveBeenCalled();
      expect(trackFocusedTaskVisible).toHaveBeenCalledWith('task-filter-delay');
      expect(replace).toHaveBeenCalledWith({ query: { status: 'all' } });
    } finally {
      vi.useRealTimers();
    }
  });
});
