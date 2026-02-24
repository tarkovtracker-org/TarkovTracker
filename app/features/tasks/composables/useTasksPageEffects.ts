import { logger } from '@/utils/logger';
import type { Task } from '@/types/tarkov';
type RefLike<T> = { value: T };
type ComputedRefLike<T> = Readonly<{ value: T }>;
type TasksPageEffectsInputs = {
  batchSize: number;
  checkAndLoadMore: () => Promise<void> | void;
  filteredTasks: ComputedRefLike<Task[]>;
  handleTaskQueryParam: () => void;
  isMapPanelExpanded: RefLike<boolean>;
  metadataStore: {
    fetchMapSpawnsData: () => Promise<unknown>;
  };
  route: {
    query: Record<string, unknown>;
  };
  selectedMapData: ComputedRefLike<unknown>;
  showMapDisplay: ComputedRefLike<boolean>;
  stopResize: () => void;
  tasksLoading: RefLike<boolean>;
  visibleTaskCount: RefLike<number>;
};
export function useTasksPageEffects({
  batchSize,
  checkAndLoadMore,
  filteredTasks,
  handleTaskQueryParam,
  isMapPanelExpanded,
  metadataStore,
  route,
  selectedMapData,
  showMapDisplay,
  stopResize,
  tasksLoading,
  visibleTaskCount,
}: TasksPageEffectsInputs) {
  watch(
    [showMapDisplay, selectedMapData],
    ([showMap, selectedMap]) => {
      if (!showMap || !selectedMap) return;
      metadataStore.fetchMapSpawnsData().catch((error) => {
        logger.error('[Tasks] Failed to load map spawn data:', error);
      });
    },
    { immediate: true }
  );
  watch(showMapDisplay, (isVisible) => {
    if (!isVisible) {
      isMapPanelExpanded.value = true;
      stopResize();
    }
  });
  watch(
    () => filteredTasks.value,
    (newTasks, oldTasks) => {
      const listChanged =
        !oldTasks ||
        newTasks.length !== oldTasks.length ||
        newTasks.some((task, index) => task.id !== oldTasks[index]?.id);
      if (listChanged) {
        visibleTaskCount.value = Math.min(batchSize, newTasks.length);
      }
      void nextTick(() => {
        void checkAndLoadMore();
      });
    }
  );
  watch(
    [() => route.query.task, () => route.query.highlightObjective, tasksLoading],
    ([taskQueryParam, , loading]) => {
      if (taskQueryParam && !loading) {
        handleTaskQueryParam();
      }
    },
    { immediate: true }
  );
}
