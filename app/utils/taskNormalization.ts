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
