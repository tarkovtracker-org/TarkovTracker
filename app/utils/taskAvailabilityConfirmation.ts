import type { TaskAvailabilityConfirmation, UserProgressData } from '@/types/progress';
import type { RawTaskCompletion } from '@/utils/taskStatus';
export type ConfirmationMap = NonNullable<UserProgressData['taskAvailability']>;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
/**
 * Confirmation clocks are epoch milliseconds advanced with `+ 1`. Anything after 3000-01-01 is
 * corrupt; the migration's `merge_task_availability` uses the same ceiling. Writers clamp to it
 * (see `nextClock`), so every value they produce stays persistable, and a confirmation at the
 * ceiling is a saturated clock that can no longer be ordered, so it never counts (fail closed).
 */
export const MAX_CONFIRMATION_TIMESTAMP = 32_503_680_000_000;
/** The next logical clock value after every given clock, clamped to the persistable ceiling. */
export const nextClock = (...clocks: number[]): number =>
  Math.min(MAX_CONFIRMATION_TIMESTAMP, Math.max(Date.now(), ...clocks.map((clock) => clock + 1)));
const toTimestamp = (value: unknown): number | undefined =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_CONFIRMATION_TIMESTAMP
    ? Math.trunc(value)
    : undefined;
/** Map bounds shared with `merge_task_availability` (migration 20261001190000). */
const MAX_TASK_ID_LENGTH = 64;
const MAX_REQUIREMENTS_LENGTH = 4096;
const MAX_CONFIRMATIONS = 1000;
const MAX_CONFIRMATION_BYTES = 262_144;
const encoder = new TextEncoder();
/** Code-point length above `max`, as PostgreSQL `char_length` counts, without spreading huge strings. */
const exceedsLength = (value: string, max: number): boolean =>
  value.length > max && (value.length > 2 * max || [...value].length > max);
/** PostgreSQL `jsonb` rejects NUL and lone surrogates, which could block every later sync. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const hasInvalidJsonbCharacters = (value: string): boolean =>
  value.includes('\u0000') || LONE_SURROGATE.test(value);
const sanitizeConfirmation = (value: unknown): TaskAvailabilityConfirmation | undefined => {
  if (!isRecord(value) || typeof value.requirements !== 'string') return undefined;
  if (exceedsLength(value.requirements, MAX_REQUIREMENTS_LENGTH)) return undefined;
  if (hasInvalidJsonbCharacters(value.requirements)) return undefined;
  const timestamp = toTimestamp(value.timestamp);
  return timestamp === undefined ? undefined : { requirements: value.requirements, timestamp };
};
const isValidTaskId = (taskId: string): boolean =>
  taskId.length > 0 &&
  !exceedsLength(taskId, MAX_TASK_ID_LENGTH) &&
  !hasInvalidJsonbCharacters(taskId);
/** PostgreSQL C collation orders UTF-8 by code point; JavaScript orders UTF-16 code units. */
const compareTaskIds = (leftId: string, rightId: string): number => {
  const left = Array.from(leftId);
  const right = Array.from(rightId);
  const index = left.findIndex((point, position) => point !== right[position]);
  if (index < 0) return left.length - right.length;
  return left[index]!.codePointAt(0)! - (right[index]?.codePointAt(0) ?? -1);
};
const newestFirst = (
  [leftId, left]: [string, TaskAvailabilityConfirmation],
  [rightId, right]: [string, TaskAvailabilityConfirmation]
): number => right.timestamp - left.timestamp || compareTaskIds(leftId, rightId);
/** Keeps the newest entries within the entry and byte budget, like the database merge. */
const boundConfirmations = (entries: [string, TaskAvailabilityConfirmation][]): ConfirmationMap => {
  const bounded: [string, TaskAvailabilityConfirmation][] = [];
  let bytes = 0;
  for (const [taskId, confirmation] of entries.sort(newestFirst).slice(0, MAX_CONFIRMATIONS)) {
    bytes += encoder.encode(taskId).length + encoder.encode(confirmation.requirements).length;
    if (bytes > MAX_CONFIRMATION_BYTES) break;
    bounded.push([taskId, confirmation]);
  }
  return Object.fromEntries(bounded);
};
const validatedOwnConfirmation = (value: Record<string, unknown>, taskId: string) => {
  if (!Object.hasOwn(value, taskId)) return undefined;
  const confirmation = sanitizeConfirmation(value[taskId]);
  return confirmation && isValidTaskId(taskId) ? confirmation : undefined;
};
/** Validates candidates without evicting a possible per-task merge winner. */
function* validatedConfirmations(
  value: unknown
): Generator<[string, TaskAvailabilityConfirmation]> {
  if (!isRecord(value)) return;
  for (const taskId in value) {
    const confirmation = validatedOwnConfirmation(value, taskId);
    if (confirmation) yield [taskId, confirmation];
  }
}
/**
 * Temporary reconciliation evidence: field-valid and count-bounded, without byte eviction.
 * A source entry below its first 1000 has 1000 distinct IDs ahead of it. Per-ID maximum
 * timestamps cannot move those IDs behind it, so it cannot enter the merged first 1000.
 */
export const taskAvailabilityCandidates = (value: unknown): ConfirmationMap => {
  const entries: [string, TaskAvailabilityConfirmation][] = [];
  for (const entry of validatedConfirmations(value)) {
    entries.push(entry);
    // Repeated top-K selection bounds intermediate allocations too.
    if (entries.length === 2 * MAX_CONFIRMATIONS)
      entries.sort(newestFirst).length = MAX_CONFIRMATIONS;
  }
  return Object.fromEntries(entries.sort(newestFirst).slice(0, MAX_CONFIRMATIONS));
};
/** Drops malformed entries; a clear (empty `requirements`) is kept as a merge tombstone. */
export const sanitizeTaskAvailabilityMap = (value: unknown): ConfirmationMap =>
  boundConfirmations(Object.entries(taskAvailabilityCandidates(value)));
const newerConfirmation = (
  local: TaskAvailabilityConfirmation | undefined,
  remote: TaskAvailabilityConfirmation | undefined
) => {
  if (!local || !remote) return local ?? remote;
  return remote.timestamp >= local.timestamp ? remote : local;
};
/** Last write wins per task, on the confirmation's own clock, independent of task status. */
export const mergeTaskAvailabilityCandidates = (
  local: UserProgressData['taskAvailability'],
  remote: UserProgressData['taskAvailability']
): ConfirmationMap => {
  const safeLocal = taskAvailabilityCandidates(local);
  const safeRemote = taskAvailabilityCandidates(remote);
  const merged: [string, TaskAvailabilityConfirmation][] = [];
  for (const taskId of new Set([...Object.keys(safeLocal), ...Object.keys(safeRemote)])) {
    const winner = newerConfirmation(
      Object.hasOwn(safeLocal, taskId) ? safeLocal[taskId] : undefined,
      Object.hasOwn(safeRemote, taskId) ? safeRemote[taskId] : undefined
    )!;
    merged.push([taskId, { ...winner }]);
  }
  return Object.fromEntries(merged.sort(newestFirst).slice(0, MAX_CONFIRMATIONS));
};
/** Select per-task winners before imposing the final byte budget. */
export const mergeTaskAvailability = (
  local: UserProgressData['taskAvailability'],
  remote: UserProgressData['taskAvailability']
): ConfirmationMap => sanitizeTaskAvailabilityMap(mergeTaskAvailabilityCandidates(local, remote));
/**
 * Status clocks are not capped, so any finite value counts as-is: an out-of-range status clock is
 * newer than every valid confirmation and retires it rather than reading as absent.
 */
const statusTimestamp = (completion: RawTaskCompletion): number => {
  const value = isRecord(completion) ? completion.timestamp : undefined;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};
/** A status clock a confirmation can never follow (corrupt data beyond the ceiling). */
export const hasUnconfirmableStatusClock = (completion: RawTaskCompletion): boolean =>
  statusTimestamp(completion) >= MAX_CONFIRMATION_TIMESTAMP;
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
  if (confirmation.timestamp >= MAX_CONFIRMATION_TIMESTAMP) return false;
  return confirmation.timestamp >= statusTimestamp(completion);
};
