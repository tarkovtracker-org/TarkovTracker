import { isTaskAvailableForEdition } from '@/utils/editionHelpers';
import type { GameEdition, Task } from '@/types/tarkov';
export type RawTaskCompletion =
  | { complete?: boolean; failed?: boolean; timestamp?: number; manual?: boolean }
  | boolean
  | null
  | undefined;
export type TaskStatusResult = 'completed' | 'failed' | 'incomplete';
export interface TaskRelevanceOptions {
  faction: string;
  gameEditionValue: number | undefined;
  editions: GameEdition[];
  prestigeLevel?: number;
  prestigeTaskMap?: Map<string, number>;
}
export function getCompletionFlags(completion: RawTaskCompletion): {
  complete: boolean;
  failed: boolean;
} {
  if (typeof completion === 'boolean') {
    return { complete: completion, failed: false };
  }
  return {
    complete: completion?.complete === true,
    failed: completion?.failed === true,
  };
}
/**
 * Checks if a task is complete (not failed).
 * Note: A task with both complete:true and failed:true is treated as failed,
 * so this returns false in that edge case. Failed takes precedence.
 */
export function isTaskComplete(completion?: RawTaskCompletion): boolean {
  const flags = getCompletionFlags(completion);
  return flags.complete && !flags.failed;
}
/**
 * Checks if a task is failed.
 * Note: Failed takes precedence - a {complete:true, failed:true} state is treated as failed.
 */
export function isTaskFailed(completion?: RawTaskCompletion): boolean {
  return getCompletionFlags(completion).failed;
}
/**
 * Checks if a task is actively in progress (started but not completed or failed).
 * Returns false for:
 * - undefined/null: No completion record exists (task not started)
 * - false: Task exists but explicitly not started
 * - Completed tasks (isTaskComplete returns true)
 * - Failed tasks (isTaskFailed returns true)
 * @see isTaskComplete for checking task completion
 * @see isTaskFailed for checking task failure
 */
export function isTaskActive(completion?: RawTaskCompletion): boolean {
  if (!completion) return false;
  return !isTaskComplete(completion) && !isTaskFailed(completion);
}
export function getTaskStatusFromFlags(completion?: RawTaskCompletion): TaskStatusResult {
  const flags = getCompletionFlags(completion);
  if (flags.failed) return 'failed';
  if (flags.complete) return 'completed';
  return 'incomplete';
}
/**
 * Checks if a task is relevant for a user based on faction, game edition, and prestige level.
 */
export function isTaskRelevant(task: Task, options: TaskRelevanceOptions): boolean {
  // Check faction compatibility
  const taskFaction = task.factionName ?? 'Any';
  if (taskFaction !== 'Any' && taskFaction !== options.faction) {
    return false;
  }
  // Check game edition availability
  if (!isTaskAvailableForEdition(task.id, options.gameEditionValue, options.editions)) {
    return false;
  }
  // Check prestige level compatibility if maps and levels are specified
  if (options.prestigeTaskMap && options.prestigeLevel !== undefined) {
    if (options.prestigeTaskMap.has(task.id)) {
      const taskPrestigeLevel = options.prestigeTaskMap.get(task.id);
      if (taskPrestigeLevel !== options.prestigeLevel) {
        return false;
      }
    }
  }
  return true;
}
/**
 * Checks if a task should be counted towards progression totals.
 * Completed tasks always count. Failed tasks and invalid tasks do not count.
 */
export function isTaskCounted(completion: RawTaskCompletion, isInvalid: boolean): boolean {
  const flags = getCompletionFlags(completion);
  if (flags.complete && !flags.failed) {
    return true;
  }
  if (flags.failed) {
    return false;
  }
  return !isInvalid;
}
