import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
import type { TaskActionPayload } from '@/composables/useTaskActions';
import type { TaskObjective } from '@/types/tarkov';
interface TaskNotificationReturn {
  taskStatusUpdated: Ref<boolean>;
  taskStatus: Ref<string>;
  showUndoButton: Ref<boolean>;
  onTaskAction: (event: TaskActionPayload) => void;
  undoLastAction: () => void;
  closeNotification: () => void;
  cleanup: () => void;
}
export function useTaskNotification(): TaskNotificationReturn {
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const tasks = computed(() => metadataStore.tasks);
  const taskStatusUpdated = ref(false);
  const taskStatus = ref('');
  const undoData = ref<{
    taskId: string;
    taskName: string;
    action: TaskActionPayload['action'];
    wasManualFail?: boolean;
  } | null>(null);
  const showUndoButton = ref(false);
  const notificationTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const updateTaskStatus = (statusKey: string, taskName: string, showUndo = false) => {
    if (notificationTimeout.value !== null) {
      clearTimeout(notificationTimeout.value);
      notificationTimeout.value = null;
    }
    taskStatus.value = t(statusKey, { name: taskName });
    taskStatusUpdated.value = true;
    showUndoButton.value = showUndo;
    notificationTimeout.value = setTimeout(() => {
      taskStatusUpdated.value = false;
      notificationTimeout.value = null;
    }, 5000);
  };
  const closeNotification = () => {
    if (notificationTimeout.value !== null) {
      clearTimeout(notificationTimeout.value);
      notificationTimeout.value = null;
    }
    taskStatusUpdated.value = false;
  };
  const onTaskAction = (event: TaskActionPayload) => {
    undoData.value = {
      taskId: event.taskId,
      taskName: event.taskName,
      action: event.action,
      wasManualFail: event.wasManualFail,
    };
    if (event.undoKey) {
      updateTaskStatus(event.undoKey, event.taskName, false);
    } else if (event.statusKey) {
      updateTaskStatus(event.statusKey, event.taskName, true);
    }
  };
  const handleTaskObjectives = (
    objectives: TaskObjective[],
    action: 'setTaskObjectiveComplete' | 'setTaskObjectiveUncomplete'
  ) => {
    objectives.forEach((o) => {
      if (action === 'setTaskObjectiveComplete') {
        tarkovStore.setTaskObjectiveComplete(o.id);
        if (o.count !== undefined && o.count > 0) {
          tarkovStore.setObjectiveCount(o.id, o.count);
        }
      } else {
        tarkovStore.setTaskObjectiveUncomplete(o.id);
      }
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
  const handleAlternatives = (
    alternatives: string[] | undefined,
    taskAction: 'setTaskComplete' | 'setTaskUncompleted' | 'setTaskFailed',
    objectiveAction?: 'setTaskObjectiveComplete' | 'setTaskObjectiveUncomplete'
  ) => {
    if (!Array.isArray(alternatives)) return;
    alternatives.forEach((a: string) => {
      const preserveCompletedAlternative =
        taskAction === 'setTaskFailed' && tarkovStore.isTaskComplete(a);
      if (preserveCompletedAlternative) return;
      if (taskAction === 'setTaskComplete') {
        tarkovStore.setTaskComplete(a);
      } else if (taskAction === 'setTaskUncompleted') {
        tarkovStore.setTaskUncompleted(a);
      } else if (taskAction === 'setTaskFailed') {
        tarkovStore.setTaskFailed(a);
      }
      const alternativeTask = tasks.value.find((task) => task.id === a);
      if (alternativeTask?.objectives) {
        if (taskAction === 'setTaskFailed') {
          clearTaskObjectives(alternativeTask.objectives);
        } else {
          if (objectiveAction) {
            handleTaskObjectives(alternativeTask.objectives, objectiveAction);
          }
        }
      }
    });
  };
  const undoLastAction = () => {
    if (!undoData.value) return;
    const { taskId, taskName, action, wasManualFail } = undoData.value;
    const taskToUndo = tasks.value.find((task) => task.id === taskId);
    if (action === 'complete') {
      tarkovStore.setTaskUncompleted(taskId);
      if (taskToUndo?.objectives) {
        handleTaskObjectives(taskToUndo.objectives, 'setTaskObjectiveUncomplete');
        handleAlternatives(
          taskToUndo.alternatives,
          'setTaskUncompleted',
          'setTaskObjectiveUncomplete'
        );
      }
      updateTaskStatus('page.tasks.questcard.undo_complete', taskName);
    } else if (action === 'uncomplete') {
      tarkovStore.setTaskComplete(taskId);
      if (taskToUndo?.objectives) {
        handleTaskObjectives(taskToUndo.objectives, 'setTaskObjectiveComplete');
        handleAlternatives(taskToUndo.alternatives, 'setTaskFailed');
        const minLevel = taskToUndo.minPlayerLevel;
        if (minLevel !== undefined) {
          const currentLevel = tarkovStore.playerLevel();
          const isValidLevel = typeof currentLevel === 'number' && Number.isFinite(currentLevel);
          if (!isValidLevel || currentLevel < minLevel) {
            tarkovStore.setLevel(minLevel);
          }
        }
      }
      updateTaskStatus('page.tasks.questcard.undo_uncomplete', taskName);
    } else if (action === 'reset_failed') {
      if (wasManualFail) {
        tarkovStore.setTaskFailed(taskId, { manual: true });
      } else {
        tarkovStore.setTaskFailed(taskId);
      }
      if (taskToUndo?.objectives) {
        clearTaskObjectives(taskToUndo.objectives);
      }
      updateTaskStatus('page.tasks.questcard.undo_reset_failed', taskName);
    } else if (action === 'fail') {
      tarkovStore.setTaskUncompleted(taskId);
      if (taskToUndo?.objectives) {
        handleTaskObjectives(taskToUndo.objectives, 'setTaskObjectiveUncomplete');
      }
      updateTaskStatus('page.tasks.questcard.undo_failed', taskName);
    } else {
      logger.error('[TaskNotification] Unknown undo action received.', {
        action,
        taskId,
        taskName,
      });
      updateTaskStatus('page.tasks.questcard.undo_unknown', taskName);
    }
    showUndoButton.value = false;
    undoData.value = null;
  };
  const cleanup = () => {
    if (notificationTimeout.value !== null) {
      clearTimeout(notificationTimeout.value);
      notificationTimeout.value = null;
    }
  };
  onScopeDispose(cleanup);
  return {
    taskStatusUpdated,
    taskStatus,
    showUndoButton,
    onTaskAction,
    undoLastAction,
    closeNotification,
    cleanup,
  };
}
