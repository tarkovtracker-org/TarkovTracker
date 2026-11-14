/**
 * Layers panel rows whose visibility is remembered across refreshes and page changes. Task rows
 * (Regular, Pinned, Team) already persist through their own preferences.
 */
const SAVED_MAP_LAYER_KEYS = ['pmc', 'scav', 'shared', 'coop', 'transit', 'spawns'] as const;
export type SavedMapLayerKey = (typeof SAVED_MAP_LAYER_KEYS)[number];
/** Only rows the user changed are stored; a missing row follows its default. */
export type SavedMapLayerVisibility = Partial<Record<SavedMapLayerKey, boolean>>;
/** Extract rows, which **Show Extracts by Default** controls until the user changes them. */
export const EXTRACT_LAYER_KEYS: readonly SavedMapLayerKey[] = ['pmc', 'scav', 'shared', 'coop'];
const KEY_SET = new Set<string>(SAVED_MAP_LAYER_KEYS);
export const isSavedMapLayerKey = (key: string): key is SavedMapLayerKey => KEY_SET.has(key);
/** Keeps known rows with boolean values; anything else in saved storage is dropped. */
export function normalizeSavedMapLayerVisibility(value: unknown): SavedMapLayerVisibility {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, visible]) => isSavedMapLayerKey(key) && typeof visible === 'boolean'
    )
  ) as SavedMapLayerVisibility;
}
