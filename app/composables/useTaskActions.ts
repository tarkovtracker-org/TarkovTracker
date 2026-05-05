import { useProductAnalytics } from '@/composables/useProductAnalytics';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useTarkovStore } from '@/stores/useTarkov';
import {
  applyTaskAvailabilityRequirements,
  completeTaskForProgress,
  failTaskForProgress,
} from '@/utils/taskProgress';
import type { Task, TaskObjective } from '@/types/tarkov';
export type TaskActionPayload = {
  taskId: string;
  taskName: string;
  action: 'available' | 'complete' | 'uncomplete' | 'reset_failed' | 'fail';
  analyticsParams?: Record<string, boolean | number | string>;
  undoKey?: string;
  statusKey?: string;
  wasManualFail?: boolean;
};
export type UseTaskActionsReturn = {
  markTaskComplete: (isUndo?: boolean) => void;
  markTaskUncomplete: (isUndo?: boolean) => void;
  markTaskAvailable: () => void;
  markTaskFailed: (isUndo?: boolean) => void;
};
export function useTaskActions(
  task: () => Task,
  onAction?: (payload: TaskActionPayload) => void
): UseTaskActionsReturn {
  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const { trackTaskAction } = useProductAnalytics();
  const tasks = computed(() => metadataStore.tasks);
  const unpinTaskIfPinned = (taskId: string) => {
    if (preferencesStore.getPinnedTaskIds.includes(taskId)) {
      preferencesStore.togglePinnedTask(taskId);
    }
  };
  // Create O(1) lookup map for tasks (more efficient than O(n) find operations)
  const tasksMap = computed(() => {
    const map = new Map<string, Task>();
    tasks.value.forEach((taskItem) => {
      map.set(taskItem.id, taskItem);
    });
    return map;
  });
  const handleTaskObjectives = (
    objectives: TaskObjective[],
    action: 'setTaskObjectiveComplete' | 'setTaskObjectiveUncomplete'
  ) => {
    objectives.forEach((objective) => {
      if (!objective?.id) return;
      if (action === 'setTaskObjectiveComplete') {
        tarkovStore.setTaskObjectiveComplete(objective.id);
        if (objective.count !== undefined && objective.count > 0) {
          tarkovStore.setObjectiveCount(objective.id, objective.count);
        }
        return;
      }
      tarkovStore.setTaskObjectiveUncomplete(objective.id);
    });
  };
  const clearTaskObjectives = (objectives: TaskObjective[]) => {
    objectives.forEach((objective) => {
      if (!objective?.id) return;
      tarkovStore.setTaskObjectiveUncomplete(objective.id);
      const currentCount = tarkovStore.getObjectiveCount(objective.id);
      if ((objective.count ?? 0) > 0 || currentCount > 0) {
        tarkovStore.setObjectiveCount(objective.id, 0);
      }
    });
  };
  const completeTaskForAvailability = (taskId: string) => {
    completeTaskForProgress({
      store: tarkovStore,
      taskId,
      tasksMap: tasksMap.value,
    });
  };
  const failTaskForAvailability = (taskId: string) => {
    failTaskForProgress({
      store: tarkovStore,
      taskId,
      tasksMap: tasksMap.value,
    });
  };
  const handleAlternatives = (
    alternatives: string[] | undefined,
    taskAction: 'setTaskFailed' | 'setTaskUncompleted',
    objectiveAction: 'setTaskObjectiveComplete' | 'setTaskObjectiveUncomplete'
  ) => {
    if (!Array.isArray(alternatives)) return;
    alternatives.forEach((alternativeTaskId) => {
      const preserveCompletedAlternative =
        taskAction === 'setTaskFailed' && tarkovStore.isTaskComplete(alternativeTaskId);
      if (preserveCompletedAlternative) return;
      if (taskAction === 'setTaskFailed') {
        tarkovStore.setTaskFailed(alternativeTaskId);
      } else {
        tarkovStore.setTaskUncompleted(alternativeTaskId);
      }
      const alternativeTask = tasksMap.value.get(alternativeTaskId);
      if (alternativeTask?.objectives) {
        if (taskAction === 'setTaskFailed') {
          clearTaskObjectives(alternativeTask.objectives);
        } else {
          handleTaskObjectives(alternativeTask.objectives, objectiveAction);
        }
      }
    });
  };
  const ensureMinLevel = () => {
    const minLevel = task().minPlayerLevel ?? 0;
    // Note: playerLevel is a getter that returns a function, so it must be called with ()
    if (tarkovStore.playerLevel() < minLevel) {
      tarkovStore.setLevel(minLevel);
    }
  };
  const isTaskManuallyFailed = (taskId: string) => {
    const completion = tarkovStore.getCurrentProgressData().taskCompletions?.[taskId];
    if (!completion || typeof completion !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(completion, 'manual')) return false;
    return (completion as { manual?: boolean }).manual === true;
  };
  const getTaskAnalyticsParams = (
    currentTask: Task,
    params: Record<string, boolean | number | string> = {}
  ) => ({
    game_mode: tarkovStore.getCurrentGameMode(),
    task_has_required_keys: currentTask.requiredKeys?.length ? 'yes' : 'no',
    task_id: currentTask.id,
    task_is_kappa: currentTask.kappaRequired ? 'yes' : 'no',
    task_is_lightkeeper: currentTask.lightkeeperRequired ? 'yes' : 'no',
    task_name: currentTask.name || currentTask.id,
    task_trader: currentTask.trader?.normalizedName || currentTask.trader?.name || 'unknown',
    ...params,
  });
  const emitAction = (payload: TaskActionPayload) => {
    trackTaskAction(payload);
    onAction?.(payload);
  };
  const markTaskComplete = (isUndo = false) => {
    const currentTask = task();
    const taskName = currentTask.name ?? t('page.tasks.questcard.task');
    if (!isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action: 'complete',
        analyticsParams: getTaskAnalyticsParams(currentTask, {
          objective_count: currentTask.objectives?.length ?? 0,
        }),
        statusKey: 'page.tasks.questcard.status_complete',
      });
    }
    tarkovStore.setTaskComplete(currentTask.id);
    unpinTaskIfPinned(currentTask.id);
    if (currentTask.objectives) {
      handleTaskObjectives(currentTask.objectives, 'setTaskObjectiveComplete');
    }
    handleAlternatives(currentTask.alternatives, 'setTaskFailed', 'setTaskObjectiveComplete');
    ensureMinLevel();
    if (isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action: 'complete',
        undoKey: 'page.tasks.questcard.undo_complete',
      });
    }
  };
  const markTaskUncomplete = (isUndo = false) => {
    const currentTask = task();
    const taskName = currentTask.name ?? t('page.tasks.questcard.task');
    const wasFailed = tarkovStore.isTaskFailed(currentTask.id);
    const wasManualFail = wasFailed && isTaskManuallyFailed(currentTask.id);
    if (!isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action: wasFailed ? 'reset_failed' : 'uncomplete',
        analyticsParams: getTaskAnalyticsParams(currentTask, {
          was_manual_fail: wasManualFail ? 'yes' : 'no',
        }),
        wasManualFail,
        statusKey: wasFailed
          ? 'page.tasks.questcard.status_reset_failed'
          : 'page.tasks.questcard.status_uncomplete',
      });
    }
    tarkovStore.setTaskUncompleted(currentTask.id);
    if (currentTask.objectives) {
      handleTaskObjectives(currentTask.objectives, 'setTaskObjectiveUncomplete');
    }
    handleAlternatives(
      currentTask.alternatives,
      'setTaskUncompleted',
      'setTaskObjectiveUncomplete'
    );
    if (isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action: wasFailed ? 'reset_failed' : 'uncomplete',
        wasManualFail,
        undoKey: wasFailed
          ? 'page.tasks.questcard.undo_reset_failed'
          : 'page.tasks.questcard.undo_uncomplete',
      });
    }
  };
  const markTaskAvailable = () => {
    const currentTask = task();
    const taskName = currentTask.name ?? t('page.tasks.questcard.task');
    applyTaskAvailabilityRequirements({
      onCompleteRequirement: completeTaskForAvailability,
      onFailRequirement: failTaskForAvailability,
      task: currentTask,
    });
    ensureMinLevel();
    emitAction({
      taskId: currentTask.id,
      taskName,
      action: 'available',
      analyticsParams: getTaskAnalyticsParams(currentTask),
      statusKey: 'page.tasks.questcard.status_available',
    });
  };
  const markTaskFailed = (isUndo = false) => {
    const currentTask = task();
    const taskName = currentTask.name ?? t('page.tasks.questcard.task');
    if (!isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action: 'fail',
        analyticsParams: getTaskAnalyticsParams(currentTask, {
          was_manual_fail: 'yes',
        }),
        statusKey: 'page.tasks.questcard.status_failed',
      });
    }
    tarkovStore.setTaskFailed(currentTask.id, { manual: true });
    unpinTaskIfPinned(currentTask.id);
    if (currentTask.objectives) {
      clearTaskObjectives(currentTask.objectives);
    }
    if (isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action: 'fail',
        undoKey: 'page.tasks.questcard.undo_failed',
      });
    }
  };
  return {
    markTaskComplete,
    markTaskUncomplete,
    markTaskAvailable,
    markTaskFailed,
  };
}
