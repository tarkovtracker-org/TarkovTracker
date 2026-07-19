/**
 * Deep Merge Utility
 *
 * Provides immutable deep merging of objects with special handling for:
 * - Nested plain objects (recursive merge)
 * - ID-keyed patches into arrays of objects
 * - Primitive value replacement
 */
/**
 * Check if a value is a plain object (not null, not array)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
/**
 * Type guard to check if a value is an array of objects with ID properties.
 * Returns true for arrays where every element is a plain object containing an 'id'.
 */
function isIdKeyedArray(value: unknown): value is Array<Record<string, unknown> & { id: unknown }> {
  return Array.isArray(value) && value.every((item) => isPlainObject(item) && 'id' in item);
}
/**
 * Merge ID-keyed patches into an array of entities without mutating the original array.
 *
 * Iterates the target array and, for each element with an `id`, deep-merges a plain-object
 * patch from sourcePatches[id]; non-object patches (including arrays) and non-entity elements
 * are left unchanged. Returns a new array with merged results.
 *
 * @param sourcePatches - Object containing patches keyed by entity ID
 * @param targetArray - Array of entities to apply patches to
 * @returns New array with patches applied
 */
function mergeArrayByIdPatches(
  sourcePatches: Record<string, unknown>,
  targetArray: unknown[]
): unknown[] {
  return targetArray.map((item) => {
    if (isPlainObject(item) && 'id' in item) {
      const itemId = item.id;
      // Guard against undefined/null IDs and coerce to string for object key lookup
      if (itemId != null) {
        const patch = sourcePatches[String(itemId)];
        if (isPlainObject(patch)) {
          return deepMerge(item as Record<string, unknown>, patch as Record<string, unknown>);
        }
      }
    }
    return item;
  });
}
/**
 * Deep merge utility that recursively merges objects without mutation.
 *
 * Merge rules:
 * 1. Source object + target object = recursive merge
 * 2. Source object + target array of objects with IDs = merge by ID patches
 * 3. All other cases = source value replaces target value
 *
 * @param target - The base object
 * @param source - The object to merge into target
 * @returns New merged object
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      // Recursively merge nested objects
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else if (isPlainObject(sourceValue) && isIdKeyedArray(targetValue)) {
      // Special case: merge ID-keyed object patches into array of objects
      result[key] = mergeArrayByIdPatches(sourceValue, targetValue);
    } else {
      // Replace primitive values, arrays, or when target doesn't have the key
      result[key] = sourceValue;
    }
  }
  return result as T;
}
