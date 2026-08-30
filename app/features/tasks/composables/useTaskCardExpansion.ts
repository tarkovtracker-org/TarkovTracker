type ComputedRefLike<T> = Readonly<{ value: T }>;
type TaskCardExpansionInputs = {
  taskId: () => string;
  isCompact: ComputedRefLike<boolean>;
  onMapView: ComputedRefLike<boolean>;
  collapseByDefault: () => boolean;
  hideTaskRewards: () => boolean;
  routeTaskId: () => string | undefined;
};
export function useTaskCardExpansion({
  taskId,
  isCompact,
  onMapView,
  collapseByDefault,
  hideTaskRewards,
  routeTaskId,
}: TaskCardExpansionInputs) {
  const taskToggle = ref(true);
  const isDeepLinkedTask = computed(() => routeTaskId() === taskId());
  const isCollapsible = computed(() => onMapView.value || isCompact.value);
  const rewardsHidden = computed(() => isCompact.value && hideTaskRewards());
  watch(
    () => isCompact.value && !onMapView.value && collapseByDefault(),
    (collapse) => {
      taskToggle.value = !(collapse && !isDeepLinkedTask.value);
    },
    { immediate: true }
  );
  watch(isDeepLinkedTask, (linked) => {
    if (linked) taskToggle.value = true;
  });
  const taskExpanded = computed(() => {
    return !isCollapsible.value || taskToggle.value;
  });
  const toggleTaskVisibility = () => {
    if (!isCollapsible.value) return;
    taskToggle.value = !taskToggle.value;
  };
  return { isCollapsible, rewardsHidden, taskExpanded, toggleTaskVisibility };
}
