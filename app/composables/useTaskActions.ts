import { useProductAnalytics } from '@/composables/useProductAnalytics';
import { hasStoryUnlockProgress, type TaskBlocker } from '@/stores/taskAvailability';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import {
  normalizeOtherRequirements,
  otherRequirementsSignature,
} from '@/utils/taskOtherRequirements';
import {
  applyTaskAvailabilityRequirements,
  canApplyTaskAvailabilityRequirements,
  applyTaskTraderRequirements,
  completeTaskForProgress,
  ensureTaskMinPlayerLevel,
  failTaskForProgress,
  uncompleteTaskForProgress,
} from '@/utils/taskProgress';
import type { Task, TaskRequirement } from '@/types/tarkov';
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
  /** Whether Mark available would make the task available rather than leave it locked. */
  canMarkTaskAvailable: () => boolean;
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
/**
 * Blockers Mark available can clear: it raises the player level and trader values, records
 * unambiguous prerequisite statuses and confirms unknown-value or conversation server gates.
 * Anything else (faction, prestige, trader unlock, failed branch, disabled, known unmet value,
 * unknown data, cycles, terminal states) would leave the task locked after changing progress.
 */
const RESOLVABLE_BLOCKERS: ReadonlySet<TaskBlocker['type']> = new Set([
  'player_level',
  'trader_level',
  'trader_reputation',
  'prerequisite',
  'global_variable_unknown',
  'dialogue',
]);
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
    applyTaskTraderRequirements({
      store: tarkovStore,
      task: currentTask,
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
    ensureTraderRequirements(currentTask);
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
  const progressStore = useProgressStore();
  const currentEvaluation = (taskId: string) => progressStore.taskEvaluations?.[taskId]?.self;
  const hasUnresolvableBlocker = (taskId: string): boolean =>
    (currentEvaluation(taskId)?.blockers ?? []).some(
      (blocker) => !RESOLVABLE_BLOCKERS.has(blocker.type)
    );
  /** Unmet direct prerequisites from the current evaluation, or undefined before one exists. */
  const evaluatedUnmetRequirements = (taskId: string): TaskRequirement[] | undefined =>
    currentEvaluation(taskId)?.blockers.flatMap((blocker) =>
      blocker.type === 'prerequisite' ? (blocker.requirements ?? []) : []
    );
  const taskCompletion = (id: string) => tarkovStore.getCurrentProgressData().taskCompletions?.[id];
  const storyRouteSatisfied = (currentTask: Task) =>
    (currentTask.storyUnlocks ?? []).some((chapter) =>
      hasStoryUnlockProgress(chapter.id, {
        storyChapters: tarkovStore.getCurrentProgressData().storyChapters,
      })
    );
  /**
   * Mark available must either make the task available or change nothing: an unsupported server
   * gate or an unmet ambiguous/malformed prerequisite would leave it locked after raising levels,
   * traders or prerequisites.
   */
  const canMarkTaskAvailable = (currentTask: Task): boolean => {
    const gatesConfirmable =
      otherRequirementsSignature(currentTask) !== undefined ||
      !normalizeOtherRequirements(currentTask.otherRequirements).length;
    return (
      gatesConfirmable &&
      !hasUnresolvableBlocker(currentTask.id) &&
      canApplyTaskAvailabilityRequirements(
        currentTask,
        taskCompletion,
        storyRouteSatisfied(currentTask),
        evaluatedUnmetRequirements(currentTask.id)
      )
    );
  };
  const markTaskAvailable = () => {
    const currentTask = task();
    const taskName = getTaskName(currentTask, () => t('common.task', 'Task'));
    if (!canMarkTaskAvailable(currentTask)) return;
    const requirements = otherRequirementsSignature(currentTask);
    applyTaskAvailabilityRequirements({
      getCompletion: taskCompletion,
      skipTaskRequirements: storyRouteSatisfied(currentTask),
      onCompleteRequirement: completeTaskForAvailability,
      onFailRequirement: failTaskForAvailability,
      task: currentTask,
    });
    ensureTaskMinPlayerLevel(tarkovStore, currentTask);
    ensureTraderRequirements(currentTask);
    if (requirements) tarkovStore.confirmTaskAvailability(currentTask.id, requirements);
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
    canMarkTaskAvailable: () => canMarkTaskAvailable(task()),
    markTaskFailed,
  };
}
