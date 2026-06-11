import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, reactive, ref } from 'vue';
import { applySearchToTaskList, useTaskFilters } from '@/features/tasks/composables/useTaskFilters';
import type { Task } from '@/types/tarkov';
import type { TaskFilterAndSortOptions } from '@/types/taskFilter';
const routeState = reactive({
  query: reactive<Record<string, string | undefined>>({}),
});
mockNuxtImport('useRoute', () => () => routeState);
const createTask = (id: string, name: string): Task =>
  ({
    experience: 0,
    id,
    kappaRequired: false,
    lightkeeperRequired: false,
    minPlayerLevel: 1,
    name,
    objectives: [],
    taskRequirements: [],
  }) as Task;
describe('useTaskFilters', () => {
  beforeEach(() => {
    routeState.query.q = undefined;
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('keeps list order when search query is empty', () => {
    const tasks = [createTask('a', 'First'), createTask('b', 'Second')];
    expect(applySearchToTaskList(tasks, '')).toEqual(tasks);
  });
  it('updates debounced search state and filtered tasks', async () => {
    vi.useFakeTimers();
    const visibleTasks = ref([createTask('1', 'Alpha Task'), createTask('2', 'Bravo')]);
    const tasks = ref([...visibleTasks.value]);
    const getTaskMapView = ref('all');
    const showMapDisplay = computed(() => false);
    const options = computed(
      () =>
        ({
          mapView: 'all',
          mergedMaps: [],
          primaryView: 'all',
          secondaryView: 'available',
          sortDirection: 'asc',
          sortMode: 'none',
          traderView: 'all',
          userView: 'self',
        }) as TaskFilterAndSortOptions
    );
    const { filteredTasks, isSearchActive, searchQuery } = useTaskFilters({
      calculateFilteredTasksForOptions: (inputTasks) => inputTasks,
      getTaskMapView,
      mapTaskVisibilityFilterOptions: options,
      showMapDisplay,
      tasks,
      visibleTasks,
    });
    searchQuery.value = 'alpha';
    await vi.advanceTimersByTimeAsync(200);
    expect(isSearchActive.value).toBe(true);
    expect(filteredTasks.value.map((task) => task.id)).toEqual(['1']);
  });
  it('calculates hidden map objective task count with search applied', async () => {
    vi.useFakeTimers();
    const tasks = ref([createTask('1', 'Alpha Task'), createTask('2', 'Bravo Task')]);
    const visibleTasks = ref([...tasks.value]);
    const getTaskMapView = ref('woods');
    const showMapDisplay = computed(() => true);
    const options = computed(
      () =>
        ({
          mapView: 'woods',
          mergedMaps: [{ id: 'woods', mergedIds: ['woods'] }],
          primaryView: 'maps',
          secondaryView: 'available',
          sortDirection: 'asc',
          sortMode: 'none',
          traderView: 'all',
          userView: 'self',
        }) as TaskFilterAndSortOptions
    );
    const calculateFilteredTasksForOptions = vi.fn(
      (_tasks: Task[], _options: TaskFilterAndSortOptions, hideCompletedMapObjectives?: boolean) =>
        hideCompletedMapObjectives ? [tasks.value[0]!] : tasks.value
    );
    const { mapCompleteTasksCountOnMap, searchQuery, showMapTaskVisibilityNotice } = useTaskFilters(
      {
        calculateFilteredTasksForOptions,
        getTaskMapView,
        mapTaskVisibilityFilterOptions: options,
        showMapDisplay,
        tasks,
        visibleTasks,
      }
    );
    searchQuery.value = 'task';
    await vi.advanceTimersByTimeAsync(200);
    expect(mapCompleteTasksCountOnMap.value).toBe(1);
    expect(calculateFilteredTasksForOptions).toHaveBeenCalledTimes(2);
    expect(showMapTaskVisibilityNotice.value).toBe(true);
  });
  it('initializes searchQuery from route.query.q and updates on changes', async () => {
    routeState.query.q = 'initial-search';
    const visibleTasks = ref([createTask('1', 'Alpha Task')]);
    const tasks = ref([...visibleTasks.value]);
    const getTaskMapView = ref('all');
    const showMapDisplay = computed(() => false);
    const options = computed(
      () =>
        ({
          mapView: 'all',
          mergedMaps: [],
          primaryView: 'all',
          secondaryView: 'available',
          sortDirection: 'asc',
          sortMode: 'none',
          traderView: 'all',
          userView: 'self',
        }) as TaskFilterAndSortOptions
    );
    const { searchQuery } = useTaskFilters({
      calculateFilteredTasksForOptions: (inputTasks) => inputTasks,
      getTaskMapView,
      mapTaskVisibilityFilterOptions: options,
      showMapDisplay,
      tasks,
      visibleTasks,
    });
    expect(searchQuery.value).toBe('initial-search');
    routeState.query.q = 'new-search';
    await nextTick();
    expect(searchQuery.value).toBe('new-search');
    routeState.query.q = undefined;
    await nextTick();
    expect(searchQuery.value).toBe('');
  });
  it('falls back to an empty string when route.query.q is an array', async () => {
    routeState.query.q = ['foo', 'bar'] as unknown as string;
    const visibleTasks = ref([createTask('1', 'Alpha Task')]);
    const tasks = ref([...visibleTasks.value]);
    const getTaskMapView = ref('all');
    const showMapDisplay = computed(() => false);
    const options = computed(
      () =>
        ({
          mapView: 'all',
          mergedMaps: [],
          primaryView: 'all',
          secondaryView: 'available',
          sortDirection: 'asc',
          sortMode: 'none',
          traderView: 'all',
          userView: 'self',
        }) as TaskFilterAndSortOptions
    );
    const { searchQuery } = useTaskFilters({
      calculateFilteredTasksForOptions: (inputTasks) => inputTasks,
      getTaskMapView,
      mapTaskVisibilityFilterOptions: options,
      showMapDisplay,
      tasks,
      visibleTasks,
    });
    expect(searchQuery.value).toBe('foo');
    expect(typeof searchQuery.value).toBe('string');
  });
});
