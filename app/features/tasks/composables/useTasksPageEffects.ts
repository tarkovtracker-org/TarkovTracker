import { logger } from '@/utils/logger';
import type { Task } from '@/types/tarkov';
type RefLike<T> = { value: T };
type ComputedRefLike<T> = Readonly<{ value: T }>;
type TasksPageEffectsInputs = {
  batchSize: number;
  checkAndLoadMore: () => Promise<void> | void;
  filteredTasks: ComputedRefLike<Task[]>;
  handleTaskQueryParam: () => Promise<void> | void;
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
  metadataStore,
  route,
  selectedMapData,
  showMapDisplay,
  stopResize,
  tasksLoading,
  visibleTaskCount,
}: TasksPageEffectsInputs) {
  const filteredTaskIdsKey = computed(() => filteredTasks.value.map((task) => task.id).join(','));
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
      if (!listChanged) return;
      visibleTaskCount.value = Math.min(batchSize, newTasks.length);
      void nextTick(() => {
        void checkAndLoadMore();
      });
    }
  );
  watch(
    [
      () => route.query.task,
      () => route.query.highlightObjective,
      tasksLoading,
      filteredTaskIdsKey,
    ],
    ([taskQueryParam, , loading]) => {
      if (taskQueryParam && !loading) {
        void handleTaskQueryParam();
      }
    },
    { immediate: true, flush: 'post' }
  );
}
