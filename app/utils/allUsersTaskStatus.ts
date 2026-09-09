/**
 * All-users (team) task status predicates.
 *
 * The all-users views are independent membership tests rather than one
 * exclusive bucket: a task available to one teammate and active for another
 * legitimately appears under both the Available and the Active view. Filters
 * and status counts therefore share these predicates so a badge always counts
 * exactly what its own view will display.
 */
import type { TaskSecondaryView } from '@/types/taskFilter';
export type TeamTaskStatus = {
  teamId: string;
  isUnlocked: boolean;
  isActive: boolean;
  isCompleted: boolean;
  isFailed: boolean;
};
export const isAvailableTeamTask = ({
  isUnlocked,
  isActive,
  isCompleted,
  isFailed,
}: TeamTaskStatus): boolean => isUnlocked && !isActive && !isCompleted && !isFailed;
export const isActiveTeamTask = ({ isActive }: TeamTaskStatus): boolean => isActive;
export const hasAvailableForAnyUser = (statuses: readonly TeamTaskStatus[]): boolean =>
  statuses.some(isAvailableTeamTask);
export const hasActiveForAnyUser = (statuses: readonly TeamTaskStatus[]): boolean =>
  statuses.some(isActiveTeamTask);
export const hasFailedForAnyUser = (statuses: readonly TeamTaskStatus[]): boolean =>
  statuses.some(({ isFailed }) => isFailed);
export const isCompletedByAllUsers = (statuses: readonly TeamTaskStatus[]): boolean =>
  statuses.every(({ isCompleted, isFailed }) => isCompleted && !isFailed);
export const isLockedForAllUsers = (statuses: readonly TeamTaskStatus[]): boolean =>
  [
    hasAvailableForAnyUser(statuses),
    hasActiveForAnyUser(statuses),
    statuses.every(({ isCompleted }) => isCompleted),
    hasFailedForAnyUser(statuses),
  ].every((hasStatus) => !hasStatus);
/**
 * Whether a task belongs in an all-users secondary view.
 *
 * `isInvalid` only gates the Available and Locked views; a task that is active,
 * failed, or completed for someone stays visible regardless.
 */
export const matchesAllUsersView = (
  view: Exclude<TaskSecondaryView, 'all'>,
  statuses: readonly TeamTaskStatus[],
  isInvalid: boolean
): boolean => {
  switch (view) {
    case 'available':
      return !isInvalid && hasAvailableForAnyUser(statuses);
    case 'active':
      return hasActiveForAnyUser(statuses);
    case 'failed':
      return hasFailedForAnyUser(statuses);
    case 'completed':
      return isCompletedByAllUsers(statuses);
    case 'locked':
      return !isInvalid && isLockedForAllUsers(statuses);
  }
};
/**
 * Ranks a task for the all-users trader grouping.
 *
 * Ordering is available, then active or locked, then completed, then failed.
 * Classification keeps the same precedence the counts use — failed and
 * completed outrank active, and active outranks merely being available for
 * someone else — so a task active for any teammate is never grouped with the
 * available tasks.
 */
export const getAllUsersTraderRank = (
  statuses: readonly TeamTaskStatus[],
  isInvalid: boolean
): number => {
  const availableRank = hasAvailableForAnyUser(statuses) && !isInvalid ? 0 : null;
  const completedByAll = isCompletedByAllUsers(statuses);
  if (!completedByAll && !hasFailedForAnyUser(statuses)) {
    // Active outranks merely being available to a different teammate.
    if (hasActiveForAnyUser(statuses)) return 1;
    return availableRank ?? 1;
  }
  if (availableRank !== null) return availableRank;
  return completedByAll ? 2 : 3;
};
