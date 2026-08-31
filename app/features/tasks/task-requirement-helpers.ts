import {
  isTaskActive,
  isTaskComplete,
  isTaskFailed,
  type RawTaskCompletion,
} from '@/utils/taskStatus';
export type RequirementExpectedStatus = 'completed' | 'active' | 'failed';
export type RequirementCurrentStatus = RequirementExpectedStatus | 'available' | 'not_started';
const COMPLETE_STATUSES = ['complete', 'completed'];
const ACTIVE_STATUSES = ['active', 'accept', 'accepted'];
const FAILED_STATUSES = ['failed'];
const normalizeStatuses = (statuses: string[] | undefined): string[] =>
  (statuses ?? []).map((status) => status.toLowerCase());
const hasAnyStatus = (statuses: string[], values: string[]): boolean =>
  values.some((value) => statuses.includes(value));
export const getRequiredTaskStatuses = (
  statuses: string[] | undefined
): RequirementExpectedStatus[] => {
  const requirementStatus = normalizeStatuses(statuses);
  const requiresComplete =
    requirementStatus.length === 0 || hasAnyStatus(requirementStatus, COMPLETE_STATUSES);
  const requiresActive = hasAnyStatus(requirementStatus, ACTIVE_STATUSES);
  const requiresFailed = hasAnyStatus(requirementStatus, FAILED_STATUSES);
  const requiredStatuses: RequirementExpectedStatus[] = [];
  if (requiresComplete) requiredStatuses.push('completed');
  if (requiresActive) requiredStatuses.push('active');
  if (requiresFailed) requiredStatuses.push('failed');
  return requiredStatuses;
};
export const getCurrentTaskStatusForRequirement = (
  completion: RawTaskCompletion,
  isUnlockable = false
): RequirementCurrentStatus => {
  if (isTaskFailed(completion)) return 'failed';
  if (isTaskComplete(completion)) return 'completed';
  if (isTaskActive(completion)) return 'active';
  if (isUnlockable) return 'available';
  return 'not_started';
};
export const isTaskRequirementSatisfied = (
  statuses: string[] | undefined,
  completion: RawTaskCompletion
): boolean => {
  const requiredStatuses = getRequiredTaskStatuses(statuses);
  if (requiredStatuses.includes('completed') && isTaskComplete(completion)) return true;
  if (requiredStatuses.includes('failed') && isTaskFailed(completion)) return true;
  if (requiredStatuses.includes('active')) {
    if (isTaskActive(completion) || isTaskComplete(completion)) return true;
  }
  return false;
};
