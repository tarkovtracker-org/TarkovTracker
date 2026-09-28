import {
  isTaskShownOnMap,
  type MapTaskVisibilityState,
} from '@/features/maps/utils/mapTaskVisibility';
import { usePreferencesStore } from '@/stores/usePreferences';
import type { ComputedRef } from '#imports';
interface UseMapTaskRevealOptions {
  mapTaskIds: ComputedRef<string[]>;
  mapTaskVisibilityState: ComputedRef<MapTaskVisibilityState>;
}
/**
 * Reveals a task the user hid or left out of focus so a jump-to-objective popup can open (#918).
 * The reveal waits until the task draws on the displayed map, because a jump may switch maps and
 * only the destination map's focus state decides whether the task is visible there.
 */
export function useMapTaskReveal({ mapTaskIds, mapTaskVisibilityState }: UseMapTaskRevealOptions) {
  const preferencesStore = usePreferencesStore();
  const pendingTaskId = ref<string | null>(null);
  const revealOnCurrentMap = (taskId: string) => {
    const state = mapTaskVisibilityState.value;
    if (isTaskShownOnMap(taskId, state)) return;
    if (state.activeFocusTaskIds.size > 0) {
      preferencesStore.toggleMapFocusTask(taskId);
      return;
    }
    preferencesStore.toggleMapHiddenTask(taskId);
  };
  watch([pendingTaskId, mapTaskIds], ([taskId, taskIds]) => {
    if (!taskId || !taskIds.includes(taskId)) return;
    pendingTaskId.value = null;
    revealOnCurrentMap(taskId);
  });
  const requestTaskReveal = (taskId: string | null) => {
    pendingTaskId.value = taskId;
  };
  return { requestTaskReveal };
}
