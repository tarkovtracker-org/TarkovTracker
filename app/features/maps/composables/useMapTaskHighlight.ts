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
 *
 * The legend and the map report separately, so leaving a marker never clears a legend entry that
 * still has hover or focus, and the other way round. A marker hover wins over the legend, which
 * wins over the lock.
 */
export function useMapTaskHighlight({ shownTaskIds, enabled }: MapTaskHighlightOptions) {
  const markerTaskId = ref<string | null>(null);
  const legendTaskId = ref<string | null>(null);
  const lockedTaskId = ref<string | null>(null);
  const isAvailable = (taskId: string | null): taskId is string =>
    taskId !== null && enabled.value && shownTaskIds.value.has(taskId);
  const highlightedTaskId = computed<string | null>(
    () => [markerTaskId.value, legendTaskId.value, lockedTaskId.value].find(isAvailable) ?? null
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
  /** The quest of the marker under the pointer, from the map's `objective-hover`. */
  const setMarkerTask = (taskId: string | null) => {
    markerTaskId.value = taskId;
  };
  /** The legend entry under the pointer or with keyboard focus, from the legend's `highlight`. */
  const setLegendTask = (taskId: string | null) => {
    legendTaskId.value = taskId;
  };
  const toggleLockedTask = (taskId: string) => {
    lockedTaskId.value = activeLockedTaskId.value === taskId ? null : taskId;
  };
  return {
    highlightedTaskId,
    lockedTaskId: activeLockedTaskId,
    setMarkerTask,
    setLegendTask,
    toggleLockedTask,
  };
}
