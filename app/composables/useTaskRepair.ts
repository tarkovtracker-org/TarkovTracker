import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { MANUAL_FAIL_TASK_IDS } from '@/utils/constants';
import { logger } from '@/utils/logger';
import type { Ref } from '#imports';
export type RepairConfirmResolver = (confirmed: boolean) => void;
export type RequestRepairConfirm = () => Promise<boolean>;
export interface RepairableTask {
  id: string;
  failConditions?: Array<{ task?: { id?: string }; status?: string[] }>;
}
export interface UseTaskRepairOptions {
  requestRepairConfirm: RequestRepairConfirm;
}
export interface UseTaskRepairReturn {
  failedTasksCount: Readonly<Ref<number>>;
  repairFailedTasks: () => Promise<void>;
  buildAlternativeSources: () => Map<string, string[]>;
  shouldTaskBeFailed: (task: RepairableTask, alternativeSources: Map<string, string[]>) => boolean;
  getRepairableFailedTasks: () => RepairableTask[];
}
export function useTaskRepair({ requestRepairConfirm }: UseTaskRepairOptions): UseTaskRepairReturn {
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const isTaskSuccessful = (taskId: string) =>
    tarkovStore.isTaskComplete(taskId) && !tarkovStore.isTaskFailed(taskId);
  const hasStatus = (status: string[] | undefined, statuses: string[]) => {
    const normalized = (status ?? []).map((entry) => entry.toLowerCase());
    return statuses.some((value) => normalized.includes(value));
  };
  const isTaskManuallyFailed = (taskId: string) => {
    const completion = tarkovStore.getCurrentProgressData().taskCompletions?.[taskId];
    if (!completion) return false;
    return completion.manual === true;
  };
  const buildAlternativeSources = () => {
    const sourcesByTask = new Map<string, string[]>();
    metadataStore.tasks.forEach((task) => {
      (task.alternatives ?? []).forEach((alternativeId) => {
        const sources = sourcesByTask.get(alternativeId) ?? [];
        if (!sources.includes(task.id)) {
          sources.push(task.id);
          sourcesByTask.set(alternativeId, sources);
        }
      });
    });
    return sourcesByTask;
  };
  const shouldTaskBeFailed = (task: RepairableTask, alternativeSources: Map<string, string[]>) => {
    if (isTaskManuallyFailed(task.id)) return true;
    if (MANUAL_FAIL_TASK_IDS.includes(task.id)) return true;
    const failConditions = task.failConditions ?? [];
    const failedByCondition = failConditions.some((objective) => {
      if (!objective?.task?.id) return false;
      if (!hasStatus(objective.status, ['complete', 'completed'])) return false;
      return isTaskSuccessful(objective.task.id);
    });
    if (failedByCondition) return true;
    const sources = alternativeSources.get(task.id);
    if (!sources?.length) return false;
    return sources.some((sourceId) => isTaskSuccessful(sourceId));
  };
  const getRepairableFailedTasks = () => {
    const alternativeSources = buildAlternativeSources();
    return metadataStore.tasks.filter(
      (task) => tarkovStore.isTaskFailed(task.id) && !shouldTaskBeFailed(task, alternativeSources)
    );
  };
  const failedTasksCount = computed(() => getRepairableFailedTasks().length);
  const repairFailedTasks = async () => {
    if (failedTasksCount.value === 0) return;
    try {
      const confirmed = await requestRepairConfirm();
      if (!confirmed) return;
      const repairableTasks = getRepairableFailedTasks();
      if (repairableTasks.length === 0) return;
      const objectiveIds: string[] = [];
      const taskIds = repairableTasks.map((task) => task.id);
      repairableTasks.forEach((task) => {
        task.objectives?.forEach((objective) => {
          if (objective?.id) objectiveIds.push(objective.id);
        });
      });
      if (taskIds.length || objectiveIds.length) {
        tarkovStore.setTasksAndObjectivesUncompleted(taskIds, objectiveIds);
      }
      toast.add({
        title: t('page.tasks.settings.advanced.repair_failed_done', { count: taskIds.length }),
        color: 'success',
      });
    } catch (error) {
      logger.error('[TaskRepair] repairFailedTasks failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.add({
        title: t('page.tasks.settings.advanced.repair_failed_error'),
        color: 'error',
      });
    }
  };
  return {
    failedTasksCount,
    repairFailedTasks,
    buildAlternativeSources,
    shouldTaskBeFailed,
    getRepairableFailedTasks,
  };
}
