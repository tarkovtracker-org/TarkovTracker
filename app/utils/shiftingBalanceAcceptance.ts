import { TASK_ID_REGISTRY } from '@/utils/constants';
import {
  hasUnconfirmableStatusClock,
  isAvailabilityConfirmed,
  taskStatusTimestamp,
} from '@/utils/taskAvailabilityConfirmation';
import { isTaskComplete, isTaskFailed } from '@/utils/taskStatus';
import type { TaskAvailabilityTeamData } from '@/stores/taskAvailability';
import type { Task } from '@/types/tarkov';
const { CUT_DOWN_TO_THE_ROOT, PRESERVE_A_VALUABLE_PIECE } = TASK_ID_REGISTRY;
const acceptedStatuses = new Set(['active', 'accept', 'accepted']);
/** Opt in only for the captured active-only edge; older quest heuristics stay unchanged. */
export const strictAcceptancePredecessor = (
  task: Pick<Task, 'id' | 'taskRequirements'>
): string | undefined => {
  if (task.id !== PRESERVE_A_VALUABLE_PIECE) return undefined;
  if (!Array.isArray(task.taskRequirements)) return undefined;
  return task.taskRequirements.find(
    (req) => req?.task?.id === CUT_DOWN_TO_THE_ROOT && isActiveOnly(req.status)
  )?.task.id;
};
const isActiveOnly = (statuses: unknown): boolean =>
  Array.isArray(statuses) &&
  statuses.length > 0 &&
  statuses.every(
    (status) => typeof status === 'string' && acceptedStatuses.has(status.toLowerCase())
  );
export const importedAcceptanceSignature = (taskId: string): string | undefined =>
  taskId === CUT_DOWN_TO_THE_ROOT ? JSON.stringify(['eft-start', taskId]) : undefined;
/** Bind the observation to the predecessor revision this device actually saw. */
export const manualAcceptanceGate = (
  task: Task,
  completions?: TaskAvailabilityTeamData['completions']
) => {
  const predecessor = strictAcceptancePredecessor(task);
  if (!predecessor) return undefined;
  return ['in-game-acceptance', predecessor, taskStatusTimestamp(completions?.[predecessor])];
};
type AcceptanceData = Pick<TaskAvailabilityTeamData, 'completions' | 'confirmations'>;
export const acceptanceBranchClosed = (taskId: string, data: AcceptanceData): boolean =>
  isTaskComplete(data.completions[taskId]) || isTaskFailed(data.completions[taskId]);
export const hasImportedAcceptance = (taskId: string, data: AcceptanceData): boolean => {
  const completion = data.completions[taskId];
  // Older imports recorded the EFT signature with a neutral row that omitted active.
  if (!completion || (typeof completion === 'object' && completion.active === false)) return false;
  return (
    !acceptanceBranchClosed(taskId, data) &&
    isAvailabilityConfirmed(
      data.confirmations?.[taskId],
      completion,
      importedAcceptanceSignature(taskId)
    )
  );
};
/** The signature retires on a predecessor change even when its clock lags behind. */
export const hasManualAcceptance = (
  taskId: string,
  predecessor: string,
  data: AcceptanceData,
  signature: string | undefined
): boolean => {
  const confirmation = data.confirmations?.[taskId];
  return (
    isAvailabilityConfirmed(confirmation, data.completions[taskId], signature) &&
    !hasUnconfirmableStatusClock(data.completions[predecessor])
  );
};
