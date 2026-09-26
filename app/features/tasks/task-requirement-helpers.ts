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
const hasExplicitAcceptance = (completion: RawTaskCompletion): boolean =>
  typeof completion === 'object' && completion !== null && Object.hasOwn(completion, 'active');
const acceptsActiveRequirement = (completion: RawTaskCompletion): boolean =>
  isTaskActive(completion) || isTaskComplete(completion);
const rejectsActiveRequirement = (completion: RawTaskCompletion): boolean =>
  isTaskFailed(completion) || hasExplicitAcceptance(completion);
const activeRequirementMet = (completion: RawTaskCompletion, isUnlockable: boolean): boolean => {
  if (acceptsActiveRequirement(completion)) return true;
  if (rejectsActiveRequirement(completion)) return false;
  return isUnlockable;
};
const requirementChecks = {
  completed: isTaskComplete,
  failed: isTaskFailed,
  active: activeRequirementMet,
};
export const isTaskRequirementSatisfied = (
  statuses: string[] | undefined,
  completion: RawTaskCompletion,
  isUnlockable = false
): boolean =>
  getRequiredTaskStatuses(statuses).some((status) =>
    requirementChecks[status](completion, isUnlockable)
  );
