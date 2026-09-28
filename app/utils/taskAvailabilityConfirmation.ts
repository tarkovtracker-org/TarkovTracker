import type { TaskAvailabilityConfirmation, UserProgressData } from '@/types/progress';
import type { RawTaskCompletion } from '@/utils/taskStatus';
type ConfirmationMap = NonNullable<UserProgressData['taskAvailability']>;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const toTimestamp = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
const sanitizeConfirmation = (value: unknown): TaskAvailabilityConfirmation | undefined => {
  if (!isRecord(value) || typeof value.requirements !== 'string') return undefined;
  const timestamp = toTimestamp(value.timestamp);
  return timestamp === undefined ? undefined : { requirements: value.requirements, timestamp };
};
/** Drops malformed entries; a clear (empty `requirements`) is kept as a merge tombstone. */
export const sanitizeTaskAvailabilityMap = (value: unknown): ConfirmationMap => {
  if (!isRecord(value)) return {};
  const sanitized: ConfirmationMap = {};
  for (const [taskId, entry] of Object.entries(value)) {
    const confirmation = sanitizeConfirmation(entry);
    if (taskId && confirmation) sanitized[taskId] = confirmation;
  }
  return sanitized;
};
const newerConfirmation = (
  local: TaskAvailabilityConfirmation | undefined,
  remote: TaskAvailabilityConfirmation | undefined
) => {
  if (!local || !remote) return local ?? remote;
  return remote.timestamp >= local.timestamp ? remote : local;
};
/** Last write wins per task, on the confirmation's own clock, independent of task status. */
export const mergeTaskAvailability = (
  local: UserProgressData['taskAvailability'],
  remote: UserProgressData['taskAvailability']
): ConfirmationMap => {
  const safeLocal = sanitizeTaskAvailabilityMap(local);
  const safeRemote = sanitizeTaskAvailabilityMap(remote);
  const merged: ConfirmationMap = {};
  for (const taskId of new Set([...Object.keys(safeLocal), ...Object.keys(safeRemote)])) {
    const winner = newerConfirmation(safeLocal[taskId], safeRemote[taskId]);
    if (winner) merged[taskId] = { ...winner };
  }
  return merged;
};
const statusTimestamp = (completion: RawTaskCompletion): number =>
  isRecord(completion) ? (toTimestamp(completion.timestamp) ?? 0) : 0;
/**
 * A confirmation counts only for the exact requirement signature and only while it is not older
 * than the task's last status change, so a reset, completion, failure or repair on any device
 * retires it without having to rewrite the confirmation store.
 */
export const isAvailabilityConfirmed = (
  confirmation: TaskAvailabilityConfirmation | undefined,
  completion: RawTaskCompletion,
  signature: string | undefined
): boolean => {
  if (!signature || confirmation?.requirements !== signature) return false;
  return confirmation.timestamp >= statusTimestamp(completion);
};
