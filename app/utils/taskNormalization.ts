import type { Task } from '@/types/tarkov';
/**
 * Task Normalization Utilities
 *
 * Provides normalization functions for task-related data structures.
 */
/**
 * Normalizes objectives to always return an array.
 * Handles cases where objectives might be an object (with numeric or string keys) or already an array.
 * Filters out only null/undefined entries, preserving falsy values like 0, false, and ''.
 *
 * @param objectives - Objectives in unknown format (array, object, or other)
 * @returns Array of T, guaranteed to be an array (empty if invalid input)
 *
 * @example
 * ```ts
 * normalizeTaskObjectives([{ id: '1' }, { id: '2' }]);
 * // Returns: [{ id: '1' }, { id: '2' }]
 *
 * normalizeTaskObjectives({ 0: { id: '1' }, 1: { id: '2' } });
 * // Returns: [{ id: '1' }, { id: '2' }]
 *
 * normalizeTaskObjectives(null);
 * // Returns: []
 *
 * normalizeTaskObjectives([{ id: '1' }, null, { id: '2' }, 0]);
 * // Returns: [{ id: '1' }, { id: '2' }, 0]
 * ```
 */
export function normalizeTaskObjectives<T = unknown>(objectives: unknown): T[] {
  if (objectives == null) {
    // Null/undefined means "no data"
    return [];
  }
  if (Array.isArray(objectives)) {
    return objectives.filter((value): value is T => value != null);
  }
  if (typeof objectives === 'object') {
    return Object.values(objectives as Record<string, T>).filter(
      (value): value is T => value != null
    );
  }
  return [];
}
/** Checks whether an objective ID is shared by multiple tasks. */
function hasDuplicateObjective(counts: Map<string, number>, id: string): boolean {
  return (counts.get(id) ?? 0) > 1;
}
/** Records the task-qualified replacements used for a shared upstream objective ID. */
function recordDuplicateObjective(
  duplicates: Map<string, string[]>,
  id: string,
  newId: string
): void {
  const existing = duplicates.get(id) ?? [];
  existing.push(newId);
  duplicates.set(id, existing);
}
/** Keep persisted objective keys identical across metadata hydration and imports. */
export function dedupeTaskObjectiveIds(tasks: Task[]) {
  const objectiveCounts = new Map<string, number>();
  tasks.forEach((task) => {
    task.objectives?.forEach((objective) => {
      if (!objective?.id) return;
      objectiveCounts.set(objective.id, (objectiveCounts.get(objective.id) ?? 0) + 1);
    });
  });
  const duplicateObjectiveIds = new Map<string, string[]>();
  const updatedTasks = tasks.map((task) => {
    if (!task.objectives?.length) return task;
    let changed = false;
    const objectives = task.objectives.map((objective) => {
      if (!objective?.id) return objective;
      if (!hasDuplicateObjective(objectiveCounts, objective.id)) return objective;
      const newId = `${objective.id}:${task.id}`;
      recordDuplicateObjective(duplicateObjectiveIds, objective.id, newId);
      changed = true;
      return { ...objective, id: newId };
    });
    return changed ? { ...task, objectives } : task;
  });
  return { tasks: updatedTasks, duplicateObjectiveIds };
}
/** Read legacy shared-profile keys without mutating the owner's stored progress. */
export function projectDuplicateObjectiveProgress<T>(
  progress: Record<string, T>,
  duplicates: ReadonlyMap<string, readonly string[]>
): Record<string, T> {
  let projected = { ...progress };
  for (const [originalId, qualifiedIds] of duplicates) {
    const legacy = progress[originalId];
    if (legacy === undefined) continue;
    qualifiedIds.forEach((id) => {
      if (!Object.hasOwn(projected, id)) projected[id] = legacy;
    });
    const { [originalId]: _legacy, ...rest } = projected;
    projected = rest;
  }
  return projected;
}
