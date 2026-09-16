import type { GameEdition } from '@/types/tarkov';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const optionalIds = (value: unknown): boolean =>
  value === undefined || (Array.isArray(value) && value.every((id) => typeof id === 'string'));
const nonemptyTitle = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;
/** Validate the complete catalog record before replacing a last-good edition. */
export function isGameEdition(value: unknown): value is GameEdition {
  if (!isRecord(value)) return false;
  return [
    nonemptyTitle(value.id),
    nonemptyTitle(value.title),
    ['value', 'defaultStashLevel', 'defaultCultistCircleLevel'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0
    ),
    isRecord(value.traderRepBonus) &&
      Object.values(value.traderRepBonus).every(
        (bonus) => typeof bonus === 'number' && Number.isFinite(bonus)
      ),
    optionalIds(value.exclusiveTaskIds),
    optionalIds(value.excludedTaskIds),
  ].every(Boolean);
}
/**
 * Check if a task is available for a given edition.
 * A task is NOT available if:
 * 1. It's explicitly excluded from the user's edition (excludedTaskIds)
 * 2. It's exclusive to another edition and not to the user's edition (exclusiveTaskIds)
 *
 * @param taskId - The task ID to check
 * @param userEditionValue - The user's edition value (numeric)
 * @param editions - Array of all game editions with their task restrictions
 * @returns true if the task is available for the user's edition
 */
export function isTaskAvailableForEdition(
  taskId: string,
  userEditionValue: number | undefined,
  editions: GameEdition[]
): boolean {
  if (userEditionValue == null || !editions.length) return true;
  const userEdition = editions.find((e) => e.value === userEditionValue);
  if (!userEdition) return true;
  // Check if task is explicitly excluded from this edition
  if (userEdition.excludedTaskIds?.includes(taskId)) {
    return false;
  }
  // Check if task is exclusive to another edition
  for (const edition of editions) {
    if (edition.value !== userEditionValue && edition.exclusiveTaskIds?.includes(taskId)) {
      // Task is exclusive to another edition, check if user's edition also has it
      if (!userEdition.exclusiveTaskIds?.includes(taskId)) {
        return false;
      }
    }
  }
  return true;
}
/**
 * Get the editions that a task is exclusive to.
 * Returns an array of editions that have this task in their exclusiveTaskIds.
 *
 * @param taskId - The task ID to check
 * @param editions - Array of all game editions with their task restrictions
 * @returns Array of editions that have this task as exclusive
 */
export function getExclusiveEditionsForTask(
  taskId: string,
  editions: GameEdition[]
): GameEdition[] {
  if (!editions.length) return [];
  return editions.filter((edition) => edition.exclusiveTaskIds?.includes(taskId));
}
/**
 * Get all task IDs that should be excluded for a given edition.
 * This includes:
 * 1. Tasks that are exclusive to OTHER editions (not available to this edition)
 * 2. Tasks that are explicitly excluded from this edition
 *
 * @param userEditionValue - The user's edition value (numeric)
 * @param editions - Array of all game editions with their task restrictions
 * @returns Set of task IDs that should be filtered out
 */
export function getExcludedTaskIdsForEdition(
  userEditionValue: number | undefined,
  editions: GameEdition[]
): Set<string> {
  const excludedIds = new Set<string>();
  if (userEditionValue == null || !editions.length) return excludedIds;
  const userEdition = editions.find((e) => e.value === userEditionValue);
  if (!userEdition) return excludedIds;
  // Add tasks that are explicitly excluded from this edition
  if (userEdition.excludedTaskIds?.length) {
    userEdition.excludedTaskIds.forEach((id) => excludedIds.add(id));
  }
  // Add tasks that are exclusive to OTHER editions (not available to this edition)
  editions.forEach((edition) => {
    if (edition.value !== userEditionValue && edition.exclusiveTaskIds?.length) {
      edition.exclusiveTaskIds.forEach((id) => excludedIds.add(id));
    }
  });
  // Remove tasks that are exclusive to THIS edition (they should be available)
  if (userEdition.exclusiveTaskIds?.length) {
    userEdition.exclusiveTaskIds.forEach((id) => excludedIds.delete(id));
  }
  return excludedIds;
}
