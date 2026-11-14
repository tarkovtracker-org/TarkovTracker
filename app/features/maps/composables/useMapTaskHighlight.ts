import type { ComputedRef } from '#imports';
interface MapTaskHighlightOptions {
  /** Quests currently drawn on the map; a hidden or departed quest is never highlighted. */
  shownTaskIds: ComputedRef<ReadonlySet<string>>;
  /** Highlighting follows the quest legend, which only exists while chips are colored by quest. */
  enabled: ComputedRef<boolean>;
}
/**
 * Two-way quest highlight between the quest legend and the map (#920). Hovering or focusing a
 * legend entry, or hovering one of the quest's markers, highlights that quest; clicking a legend
 * entry keeps it highlighted until it is clicked again, which also covers touch screens. A lock
 * ends when its quest is hidden or leaves the map, or quest coloring is turned off; it does not
 * come back by itself when the quest returns.
 */
export function useMapTaskHighlight({ shownTaskIds, enabled }: MapTaskHighlightOptions) {
  const hoveredTaskId = ref<string | null>(null);
  const lockedTaskId = ref<string | null>(null);
  const isAvailable = (taskId: string | null): taskId is string =>
    taskId !== null && enabled.value && shownTaskIds.value.has(taskId);
  const highlightedTaskId = computed<string | null>(
    () => [hoveredTaskId.value, lockedTaskId.value].find(isAvailable) ?? null
  );
  const activeLockedTaskId = computed<string | null>(() =>
    isAvailable(lockedTaskId.value) ? lockedTaskId.value : null
  );
  watch(
    activeLockedTaskId,
    (active) => {
      if (active === null) lockedTaskId.value = null;
    },
    { flush: 'sync' }
  );
  const setHoveredTask = (taskId: string | null) => {
    hoveredTaskId.value = taskId;
  };
  const toggleLockedTask = (taskId: string) => {
    lockedTaskId.value = activeLockedTaskId.value === taskId ? null : taskId;
  };
  return {
    highlightedTaskId,
    lockedTaskId: activeLockedTaskId,
    setHoveredTask,
    toggleLockedTask,
  };
}
