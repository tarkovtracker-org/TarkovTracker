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
  for (const taskId of Object.keys(remoteTasks)) {
    const localTask = localTasks[taskId] as RawTaskCompletion;
    const remoteTask = remoteTasks[taskId] as RawTaskCompletion;
    if (
      localTask !== undefined &&
      localTask !== null &&
      remoteTask !== undefined &&
      remoteTask !== null
    ) {
      const localFlags = getCompletionFlags(localTask);
      const remoteFlags = getCompletionFlags(remoteTask);
      if (
        localFlags.complete !== remoteFlags.complete ||
        localFlags.failed !== remoteFlags.failed
      ) {
        conflictCount++;
      }
    }
  }
  const localObjectives = local.taskObjectives || {};
  const remoteObjectives = remote.taskObjectives || {};
  for (const objId of Object.keys(remoteObjectives)) {
    const localObj = localObjectives[objId];
    const remoteObj = remoteObjectives[objId];
    if (localObj && remoteObj) {
      if (
        (localObj.count ?? 0) !== (remoteObj.count ?? 0) ||
        (localObj.complete ?? false) !== (remoteObj.complete ?? false)
      ) {
        conflictCount++;
      }
    }
  }
  const localModules = local.hideoutModules || {};
  const remoteModules = remote.hideoutModules || {};
  for (const modId of Object.keys(remoteModules)) {
    const localMod = localModules[modId];
    const remoteMod = remoteModules[modId];
    if (localMod && remoteMod && (localMod.complete ?? false) !== (remoteMod.complete ?? false)) {
      conflictCount++;
    }
  }
  const localParts = local.hideoutParts || {};
  const remoteParts = remote.hideoutParts || {};
  for (const partId of Object.keys(remoteParts)) {
    const localPart = localParts[partId];
    const remotePart = remoteParts[partId];
    if (localPart && remotePart) {
      if (
        (localPart.count ?? 0) !== (remotePart.count ?? 0) ||
        (localPart.complete ?? false) !== (remotePart.complete ?? false)
      ) {
        conflictCount++;
      }
    }
  }
  return { hasConflict: conflictCount > 0, conflictCount };
}
