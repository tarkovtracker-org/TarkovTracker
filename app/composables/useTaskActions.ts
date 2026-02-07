import { useI18n } from 'vue-i18n';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useTarkovStore } from '@/stores/useTarkov';
import type { Task, TaskObjective } from '@/types/tarkov';
export type TaskActionPayload = {
  taskId: string;
  taskName: string;
  action: 'available' | 'complete' | 'uncomplete' | 'reset_failed' | 'fail';
  undoKey?: string;
  statusKey?: string;
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
  const normalizeStatuses = (statuses?: string[]) =>
    (statuses ?? []).map((status) => status.toLowerCase());
  const hasAnyStatus = (statuses: string[], values: string[]) =>
    values.some((value) => statuses.includes(value));
  const isFailedOnlyRequirement = (statuses?: string[]) => {
    const normalized = normalizeStatuses(statuses);
    if (normalized.length === 0) return false;
    return (
      normalized.includes('failed') &&
      !hasAnyStatus(normalized, ['complete', 'completed', 'active', 'accept', 'accepted'])
    );
  };
  const completeTaskForAvailability = (taskId: string) => {
    tarkovStore.setTaskComplete(taskId);
    const requiredTask = tasksMap.value.get(taskId);
    if (requiredTask?.objectives) {
      handleTaskObjectives(requiredTask.objectives, 'setTaskObjectiveComplete');
    }
    if (requiredTask?.alternatives) {
      handleAlternatives(requiredTask.alternatives, 'setTaskFailed', 'setTaskObjectiveComplete');
    }
  };
  const failTaskForAvailability = (taskId: string) => {
    tarkovStore.setTaskFailed(taskId);
    const requiredTask = tasksMap.value.get(taskId);
    if (requiredTask?.objectives) {
      clearTaskObjectives(requiredTask.objectives);
    }
  };
  const handleAlternatives = (
    alternatives: string[] | undefined,
    taskAction: 'setTaskFailed' | 'setTaskUncompleted',
    objectiveAction: 'setTaskObjectiveComplete' | 'setTaskObjectiveUncomplete'
  ) => {
    if (!Array.isArray(alternatives)) return;
    alternatives.forEach((alternativeTaskId) => {
      tarkovStore[taskAction](alternativeTaskId);
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
  const emitAction = (payload: TaskActionPayload) => {
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
    if (!isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action: wasFailed ? 'reset_failed' : 'uncomplete',
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
        undoKey: wasFailed
          ? 'page.tasks.questcard.undo_reset_failed'
          : 'page.tasks.questcard.undo_uncomplete',
      });
    }
  };
  const markTaskAvailable = () => {
    const currentTask = task();
    const taskName = currentTask.name ?? t('page.tasks.questcard.task');
    const handledRequirementTaskIds = new Set<string>();
    const failedRequirementTaskIds = new Set<string>();
    currentTask.taskRequirements?.forEach((req) => {
      if (req.task?.id) {
        const requirementTaskId = req.task.id;
        if (isFailedOnlyRequirement(req.status)) {
          failTaskForAvailability(requirementTaskId);
          failedRequirementTaskIds.add(requirementTaskId);
        } else {
          completeTaskForAvailability(requirementTaskId);
        }
        handledRequirementTaskIds.add(requirementTaskId);
      }
    });
    currentTask.predecessors?.forEach((predecessorId) => {
      if (handledRequirementTaskIds.has(predecessorId)) return;
      if (failedRequirementTaskIds.has(predecessorId)) return;
      completeTaskForAvailability(predecessorId);
    });
    ensureMinLevel();
    emitAction({
      taskId: currentTask.id,
      taskName,
      action: 'available',
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
        statusKey: 'page.tasks.questcard.status_failed',
      });
    }
    tarkovStore.setTaskFailed(currentTask.id);
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
