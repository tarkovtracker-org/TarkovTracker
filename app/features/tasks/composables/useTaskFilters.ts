import { debounce, isDebounceRejection } from '@/utils/debounce';
import { fuzzyMatchScore } from '@/utils/fuzzySearch';
import { logger } from '@/utils/logger';
import type { Task } from '@/types/tarkov';
import type { TaskFilterAndSortOptions } from '@/types/taskFilter';
type RefLike<T> = { value: T };
type ComputedRefLike<T> = Readonly<{ value: T }>;
type TaskFilterInputs = {
  calculateFilteredTasksForOptions: (
    tasks: Task[],
    options: TaskFilterAndSortOptions,
    hideCompletedMapObjectives?: boolean,
    overrides?: {
      hideGlobalTasks?: boolean;
    }
  ) => Task[];
  getTaskMapView: RefLike<string>;
  mapTaskVisibilityFilterOptions: ComputedRefLike<TaskFilterAndSortOptions>;
  showMapDisplay: ComputedRefLike<boolean>;
  tasks: RefLike<Task[]>;
  visibleTasks: RefLike<Task[]>;
};
export const applySearchToTaskList = (taskList: Task[], query: string): Task[] => {
  if (!query) return taskList;
  return taskList
    .map((task) => ({
      task,
      score: fuzzyMatchScore(task.name ?? '', query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ task }) => task);
};
export function useTaskFilters({
  calculateFilteredTasksForOptions,
  getTaskMapView,
  mapTaskVisibilityFilterOptions,
  showMapDisplay,
  tasks,
  visibleTasks,
}: TaskFilterInputs) {
  const searchQuery = ref('');
  const debouncedSearch = ref('');
  const updateDebouncedSearch = debounce((value: string) => {
    debouncedSearch.value = value;
  }, 180);
  watch(searchQuery, (value) => {
    if (!value) {
      updateDebouncedSearch.cancel();
      debouncedSearch.value = '';
      return;
    }
    void updateDebouncedSearch(value).catch((error) => {
      if (isDebounceRejection(error)) return;
      logger.error('[Tasks] Debounced search update failed:', error);
    });
  });
  const normalizedSearch = computed(() => debouncedSearch.value.toLowerCase().trim());
  const isSearchActive = computed(() => normalizedSearch.value.length > 0);
  const filteredTasks = computed(() => {
    return applySearchToTaskList(visibleTasks.value, normalizedSearch.value);
  });
  const mapCompleteTasksCountOnMap = computed(() => {
    if (!showMapDisplay.value) return 0;
    if (!tasks.value.length) return 0;
    const selectedMapId = getTaskMapView.value;
    if (!selectedMapId || selectedMapId === 'all') return 0;
    const tasksWithoutHiding = applySearchToTaskList(
      calculateFilteredTasksForOptions(tasks.value, mapTaskVisibilityFilterOptions.value, false),
      normalizedSearch.value
    );
    const tasksWithHiding = applySearchToTaskList(
      calculateFilteredTasksForOptions(tasks.value, mapTaskVisibilityFilterOptions.value, true),
      normalizedSearch.value
    );
    return Math.max(tasksWithoutHiding.length - tasksWithHiding.length, 0);
  });
  const showMapTaskVisibilityNotice = computed(() => {
    return showMapDisplay.value && mapCompleteTasksCountOnMap.value > 0;
  });
  const activeSearchCount = computed(() => filteredTasks.value.length);
  return {
    activeSearchCount,
    cleanup() {
      updateDebouncedSearch.cancel();
    },
    filteredTasks,
    isSearchActive,
    mapCompleteTasksCountOnMap,
    normalizedSearch,
    searchQuery,
    showMapTaskVisibilityNotice,
  };
}
