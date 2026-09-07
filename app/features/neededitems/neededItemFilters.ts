import { fuzzyMatch } from '@/utils/fuzzySearch';
import type { NeededItemHideoutModule, NeededItemTaskObjective, TarkovItem } from '@/types/tarkov';
/**
 * Type guard to check if a needed item has needType === 'taskObjective'.
 */
function isNeededItemTaskObjective(
  need: NeededItemTaskObjective | NeededItemHideoutModule
): need is NeededItemTaskObjective {
  return need.needType === 'taskObjective';
}
/**
 * Extracts the item ID from a needed item (task objective or hideout module).
 * Handles both regular items and marker items for task objectives.
 * Falls back to markerItem if item exists but has no valid id (mirrors getNeededItemData).
 */
export const getNeededItemId = (
  need: NeededItemTaskObjective | NeededItemHideoutModule
): string | undefined => {
  // Check item exists and has a valid id; otherwise fall back to markerItem
  if (need.item?.id) {
    return need.item.id;
  }
  const fallbackItem = isNeededItemTaskObjective(need) ? need.markerItem : undefined;
  return fallbackItem?.id;
};
/**
 * Extracts the item data object from a needed item.
 * Returns either the item or markerItem for task objectives.
 * Falls back to markerItem if item exists but has no valid id.
 */
export const getNeededItemData = (
  need: NeededItemTaskObjective | NeededItemHideoutModule
): TarkovItem | undefined => {
  // Check item exists and has a valid id; otherwise fall back to markerItem
  if (need.item?.id) {
    return need.item;
  }
  return isNeededItemTaskObjective(need) ? need.markerItem : undefined;
};
const fuzzyMatchesQuery = (
  name: string | undefined,
  shortName: string | undefined,
  query: string
): boolean => fuzzyMatch(name ?? '', query) || fuzzyMatch(shortName ?? '', query);
const acceptedItemMatchesQuery = (item: TarkovItem | undefined, query: string): boolean => {
  if (!item) return false;
  return fuzzyMatchesQuery(item.name, item.shortName, query);
};
/**
 * Returns the index of the first accepted item whose name or short name fuzzy
 * matches the query, or -1 when the query is empty or nothing matches.
 *
 * Used so pooled "any of these" objectives surface when searching for any
 * valid turn-in item, and so the matched item can be pinned for display.
 */
export const findAcceptedItemMatchIndex = (
  items: readonly (TarkovItem | undefined)[] | undefined,
  query: string
): number => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || !items?.length) return -1;
  return items.findIndex((entry) => acceptedItemMatchesQuery(entry, normalizedQuery));
};
const isSpecialEquipmentText = (value: string): boolean => {
  const lower = value.toLowerCase();
  return lower.includes('special') && lower.includes('equipment');
};
/**
 * Returns `true` when a need is a non-FIR "special equipment" task objective that should be hidden.
 *
 * Marker items are treated as special equipment because they represent objective equipment (e.g. markers,
 * cameras) that is commonly non-FIR and can add a lot of noise to the Needed Items list.
 */
export const isNonFirSpecialEquipment = (need: NeededItemTaskObjective): boolean => {
  if (need.foundInRaid === true) return false;
  if (need.markerItem?.id) return true;
  const itemData = need.item;
  const categoryName = itemData?.category?.name ?? '';
  if (categoryName && isSpecialEquipmentText(categoryName)) {
    return true;
  }
  return itemData?.types?.some((type) => isSpecialEquipmentText(type)) ?? false;
};
