import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, nextTick, reactive, ref } from 'vue';
import { applySearchToTaskList, useTaskFilters } from '@/features/tasks/composables/useTaskFilters';
import type { Task } from '@/types/tarkov';
import type { TaskFilterAndSortOptions } from '@/types/taskFilter';
const routeState = reactive({
  query: reactive<Record<string, string | undefined>>({}),
});
mockNuxtImport('useRoute', () => () => routeState);
const createTask = (
  id: string,
  name: string,
  rewardName?: string,
  offerUnlockName?: string
): Task =>
  ({
    experience: 0,
    finishRewards:
      rewardName || offerUnlockName
        ? {
            items: rewardName
              ? [
                  {
                    count: 1,
                    item: { id: `${id}-reward`, name: rewardName },
                  },
                ]
              : undefined,
            offerUnlock: offerUnlockName
              ? [
                  {
                    id: `${id}-unlock`,
                    item: { id: `${id}-unlock-item`, name: offerUnlockName },
                    level: 1,
                    trader: { id: 'trader', name: 'Trader' },
                  },
                ]
              : undefined,
          }
        : undefined,
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
  it.each([true, false])(
    'applies initial q before any timer, catalog loaded=%s',
    async (loaded) => {
      vi.useFakeTimers();
      routeState.query.q = '  AlPhA  ';
      const catalog = [createTask('1', 'Alpha Task'), createTask('2', 'Beta Task')];
      const tasks = ref(loaded ? catalog : []);
      const scope = effectScope();
      const filters = scope.run(() =>
        useTaskFilters({
          calculateFilteredTasksForOptions: (inputTasks) => inputTasks,
          getTaskMapView: ref('all'),
          mapTaskVisibilityFilterOptions: computed(
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
          ),
          showMapDisplay: computed(() => false),
          tasks,
          visibleTasks: tasks,
        })
      )!;
      expect(filters.searchQuery.value).toBe('  AlPhA  ');
      expect(filters.normalizedSearch.value).toBe('alpha');
      expect(filters.isSearchActive.value).toBe(true);
      expect(filters.filteredTasks.value.map((task) => task.id)).toEqual(loaded ? ['1'] : []);
      tasks.value = catalog;
      await nextTick();
      expect(filters.filteredTasks.value.map((task) => task.id)).toEqual(['1']);
      expect(filters.activeSearchCount.value).toBe(1);
      routeState.query.q = 'beta';
      await nextTick();
      expect(filters.searchQuery.value).toBe('beta');
      await vi.advanceTimersByTimeAsync(179);
      expect(filters.filteredTasks.value.map((task) => task.id)).toEqual(['1']);
      await vi.advanceTimersByTimeAsync(1);
      expect(filters.filteredTasks.value.map((task) => task.id)).toEqual(['2']);
      routeState.query.q = undefined;
      await nextTick();
      expect(filters.isSearchActive.value).toBe(false);
      expect(filters.filteredTasks.value.map((task) => task.id)).toEqual(['1', '2']);
      filters.searchQuery.value = 'alpha';
      await nextTick();
      filters.searchQuery.value = '';
      await nextTick();
      await vi.advanceTimersByTimeAsync(200);
      expect(filters.isSearchActive.value).toBe(false);
      filters.searchQuery.value = 'beta';
      await nextTick();
      filters.cleanup();
      scope.stop();
      await vi.advanceTimersByTimeAsync(200);
      expect(filters.normalizedSearch.value).toBe('');
    }
  );
  it('keeps list order when search query is empty', () => {
    const tasks = [createTask('a', 'First'), createTask('b', 'Second')];
    expect(applySearchToTaskList(tasks, '')).toEqual(tasks);
  });
  it('matches task completion reward items', () => {
    const tasks = [createTask('a', 'First'), createTask('b', 'Second', 'Graphics card')];
    expect(applySearchToTaskList(tasks, 'graphics').map((task) => task.id)).toEqual(['b']);
  });
  it('matches task offer unlock reward items', () => {
    const tasks = [
      createTask('a', 'First'),
      createTask('b', 'Second', undefined, 'Ledx Skin Transilluminator'),
    ];
    expect(applySearchToTaskList(tasks, 'ledx').map((task) => task.id)).toEqual(['b']);
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
