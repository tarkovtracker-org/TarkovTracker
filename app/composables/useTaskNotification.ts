import { useActionHistoryStore } from '@/stores/useActionHistoryStore';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import {
  hasUnconfirmableStatusClock,
  isAvailabilityConfirmed,
  taskStatusTimestamp,
} from '@/utils/taskAvailabilityConfirmation';
import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
import { provesStartGates, releaseRecordedStoryObjectives } from '@/utils/taskProgress';
import { isTaskActive } from '@/utils/taskStatus';
import type { TaskActionPayload } from '@/composables/useTaskActions';
import type { TaskAvailabilityConfirmation } from '@/types/progress';
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
  watch(
    () => actionHistoryStore.undoStack,
    () => {
      showUndoButton.value = false;
      closeNotification();
    },
    { flush: 'sync' }
  );
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
  const alternativeObjectives = (taskId: string) =>
    tasks.value.find((task) => task.id === taskId)?.objectives ?? [];
  const failAlternatives = (alternatives: string[] | undefined) => {
    if (!Array.isArray(alternatives)) return;
    for (const taskId of alternatives) {
      if (tarkovStore.isTaskComplete(taskId)) continue;
      tarkovStore.setTaskFailed(taskId);
      clearTaskObjectives(alternativeObjectives(taskId));
    }
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
    previousAcceptance: boolean | undefined;
    previousConfirmation: TaskAvailabilityConfirmation | undefined;
    alternativeAcceptances: ReadonlyMap<string, boolean | undefined>;
    releaseStoryObjectives: () => void;
  };
  const restoreTaskAcceptance = (taskId: string, active: boolean | undefined) => {
    if (active === undefined) tarkovStore.setTaskAcceptanceUnknown(taskId);
    else if (active) tarkovStore.setTaskActive(taskId);
    else tarkovStore.setTaskUncompleted(taskId, { restoreAcceptance: true });
  };
  const restoreSelectedAcceptance = ({ event, previousAcceptance }: UndoContext) =>
    restoreTaskAcceptance(event.taskId, previousAcceptance);
  const previousAcceptance = (taskId: string): boolean | undefined => {
    const active = tarkovStore.getCurrentProgressData()?.taskCompletions?.[taskId]?.active;
    return typeof active === 'boolean' ? active : undefined;
  };
  const captureAvailability = (task: Task | undefined) => {
    if (!task) return;
    const progress = tarkovStore.getCurrentProgressData();
    const confirmation = progress?.taskAvailability?.[task.id];
    const completions = progress?.taskCompletions;
    if (
      confirmation &&
      isAvailabilityConfirmed(
        confirmation,
        completions?.[task.id],
        otherRequirementsSignature(task, completions)
      )
    ) {
      return { ...confirmation };
    }
  };
  const currentStatusTimestamp = (taskId: string) =>
    taskStatusTimestamp(tarkovStore.getCurrentProgressData()?.taskCompletions?.[taskId]);
  const confirmationStillMatches = (task: Task, previous: TaskAvailabilityConfirmation) => {
    const progress = tarkovStore.getCurrentProgressData();
    const current = progress?.taskAvailability?.[task.id];
    return (
      current?.timestamp === previous.timestamp &&
      current.requirements === previous.requirements &&
      otherRequirementsSignature(task, progress?.taskCompletions) === previous.requirements
    );
  };
  const restoreAvailability = ({ task, previousConfirmation }: UndoContext) => {
    if (task && previousConfirmation && confirmationStillMatches(task, previousConfirmation)) {
      tarkovStore.confirmTaskAvailability(task.id, previousConfirmation.requirements);
    }
  };
  const captureAlternativeAcceptances = (alternatives: string[] | undefined) =>
    new Map(
      (Array.isArray(alternatives) ? alternatives : [])
        .filter((id) => !tarkovStore.isTaskComplete(id))
        .map((id) => [id, previousAcceptance(id)] as const)
    );
  const checkAcceptanceRestores = (context: UndoContext) => {
    const completions = tarkovStore.getCurrentProgressData()?.taskCompletions;
    const restores = [
      [context.event.taskId, context.previousAcceptance] as const,
      ...context.alternativeAcceptances,
    ];
    if (
      restores.some(
        ([id, active]) => active === undefined && hasUnconfirmableStatusClock(completions?.[id])
      )
    ) {
      throw new Error('Task acceptance clock cannot advance');
    }
  };
  const showUndoStatus = ({ event }: UndoContext, statusKey: string) => {
    updateTaskStatus(statusKey, event.taskName);
  };
  const uncompleteObjectives = (task: Task | undefined) => {
    if (task?.objectives) handleTaskObjectives(task.objectives, 'setTaskObjectiveUncomplete');
  };
  // 'available' mutates an unbounded set of prerequisite tasks and is not safely reversible.
  const undoHandlers: Partial<Record<TaskActionPayload['action'], (context: UndoContext) => void>> =
    {
      active: (context) => {
        restoreSelectedAcceptance(context);
        restoreAvailability(context);
        context.releaseStoryObjectives();
        showUndoStatus(context, 'page.tasks.questcard.undo_active');
      },
      complete: (context) => {
        checkAcceptanceRestores(context);
        restoreSelectedAcceptance(context);
        context.releaseStoryObjectives();
        uncompleteObjectives(context.task);
        for (const [taskId, active] of context.alternativeAcceptances) {
          restoreTaskAcceptance(taskId, active);
          handleTaskObjectives(alternativeObjectives(taskId), 'setTaskObjectiveUncomplete');
        }
        showUndoStatus(context, 'page.tasks.questcard.undo_complete');
      },
      uncomplete: (context) => {
        tarkovStore.setTaskComplete(context.event.taskId);
        if (context.task?.objectives) {
          handleTaskObjectives(context.task.objectives, 'setTaskObjectiveComplete');
        }
        failAlternatives(context.task?.alternatives);
        raiseToMinLevel(context.task?.minPlayerLevel);
        showUndoStatus(context, 'page.tasks.questcard.undo_uncomplete');
      },
      reset_failed: (context) => {
        if (context.event.wasManualFail) {
          tarkovStore.setTaskFailed(context.event.taskId, { manual: true });
        } else {
          tarkovStore.setTaskFailed(context.event.taskId);
        }
        if (context.task?.objectives) clearTaskObjectives(context.task.objectives);
        showUndoStatus(context, 'page.tasks.questcard.undo_reset_failed');
      },
      fail: (context) => {
        restoreSelectedAcceptance(context);
        context.releaseStoryObjectives();
        uncompleteObjectives(context.task);
        showUndoStatus(context, 'page.tasks.questcard.undo_failed');
      },
    };
  const taskProvesStartGates = (task: Task) => {
    const data = tarkovStore.getCurrentProgressData();
    return provesStartGates(
      task,
      data?.taskCompletions?.[task.id],
      data?.taskAvailability?.[task.id],
      data?.taskCompletions
    );
  };
  /** Register a reversible action in the global undo store for actions we can revert. */
  const registerUndo = (event: TaskActionPayload, description: string) => {
    const handler = undoHandlers[event.action];
    if (!handler) return;
    const task = tasks.value.find(({ id }) => id === event.taskId);
    const context: UndoContext = {
      event,
      task,
      previousAcceptance: previousAcceptance(event.taskId),
      previousConfirmation:
        event.action === 'active' && event.statusWrite ? captureAvailability(task) : undefined,
      alternativeAcceptances: captureAlternativeAcceptances(
        event.action === 'complete' ? task?.alternatives : undefined
      ),
      releaseStoryObjectives: () =>
        releaseRecordedStoryObjectives({
          store: tarkovStore,
          recorded: event.recordedStoryObjectives ?? [],
          tasks: tasks.value ?? [],
          provesStartGates: taskProvesStartGates,
        }),
    };
    const { taskId, statusWrite } = event;
    const previousStatuses = new Map(
      [taskId, ...(task?.alternatives ?? [])].map((id) => [id, currentStatusTimestamp(id)])
    );
    const writtenStatuses = () =>
      statusWrite
        ? [[taskId, statusWrite.timestamp] as const, ...(statusWrite.alternatives ?? [])]
        : [];
    actionHistoryStore.pushAction({
      id: `task-${event.taskId}-${Date.now()}`,
      description,
      taskStatusWrite: statusWrite && { taskId, write: statusWrite },
      canUndo: () => {
        const statusMatches = writtenStatuses().every(
          ([id, timestamp]) => currentStatusTimestamp(id) === timestamp
        );
        const isAcceptance = statusWrite && event.action === 'active';
        const current = tarkovStore.getCurrentProgressData()?.taskCompletions?.[taskId];
        const allowed = statusMatches && (!isAcceptance || isTaskActive(current));
        if (!allowed) showUndoButton.value = false;
        return allowed;
      },
      undo: () => {
        handler(context);
        // A local Undo writes a fresh clock for the state created by an older local action.
        for (const [id] of writtenStatuses()) {
          const prior = actionHistoryStore.undoStack.findLast(({ taskStatusWrite }) => {
            if (!taskStatusWrite) return false;
            const { taskId: priorTaskId, write } = taskStatusWrite;
            const timestamp = id === priorTaskId ? write.timestamp : write.alternatives?.get(id);
            return timestamp === previousStatuses.get(id);
          })?.taskStatusWrite;
          if (!prior) continue;
          const timestamp = currentStatusTimestamp(id);
          if (prior.taskId === id) prior.write.timestamp = timestamp;
          else prior.write.alternatives?.set(id, timestamp);
        }
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
    registerUndo(event, title);
    showActionStatus(event);
  };
  const undoLastAction = () => {
    return actionHistoryStore.undoLastAction();
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
