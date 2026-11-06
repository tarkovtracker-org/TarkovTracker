import { getCompletionFlags } from '@/utils/taskStatus';
import type { UserProgressData } from '@/stores/progressState';
type TaskCompletion = UserProgressData['taskCompletions'][string];
type ObjectiveProgress = UserProgressData['taskObjectives'][string];
// Unknown acceptance agrees with explicit false; only true is authoritative acceptance.
const recordedAcceptance = (completion: TaskCompletion | undefined) => completion?.active === true;
const taskEntriesConflict = (
  local: TaskCompletion | undefined,
  remote: TaskCompletion | undefined
) => {
  const localFlags = getCompletionFlags(local);
  const remoteFlags = getCompletionFlags(remote);
  return (
    localFlags.complete !== remoteFlags.complete ||
    localFlags.failed !== remoteFlags.failed ||
    recordedAcceptance(local) !== recordedAcceptance(remote)
  );
};
const objectiveCount = (entry: ObjectiveProgress | undefined) => entry?.count ?? 0;
const completedValue = (entry: { complete?: boolean } | undefined) => entry?.complete ?? false;
const objectiveEntriesConflict = (
  local: ObjectiveProgress | undefined,
  remote: ObjectiveProgress | undefined
) =>
  objectiveCount(local) !== objectiveCount(remote) ||
  completedValue(local) !== completedValue(remote);
const moduleEntriesConflict = (
  local: { complete?: boolean } | undefined,
  remote: { complete?: boolean } | undefined
) => completedValue(local) !== completedValue(remote);
const countEntryConflicts = <T>(
  local: Record<string, T> | undefined,
  remote: Record<string, T> | undefined,
  differs: (local: T | undefined, remote: T | undefined) => boolean
): number => {
  const localEntries = local || {};
  const remoteEntries = remote || {};
  const ids = new Set([...Object.keys(localEntries), ...Object.keys(remoteEntries)]);
  return [...ids].filter((id) => differs(localEntries[id], remoteEntries[id])).length;
};
export function detectDataConflicts(
  local: UserProgressData | undefined,
  remote: UserProgressData | undefined
): { hasConflict: boolean; conflictCount: number } {
  if (!local || !remote) return { hasConflict: false, conflictCount: 0 };
  const conflictCount =
    countEntryConflicts(local.taskCompletions, remote.taskCompletions, taskEntriesConflict) +
    countEntryConflicts(local.taskObjectives, remote.taskObjectives, objectiveEntriesConflict) +
    countEntryConflicts(local.hideoutModules, remote.hideoutModules, moduleEntriesConflict) +
    countEntryConflicts(local.hideoutParts, remote.hideoutParts, objectiveEntriesConflict);
  return { hasConflict: conflictCount > 0, conflictCount };
}
