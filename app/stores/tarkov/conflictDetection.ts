import { getCompletionFlags, type RawTaskCompletion } from '@/utils/taskStatus';
import type { UserProgressData } from '@/stores/progressState';
export function detectDataConflicts(
  local: UserProgressData | undefined,
  remote: UserProgressData | undefined
): { hasConflict: boolean; conflictCount: number } {
  if (!local || !remote) return { hasConflict: false, conflictCount: 0 };
  let conflictCount = 0;
  const localTasks = local.taskCompletions || {};
  const remoteTasks = remote.taskCompletions || {};
  const taskIds = new Set([...Object.keys(localTasks), ...Object.keys(remoteTasks)]);
  for (const taskId of taskIds) {
    const localFlags = getCompletionFlags(localTasks[taskId] as RawTaskCompletion);
    const remoteFlags = getCompletionFlags(remoteTasks[taskId] as RawTaskCompletion);
    if (localFlags.complete !== remoteFlags.complete || localFlags.failed !== remoteFlags.failed) {
      conflictCount++;
    }
  }
  const localObjectives = local.taskObjectives || {};
  const remoteObjectives = remote.taskObjectives || {};
  const objectiveIds = new Set([...Object.keys(localObjectives), ...Object.keys(remoteObjectives)]);
  for (const objId of objectiveIds) {
    const localObj = localObjectives[objId];
    const remoteObj = remoteObjectives[objId];
    if (
      (localObj?.count ?? 0) !== (remoteObj?.count ?? 0) ||
      (localObj?.complete ?? false) !== (remoteObj?.complete ?? false)
    ) {
      conflictCount++;
    }
  }
  const localModules = local.hideoutModules || {};
  const remoteModules = remote.hideoutModules || {};
  const moduleIds = new Set([...Object.keys(localModules), ...Object.keys(remoteModules)]);
  for (const modId of moduleIds) {
    const localMod = localModules[modId];
    const remoteMod = remoteModules[modId];
    if ((localMod?.complete ?? false) !== (remoteMod?.complete ?? false)) {
      conflictCount++;
    }
  }
  const localParts = local.hideoutParts || {};
  const remoteParts = remote.hideoutParts || {};
  const partIds = new Set([...Object.keys(localParts), ...Object.keys(remoteParts)]);
  for (const partId of partIds) {
    const localPart = localParts[partId];
    const remotePart = remoteParts[partId];
    if (
      (localPart?.count ?? 0) !== (remotePart?.count ?? 0) ||
      (localPart?.complete ?? false) !== (remotePart?.complete ?? false)
    ) {
      conflictCount++;
    }
  }
  return { hasConflict: conflictCount > 0, conflictCount };
}
