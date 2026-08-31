import { useProductAnalytics } from '@/composables/useProductAnalytics';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useTarkovStore } from '@/stores/useTarkov';
import {
  applyTaskAvailabilityRequirements,
  applyTaskTraderRequirements,
  completeTaskForProgress,
  ensureTaskMinPlayerLevel,
  failTaskForProgress,
  uncompleteTaskForProgress,
} from '@/utils/taskProgress';
import type { Task } from '@/types/tarkov';
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
const toYesNo = (value: unknown) => (value ? 'yes' : 'no');
const getKnownTraderName = (trader: NonNullable<Task['trader']>) =>
  trader.normalizedName || trader.name || 'unknown';
const getTaskTraderName = (task: Task) => {
  if (!task.trader) return 'unknown';
  return getKnownTraderName(task.trader);
};
const getTaskName = (task: Task, fallback: () => string) => task.name ?? fallback();
const getTaskObjectiveCount = (task: Task) => task.objectives?.length ?? 0;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const getTaskAnalyticsParams = (
  currentTask: Task,
  gameMode: string,
  params: Record<string, boolean | number | string> = {}
) => ({
  game_mode: gameMode,
  task_has_required_keys: toYesNo(currentTask.requiredKeys?.length),
  task_id: currentTask.id,
  task_is_kappa: toYesNo(currentTask.kappaRequired),
  task_is_lightkeeper: toYesNo(currentTask.lightkeeperRequired),
  task_name: currentTask.name || currentTask.id,
  task_trader: getTaskTraderName(currentTask),
  ...params,
});
const getUncompleteAction = (wasFailed: boolean) =>
  wasFailed ? ('reset_failed' as const) : ('uncomplete' as const);
const getUncompleteStatusKey = (wasFailed: boolean) =>
  wasFailed ? 'page.tasks.questcard.status_reset_failed' : 'page.tasks.questcard.status_uncomplete';
const getUncompleteUndoKey = (wasFailed: boolean) =>
  wasFailed ? 'page.tasks.questcard.undo_reset_failed' : 'page.tasks.questcard.undo_uncomplete';
export function useTaskActions(
  task: () => Task,
  onAction?: (payload: TaskActionPayload) => void
): UseTaskActionsReturn {
  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const { trackTaskAction } = useProductAnalytics();
  const tasksMap = computed(() => metadataStore.taskById);
  const unpinTaskIfPinned = (taskId: string) => {
    if (!preferencesStore.getPinnedTaskIds.includes(taskId)) return;
    preferencesStore.togglePinnedTask(taskId);
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
  const ensureTraderRequirements = (currentTask: Task) => {
    if (!preferencesStore.getTasksRequireTraderLevels) return;
    const fenceId = metadataStore.traders.find((trader) => trader.normalizedName === 'fence')?.id;
    applyTaskTraderRequirements({
      store: tarkovStore,
      task: currentTask,
      fenceId,
    });
  };
  const isTaskManuallyFailed = (taskId: string) => {
    const completion = tarkovStore.getCurrentProgressData().taskCompletions?.[taskId];
    if (!isObject(completion)) return false;
    if (!Object.prototype.hasOwnProperty.call(completion, 'manual')) return false;
    return completion.manual === true;
  };
  const getWasManualFail = (taskId: string, wasFailed: boolean) => {
    if (!wasFailed) return false;
    return isTaskManuallyFailed(taskId);
  };
  const analyticsParams = (
    currentTask: Task,
    params: Record<string, boolean | number | string> = {}
  ) => getTaskAnalyticsParams(currentTask, tarkovStore.getCurrentGameMode(), params);
  const emitAction = (payload: TaskActionPayload) => {
    trackTaskAction(payload);
    onAction?.(payload);
  };
  const markTaskComplete = (isUndo = false) => {
    const currentTask = task();
    const taskName = getTaskName(currentTask, () => t('common.task', 'Task'));
    if (!isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action: 'complete',
        analyticsParams: analyticsParams(currentTask, {
          objective_count: getTaskObjectiveCount(currentTask),
        }),
        statusKey: 'page.tasks.questcard.status_complete',
      });
    }
    completeTaskForProgress({
      store: tarkovStore,
      taskId: currentTask.id,
      tasksMap: tasksMap.value,
    });
    unpinTaskIfPinned(currentTask.id);
    ensureTaskMinPlayerLevel(tarkovStore, currentTask);
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
    const taskName = getTaskName(currentTask, () => t('common.task', 'Task'));
    const wasFailed = tarkovStore.isTaskFailed(currentTask.id);
    const wasManualFail = getWasManualFail(currentTask.id, wasFailed);
    const action = getUncompleteAction(wasFailed);
    if (!isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action,
        analyticsParams: analyticsParams(currentTask, {
          was_manual_fail: toYesNo(wasManualFail),
        }),
        wasManualFail,
        statusKey: getUncompleteStatusKey(wasFailed),
      });
    }
    uncompleteTaskForProgress({
      store: tarkovStore,
      taskId: currentTask.id,
      tasksMap: tasksMap.value,
      restoreAlternatives: !wasFailed,
    });
    if (isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action,
        wasManualFail,
        undoKey: getUncompleteUndoKey(wasFailed),
      });
    }
  };
  const markTaskAvailable = () => {
    const currentTask = task();
    const taskName = getTaskName(currentTask, () => t('common.task', 'Task'));
    applyTaskAvailabilityRequirements({
      onCompleteRequirement: completeTaskForAvailability,
      onFailRequirement: failTaskForAvailability,
      task: currentTask,
    });
    ensureTaskMinPlayerLevel(tarkovStore, currentTask);
    ensureTraderRequirements(currentTask);
    emitAction({
      taskId: currentTask.id,
      taskName,
      action: 'available',
      analyticsParams: analyticsParams(currentTask),
      statusKey: 'page.tasks.questcard.status_available',
    });
  };
  const markTaskFailed = (isUndo = false) => {
    const currentTask = task();
    const taskName = getTaskName(currentTask, () => t('common.task', 'Task'));
    if (!isUndo) {
      emitAction({
        taskId: currentTask.id,
        taskName,
        action: 'fail',
        analyticsParams: analyticsParams(currentTask, {
          was_manual_fail: 'yes',
        }),
        statusKey: 'page.tasks.questcard.status_failed',
      });
    }
    failTaskForProgress({
      store: tarkovStore,
      taskId: currentTask.id,
      tasksMap: tasksMap.value,
      manual: true,
    });
    unpinTaskIfPinned(currentTask.id);
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
