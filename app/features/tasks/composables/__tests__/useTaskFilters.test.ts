import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { applySearchToTaskList, useTaskFilters } from '@/features/tasks/composables/useTaskFilters';
import type { Task } from '@/types/tarkov';
import type { TaskFilterAndSortOptions, TaskSecondaryView } from '@/types/taskFilter';
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
const createOptions = (overrides: Partial<TaskFilterAndSortOptions> = {}) =>
  computed(
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
        ...overrides,
      }) as TaskFilterAndSortOptions
  );
describe('useTaskFilters', () => {
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
  it('filters visible tasks by the normalized search', () => {
    const visibleTasks = ref([createTask('1', 'Alpha Task'), createTask('2', 'Bravo')]);
    const normalizedSearch = ref('');
    const { filteredTasks, searchStatusCounts } = useTaskFilters({
      calculateFilteredTasksForOptions: (inputTasks) => inputTasks,
      getTaskMapView: ref('all'),
      hideCompletedMapObjectives: ref(false),
      mapTaskVisibilityFilterOptions: createOptions(),
      normalizedSearch,
      showMapDisplay: computed(() => false),
      tasks: ref([...visibleTasks.value]),
      visibleTasks,
    });
    expect(filteredTasks.value.map((task) => task.id)).toEqual(['1', '2']);
    expect(searchStatusCounts.value).toBeNull();
    normalizedSearch.value = 'alpha';
    expect(filteredTasks.value.map((task) => task.id)).toEqual(['1']);
  });
  it('counts search matches per status through the status filter pipeline', () => {
    const statusById: Record<string, TaskSecondaryView> = {
      mole: 'locked',
      other: 'available',
      shortage: 'completed',
    };
    const tasks = ref([
      createTask('mole', 'Saving the Mole'),
      createTask('other', 'Debut'),
      createTask('shortage', 'Shortage', 'Saving kit'),
    ]);
    const calculateFilteredTasksForOptions = vi.fn(
      (inputTasks: Task[], options: TaskFilterAndSortOptions, hide?: boolean) => {
        expect(hide).toBe(true);
        if (options.secondaryView === 'all') return inputTasks;
        return inputTasks.filter((task) => statusById[task.id] === options.secondaryView);
      }
    );
    const { searchStatusCounts } = useTaskFilters({
      calculateFilteredTasksForOptions,
      getTaskMapView: ref('all'),
      hideCompletedMapObjectives: ref(true),
      mapTaskVisibilityFilterOptions: createOptions(),
      normalizedSearch: ref('saving'),
      showMapDisplay: computed(() => false),
      tasks,
      visibleTasks: ref([]),
    });
    expect(searchStatusCounts.value).toEqual({
      all: 2,
      available: 0,
      completed: 1,
      failed: 0,
      locked: 1,
    });
  });
  it('calculates hidden map objective task count with search applied', () => {
    const tasks = ref([createTask('1', 'Alpha Task'), createTask('2', 'Bravo Task')]);
    const calculateFilteredTasksForOptions = vi.fn(
      (_tasks: Task[], _options: TaskFilterAndSortOptions, hideCompletedMapObjectives?: boolean) =>
        hideCompletedMapObjectives ? [tasks.value[0]!] : tasks.value
    );
    const { mapCompleteTasksCountOnMap, showMapTaskVisibilityNotice } = useTaskFilters({
      calculateFilteredTasksForOptions,
      getTaskMapView: ref('woods'),
      hideCompletedMapObjectives: ref(true),
      mapTaskVisibilityFilterOptions: createOptions({
        mapView: 'woods',
        mergedMaps: [{ id: 'woods', mergedIds: ['woods'] }],
        primaryView: 'maps',
      }),
      normalizedSearch: ref('task'),
      showMapDisplay: computed(() => true),
      tasks,
      visibleTasks: ref([...tasks.value]),
    });
    expect(mapCompleteTasksCountOnMap.value).toBe(1);
    expect(calculateFilteredTasksForOptions).toHaveBeenCalledTimes(2);
    expect(showMapTaskVisibilityNotice.value).toBe(true);
  });
});
