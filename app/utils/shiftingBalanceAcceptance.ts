import { TASK_ID_REGISTRY } from '@/utils/constants';
import { isAvailabilityConfirmed } from '@/utils/taskAvailabilityConfirmation';
import { isTaskActive, isTaskComplete, isTaskFailed } from '@/utils/taskStatus';
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
export const manualAcceptanceGate = (task: Task): string[] =>
  strictAcceptancePredecessor(task) ? ['in-game-acceptance', CUT_DOWN_TO_THE_ROOT] : [];
type AcceptanceData = Pick<TaskAvailabilityTeamData, 'completions' | 'confirmations'>;
export const acceptanceBranchClosed = (taskId: string, data: AcceptanceData): boolean =>
  isTaskComplete(data.completions[taskId]) || isTaskFailed(data.completions[taskId]);
export const hasImportedAcceptance = (taskId: string, data: AcceptanceData): boolean =>
  isTaskActive(data.completions[taskId]) &&
  isAvailabilityConfirmed(
    data.confirmations?.[taskId],
    data.completions[taskId],
    importedAcceptanceSignature(taskId)
  );
/** A newer reset or terminal state of either quest invalidates manual confirmation. */
export const hasManualAcceptance = (
  taskId: string,
  predecessor: string,
  data: AcceptanceData,
  signature: string | undefined
): boolean => {
  const confirmation = data.confirmations?.[taskId];
  return (
    isAvailabilityConfirmed(confirmation, data.completions[taskId], signature) &&
    isAvailabilityConfirmed(confirmation, data.completions[predecessor], signature)
  );
};
