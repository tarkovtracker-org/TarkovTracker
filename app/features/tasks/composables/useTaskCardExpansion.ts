import type { ComputedRef } from '#imports';
type ComputedRefLike<T> = Readonly<{ value: T }>;
type TaskCardExpansionInputs = {
  taskId: () => string;
  onMapView: ComputedRefLike<boolean>;
  collapseByDefault: () => boolean;
  hideTaskRewards: () => boolean;
  routeTaskId: () => string | undefined;
};
export type UseTaskCardExpansionReturn = {
  rewardsHidden: ComputedRef<boolean>;
  taskExpanded: ComputedRef<boolean>;
  toggleTaskVisibility: () => void;
};
export function useTaskCardExpansion({
  taskId,
  onMapView,
  collapseByDefault,
  hideTaskRewards,
  routeTaskId,
}: TaskCardExpansionInputs): UseTaskCardExpansionReturn {
  const taskToggle = ref(true);
  const isDeepLinkedTask = computed(() => routeTaskId() === taskId());
  const rewardsHidden = computed(() => hideTaskRewards());
  watch(
    () => !onMapView.value && collapseByDefault(),
    (collapse) => {
      taskToggle.value = !(collapse && !isDeepLinkedTask.value);
    },
    { immediate: true }
  );
  watch(isDeepLinkedTask, (linked) => {
    if (linked) taskToggle.value = true;
  });
  const taskExpanded = computed(() => {
    return taskToggle.value;
  });
  const toggleTaskVisibility = () => {
    taskToggle.value = !taskToggle.value;
  };
  return { rewardsHidden, taskExpanded, toggleTaskVisibility };
}
