import { TASK_ID_REGISTRY } from '@/utils/constants';
import {
  hasUnconfirmableStatusClock,
  isAvailabilityConfirmed,
  taskStatusTimestamp,
} from '@/utils/taskAvailabilityConfirmation';
import { isTaskComplete, isTaskFailed } from '@/utils/taskStatus';
import type { TaskAvailabilityTeamData } from '@/stores/taskAvailability';
import type { TaskAvailabilityConfirmation } from '@/types/progress';
import type { Task } from '@/types/tarkov';
import type { RawTaskCompletion } from '@/utils/taskStatus';
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
const manualAcceptanceRevision = (predecessor: string, completion: RawTaskCompletion) =>
  ['in-game-acceptance', predecessor, taskStatusTimestamp(completion)] as const;
/** Bind the observation to the predecessor revision this device actually saw. */
export const manualAcceptanceGate = (
  task: Task,
  completions?: TaskAvailabilityTeamData['completions']
) => {
  const predecessor = strictAcceptancePredecessor(task);
  if (!predecessor) return undefined;
  return manualAcceptanceRevision(predecessor, completions?.[predecessor]);
};
const priorManualRequirements = (
  signature: string,
  previousGate: ReturnType<typeof manualAcceptanceRevision>
) => {
  try {
    const entries: unknown = JSON.parse(signature);
    if (Array.isArray(entries) && JSON.stringify(entries.at(-1)) === JSON.stringify(previousGate)) {
      return entries.slice(0, -1) as unknown[];
    }
  } catch {
    // A malformed saved signature cannot establish an observation.
  }
};
const hasCurrentManualConfirmation = (
  confirmation: TaskAvailabilityConfirmation,
  dependent: RawTaskCompletion,
  previous: RawTaskCompletion
) =>
  !hasUnconfirmableStatusClock(previous) &&
  isAvailabilityConfirmed(confirmation, dependent, confirmation.requirements);
/** Move a current manual observation to the new revision without changing its other gates. */
export const rebaseManualAcceptance = (
  confirmation: TaskAvailabilityConfirmation | undefined,
  dependent: RawTaskCompletion,
  predecessor: string,
  previous: RawTaskCompletion,
  next: RawTaskCompletion
) => {
  if (!confirmation || !hasCurrentManualConfirmation(confirmation, dependent, previous)) return;
  const prior = priorManualRequirements(
    confirmation.requirements,
    manualAcceptanceRevision(predecessor, previous)
  );
  if (prior) return JSON.stringify([...prior, manualAcceptanceRevision(predecessor, next)]);
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
  return Boolean(
    confirmation &&
    confirmation.requirements === signature &&
    hasCurrentManualConfirmation(
      confirmation,
      data.completions[taskId],
      data.completions[predecessor]
    )
  );
};
