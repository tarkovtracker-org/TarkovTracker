import { useActionHistoryStore } from '@/stores/useActionHistoryStore';
import { useActivityLogStore } from '@/stores/useActivityLogStore';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { provesStartGates, releaseRecordedStoryObjectives } from '@/utils/taskProgress';
import type { TaskActionPayload } from '@/composables/useTaskActions';
import type { Task, TaskObjective } from '@/types/tarkov';
interface TaskNotificationReturn {
  taskStatusUpdated: Ref<boolean>;
  taskStatus: Ref<string>;
  showUndoButton: Ref<boolean>;
  onTaskAction: (event: TaskActionPayload) => void;
  undoLastAction: () => Promise<void>;
  closeNotification: () => void;
  cleanup: () => void;
}
export function useTaskNotification(): TaskNotificationReturn {
  const { t } = useI18n({ useScope: 'global' });
  const actionHistoryStore = useActionHistoryStore();
  const activityLogStore = useActivityLogStore();
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const tasks = computed(() => metadataStore.tasks);
  const taskStatusUpdated = ref(false);
  const taskStatus = ref('');
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
  const entryTitleKeys: Record<TaskActionPayload['action'], string> = {
    active: 'activity_log.entry.active',
    complete: 'activity_log.entry.completed',
    uncomplete: 'activity_log.entry.uncompleted',
    fail: 'activity_log.entry.failed',
    reset_failed: 'activity_log.entry.reset_failed',
    available: 'activity_log.entry.available',
  };
  const handleTaskObjectives = (
    objectives: TaskObjective[],
    action: 'setTaskObjectiveComplete' | 'setTaskObjectiveUncomplete'
  ) => {
    objectives.forEach((o) => {
      if (action === 'setTaskObjectiveUncomplete') {
        tarkovStore.setTaskObjectiveUncomplete(o.id);
        return;
      }
      tarkovStore.setTaskObjectiveComplete(o.id);
      if (o.count !== undefined && o.count > 0) tarkovStore.setObjectiveCount(o.id, o.count);
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
  type AlternativeTaskAction = 'setTaskComplete' | 'setTaskUncompleted' | 'setTaskFailed';
  type ObjectiveAction = 'setTaskObjectiveComplete' | 'setTaskObjectiveUncomplete';
  const updateAlternativeObjectives = (
    objectives: TaskObjective[],
    taskAction: AlternativeTaskAction,
    objectiveAction?: ObjectiveAction
  ) => {
    if (taskAction === 'setTaskFailed') clearTaskObjectives(objectives);
    else if (objectiveAction) handleTaskObjectives(objectives, objectiveAction);
  };
  const handleAlternatives = (
    alternatives: string[] | undefined,
    taskAction: AlternativeTaskAction,
    objectiveAction?: ObjectiveAction
  ) => {
    if (!Array.isArray(alternatives)) return;
    alternatives.forEach((a: string) => {
      // Failing alternatives must never overwrite one the player already completed.
      if (taskAction === 'setTaskFailed' && tarkovStore.isTaskComplete(a)) return;
      tarkovStore[taskAction](a);
      const objectives = tasks.value.find((task) => task.id === a)?.objectives;
      if (objectives) updateAlternativeObjectives(objectives, taskAction, objectiveAction);
    });
  };
  const needsLevel = (currentLevel: unknown, minLevel: number) =>
    typeof currentLevel !== 'number' || !Number.isFinite(currentLevel) || currentLevel < minLevel;
  const raiseToMinLevel = (minLevel: number | undefined) => {
    if (minLevel !== undefined && needsLevel(tarkovStore.playerLevel(), minLevel)) {
      tarkovStore.setLevel(minLevel);
    }
  };
  type UndoContext = {
    event: TaskActionPayload;
    task: Task | undefined;
    wasActive: boolean;
    releaseStoryObjectives: () => void;
  };
  const restoreTaskAcceptance = ({ event, wasActive }: UndoContext) => {
    if (wasActive) tarkovStore.setTaskActive(event.taskId);
    else tarkovStore.setTaskUncompleted(event.taskId);
  };
  const logUndo = (
    { event }: UndoContext,
    action: TaskActionPayload['action'],
    titleKey: string,
    statusKey: string
  ) => {
    activityLogStore.addManualEntry({
      id: `manual-task-undo-${event.taskId}-${Date.now()}`,
      type: 'task',
      action,
      title: t(titleKey, { name: event.taskName }),
    });
    updateTaskStatus(statusKey, event.taskName);
  };
  const uncompleteObjectives = (task: Task | undefined) => {
    if (task?.objectives) handleTaskObjectives(task.objectives, 'setTaskObjectiveUncomplete');
  };
  // 'available' mutates an unbounded set of prerequisite tasks and is not safely reversible.
  const undoHandlers: Partial<Record<TaskActionPayload['action'], (context: UndoContext) => void>> =
    {
      active: (context) => {
        tarkovStore.setTaskUncompleted(context.event.taskId);
        context.releaseStoryObjectives();
        logUndo(
          context,
          'uncomplete',
          'activity_log.entry.undo_active',
          'page.tasks.questcard.undo_active'
        );
      },
      complete: (context) => {
        restoreTaskAcceptance(context);
        context.releaseStoryObjectives();
        uncompleteObjectives(context.task);
        handleAlternatives(
          context.task?.alternatives,
          'setTaskUncompleted',
          'setTaskObjectiveUncomplete'
        );
        logUndo(
          context,
          'uncomplete',
          'activity_log.entry.undo_completed',
          'page.tasks.questcard.undo_complete'
        );
      },
      uncomplete: (context) => {
        tarkovStore.setTaskComplete(context.event.taskId);
        if (context.task?.objectives) {
          handleTaskObjectives(context.task.objectives, 'setTaskObjectiveComplete');
        }
        handleAlternatives(context.task?.alternatives, 'setTaskFailed');
        raiseToMinLevel(context.task?.minPlayerLevel);
        logUndo(
          context,
          'complete',
          'activity_log.entry.undo_uncompleted',
          'page.tasks.questcard.undo_uncomplete'
        );
      },
      reset_failed: (context) => {
        if (context.event.wasManualFail) {
          tarkovStore.setTaskFailed(context.event.taskId, { manual: true });
        } else {
          tarkovStore.setTaskFailed(context.event.taskId);
        }
        if (context.task?.objectives) clearTaskObjectives(context.task.objectives);
        logUndo(
          context,
          'fail',
          'activity_log.entry.undo_reset_failed',
          'page.tasks.questcard.undo_reset_failed'
        );
      },
      fail: (context) => {
        restoreTaskAcceptance(context);
        context.releaseStoryObjectives();
        uncompleteObjectives(context.task);
        logUndo(
          context,
          'uncomplete',
          'activity_log.entry.undo_failed',
          'page.tasks.questcard.undo_failed'
        );
      },
    };
  const taskProvesStartGates = (task: Task) => {
    const data = tarkovStore.getCurrentProgressData();
    return provesStartGates(
      task,
      data?.taskCompletions?.[task.id],
      data?.taskAvailability?.[task.id]
    );
  };
  /** Register a reversible action in the global undo store for actions we can revert. */
  const registerUndo = (event: TaskActionPayload, description: string, wasActive: boolean) => {
    const handler = undoHandlers[event.action];
    if (!handler) return;
    const context: UndoContext = {
      event,
      task: tasks.value.find((task) => task.id === event.taskId),
      wasActive,
      releaseStoryObjectives: () =>
        releaseRecordedStoryObjectives({
          store: tarkovStore,
          recorded: event.recordedStoryObjectives ?? [],
          tasks: tasks.value ?? [],
          provesStartGates: taskProvesStartGates,
        }),
    };
    actionHistoryStore.pushAction({
      id: `task-${event.taskId}-${Date.now()}`,
      description,
      undo: () => {
        handler(context);
        showUndoButton.value = false;
      },
    });
  };
  const showActionStatus = (event: TaskActionPayload) => {
    if (event.undoKey) {
      updateTaskStatus(event.undoKey, event.taskName, false);
    } else if (event.statusKey) {
      // Only offer the inline Undo button for actions we can actually reverse.
      updateTaskStatus(event.statusKey, event.taskName, event.action !== 'available');
    }
  };
  const onTaskAction = (event: TaskActionPayload) => {
    const title = t(entryTitleKeys[event.action], { name: event.taskName });
    activityLogStore.addManualEntry({
      id: `manual-task-${event.taskId}-${Date.now()}`,
      type: 'task',
      action: event.action,
      title,
    });
    registerUndo(event, title, tarkovStore.isTaskActive(event.taskId));
    showActionStatus(event);
  };
  const undoLastAction = () => actionHistoryStore.undoLastAction();
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
