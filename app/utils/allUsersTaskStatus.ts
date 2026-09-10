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
const ALL_USERS_VIEW_PREDICATES: Record<
  Exclude<TaskSecondaryView, 'all'>,
  (statuses: readonly TeamTaskStatus[], isInvalid: boolean) => boolean
> = {
  available: (statuses, isInvalid) => !isInvalid && hasAvailableForAnyUser(statuses),
  active: (statuses) => hasActiveForAnyUser(statuses),
  failed: (statuses) => hasFailedForAnyUser(statuses),
  completed: (statuses) => isCompletedByAllUsers(statuses),
  locked: (statuses, isInvalid) => !isInvalid && isLockedForAllUsers(statuses),
};
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
): boolean => ALL_USERS_VIEW_PREDICATES[view](statuses, isInvalid);
export const TRADER_SORT_RANK = {
  available: 0,
  inProgress: 1,
  completed: 2,
  failed: 3,
  notApplicable: 4,
} as const;
const availableRankOr = (
  statuses: readonly TeamTaskStatus[],
  isInvalid: boolean,
  fallback: number
): number =>
  !isInvalid && hasAvailableForAnyUser(statuses) ? TRADER_SORT_RANK.available : fallback;
/**
 * Ranks a task for the all-users trader grouping.
 *
 * Ordering is available, then active or locked, then completed, then failed.
 * Classification keeps the same precedence the counts use — failed and
 * completed outrank active, and active outranks merely being available to a
 * different teammate — so a task active for any teammate is never grouped with
 * the available tasks.
 */
export const getAllUsersTraderRank = (
  statuses: readonly TeamTaskStatus[],
  isInvalid: boolean
): number => {
  if (isCompletedByAllUsers(statuses)) {
    return availableRankOr(statuses, isInvalid, TRADER_SORT_RANK.completed);
  }
  if (hasFailedForAnyUser(statuses)) {
    return availableRankOr(statuses, isInvalid, TRADER_SORT_RANK.failed);
  }
  if (hasActiveForAnyUser(statuses)) return TRADER_SORT_RANK.inProgress;
  return availableRankOr(statuses, isInvalid, TRADER_SORT_RANK.inProgress);
};
export type UserTraderRankState = {
  isUnlocked: boolean;
  isActive: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  isInvalid: boolean;
};
const USER_TRADER_RANK_RULES: readonly {
  rank: number;
  matches: (state: UserTraderRankState) => boolean;
}[] = [
  {
    rank: TRADER_SORT_RANK.completed,
    matches: ({ isCompleted, isFailed }) => isCompleted && !isFailed,
  },
  { rank: TRADER_SORT_RANK.failed, matches: ({ isFailed }) => isFailed },
  { rank: TRADER_SORT_RANK.inProgress, matches: ({ isActive }) => isActive },
  {
    rank: TRADER_SORT_RANK.available,
    matches: ({ isUnlocked, isInvalid }) => isUnlocked && !isInvalid,
  },
];
/** Single-user counterpart of `getAllUsersTraderRank`; locked falls through to in-progress. */
export const getUserTraderRank = (state: UserTraderRankState): number =>
  USER_TRADER_RANK_RULES.find(({ matches }) => matches(state))?.rank ?? TRADER_SORT_RANK.inProgress;
