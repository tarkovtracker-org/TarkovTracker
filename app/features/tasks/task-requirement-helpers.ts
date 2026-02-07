import {
  isTaskActive,
  isTaskComplete,
  isTaskFailed,
  type RawTaskCompletion,
} from '@/utils/taskStatus';
const normalizeStatuses = (statuses: string[] | undefined): string[] =>
  (statuses ?? []).map((status) => status.toLowerCase());
const hasAnyStatus = (statuses: string[], values: string[]): boolean =>
  values.some((value) => statuses.includes(value));
export const isTaskRequirementSatisfied = (
  statuses: string[] | undefined,
  completion: RawTaskCompletion,
  isUnlockable = false
): boolean => {
  const requirementStatus = normalizeStatuses(statuses);
  const requiresComplete =
    requirementStatus.length === 0 || hasAnyStatus(requirementStatus, ['complete', 'completed']);
  const requiresActive = hasAnyStatus(requirementStatus, ['active', 'accept', 'accepted']);
  const requiresFailed = hasAnyStatus(requirementStatus, ['failed']);
  if (requiresComplete && isTaskComplete(completion)) return true;
  if (requiresFailed && isTaskFailed(completion)) return true;
  if (requiresActive) {
    if (isTaskActive(completion) || isTaskComplete(completion)) return true;
    if (isUnlockable) return true;
  }
  return false;
};
