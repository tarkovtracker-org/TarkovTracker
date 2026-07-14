/**
 * Objective Type Inferrer
 *
 * Infers objective types from descriptions and properties.
 * Used to determine the correct type for overlay objective entries.
 */
import { isPlainObject } from './deepMerge';
/** Prefix-to-type mapping for objective inference (ordered by length descending for correct startsWith matching) */
const OBJECTIVE_TYPE_PREFIXES: Array<{ prefix: string; type: string }> = [
  { prefix: 'find and hand over', type: 'giveItem' },
  { prefix: 'locate and mark', type: 'mark' },
  { prefix: 'eliminate', type: 'shoot' },
  { prefix: 'hand over', type: 'giveItem' },
  { prefix: 'launch', type: 'useItem' },
  { prefix: 'locate', type: 'visit' },
  { prefix: 'stash', type: 'plantItem' },
  { prefix: 'plant', type: 'plantItem' },
  { prefix: 'place', type: 'plantItem' },
  { prefix: 'recon', type: 'visit' },
  { prefix: 'drink', type: 'useItem' },
  { prefix: 'mark', type: 'mark' },
  { prefix: 'find', type: 'findItem' },
  { prefix: 'eat', type: 'useItem' },
  { prefix: 'use', type: 'useItem' },
];
/**
 * Check if a marker item has valid properties.
 * Valid if it has a non-empty id, type, or position with x/y/z coordinates.
 */
function hasValidMarkerItem(entry: Record<string, unknown>): boolean {
  if (!isPlainObject(entry.markerItem)) return false;
  const markerItem = entry.markerItem;
  // Check for valid id (non-empty string)
  const markerId = markerItem.id;
  if (typeof markerId === 'string' && markerId.trim().length > 0) return true;
  // Check for valid type (non-empty string)
  const markerType = markerItem.type;
  if (typeof markerType === 'string' && markerType.trim().length > 0) return true;
  // Check for valid position (object with finite numeric x, y, z)
  const position = markerItem.position;
  if (isPlainObject(position)) {
    const x = position.x;
    const y = position.y;
    const z = position.z;
    const hasValidX = typeof x === 'number' && Number.isFinite(x);
    const hasValidY = typeof y === 'number' && Number.isFinite(y);
    const hasValidZ = typeof z === 'number' && Number.isFinite(z);
    if (hasValidX && hasValidY && hasValidZ) return true;
  }
  return false;
}
/**
 * Infer whether an objective requires found-in-raid items.
 * Returns explicit value if set, otherwise checks description for keywords.
 */
export function inferFoundInRaid(description: string, entry: Record<string, unknown>): boolean {
  if (typeof entry.foundInRaid === 'boolean') {
    return entry.foundInRaid;
  }
  return description.toLowerCase().includes('found in raid');
}
/**
 * Infer the objective type from entry properties and description.
 *
 * Priority:
 * 1. Explicit type if already set
 * 2. 'mark' if valid markerItem exists
 * 3. Type inferred from description prefix
 * 4. Undefined if no inference possible
 */
export function inferObjectiveType(entry: Record<string, unknown>): string | undefined {
  // Return explicit type if already set
  if (typeof entry.type === 'string' && entry.type.length > 0) {
    return entry.type;
  }
  // Check for valid marker item
  if (hasValidMarkerItem(entry)) {
    return 'mark';
  }
  // Infer from description
  const description = typeof entry.description === 'string' ? entry.description.trim() : '';
  const lower = description.toLowerCase();
  for (const { prefix, type } of OBJECTIVE_TYPE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      // Adjust type for quest item variants
      if (type === 'plantItem' && isPlainObject(entry.questItem)) {
        return 'plantQuestItem';
      }
      if (type === 'giveItem' && isPlainObject(entry.questItem)) {
        return 'giveQuestItem';
      }
      if (type === 'findItem' && isPlainObject(entry.questItem)) {
        return 'findQuestItem';
      }
      return type;
    }
  }
  return undefined;
}
/**
 * Normalize an objective entry with inferred type and foundInRaid.
 */
function normalizeObjectiveEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const description = typeof entry.description === 'string' ? entry.description : '';
  const inferred = inferObjectiveType(entry);
  const trimmed = typeof inferred === 'string' ? inferred.trim() : '';
  const type = trimmed.length > 0 ? trimmed : undefined;
  const foundInRaid = inferFoundInRaid(description, entry);
  return { ...entry, ...(type ? { type } : {}), foundInRaid };
}
/**
 * Normalize a list of objectives.
 */
export function normalizeObjectiveList(list: unknown): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((entry) => (isPlainObject(entry) ? normalizeObjectiveEntry(entry) : entry));
}
