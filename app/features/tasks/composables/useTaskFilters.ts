import { fuzzyMatchScore } from '@/utils/fuzzySearch';
import { getTaskRewardItems } from '@/utils/taskRewards';
import type { Task } from '@/types/tarkov';
import type { TaskFilterAndSortOptions, TaskSecondaryView } from '@/types/taskFilter';
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
  hideCompletedMapObjectives: RefLike<boolean>;
  mapTaskVisibilityFilterOptions: ComputedRefLike<TaskFilterAndSortOptions>;
  normalizedSearch: ComputedRefLike<string>;
  showMapDisplay: ComputedRefLike<boolean>;
  tasks: RefLike<Task[]>;
  visibleTasks: RefLike<Task[]>;
};
const getTaskRewardItemSearchText = (task: Task): string => {
  return getTaskRewardItems(task)
    .flatMap((item) => [item.name, item.shortName, item.normalizedName])
    .filter((value): value is string => Boolean(value))
    .join(' ');
};
const getTaskSearchScore = (task: Task, query: string): number => {
  return Math.max(
    fuzzyMatchScore(task.name ?? '', query),
    fuzzyMatchScore(getTaskRewardItemSearchText(task), query)
  );
};
export const applySearchToTaskList = (taskList: Task[], query: string): Task[] => {
  if (!query) return taskList;
  return taskList
    .map((task) => ({
      task,
      score: getTaskSearchScore(task, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ task }) => task);
};
export type TaskStatusCounts = Record<TaskSecondaryView, number>;
const STATUS_VIEWS: readonly TaskSecondaryView[] = [
  'all',
  'available',
  'locked',
  'completed',
  'failed',
];
export function useTaskFilters({
  calculateFilteredTasksForOptions,
  getTaskMapView,
  hideCompletedMapObjectives,
  mapTaskVisibilityFilterOptions,
  normalizedSearch,
  showMapDisplay,
  tasks,
  visibleTasks,
}: TaskFilterInputs) {
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
  // Matches per status tab, run through the same pipeline the list uses for that tab.
  const searchStatusCounts = computed<TaskStatusCounts | null>(() => {
    if (!normalizedSearch.value) return null;
    const options = mapTaskVisibilityFilterOptions.value;
    const counts = {} as TaskStatusCounts;
    for (const status of STATUS_VIEWS) {
      const statusTasks = calculateFilteredTasksForOptions(
        tasks.value,
        { ...options, secondaryView: status },
        hideCompletedMapObjectives.value
      );
      counts[status] = applySearchToTaskList(statusTasks, normalizedSearch.value).length;
    }
    return counts;
  });
  return {
    filteredTasks,
    mapCompleteTasksCountOnMap,
    searchStatusCounts,
    showMapTaskVisibilityNotice,
  };
}
