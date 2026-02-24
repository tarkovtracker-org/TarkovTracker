import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { applySearchToTaskList, useTaskFilters } from '@/features/tasks/composables/useTaskFilters';
import type { Task } from '@/types/tarkov';
import type { TaskFilterAndSortOptions } from '@/types/taskFilter';
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
});
