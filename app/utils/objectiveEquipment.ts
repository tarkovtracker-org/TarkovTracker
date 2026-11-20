import type { ObjectiveEquipment, TarkovItem } from '@/types/tarkov';
/** Flatten only for item presentation; the stored objective retains its equipment groups. */
export function objectiveEquipmentItems(value: ObjectiveEquipment | undefined): TarkovItem[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value.flat() : [value];
}
/** Hydrate leaves without changing alternatives, conjunctions, empty groups or unknown refs. */
export function mapObjectiveEquipment(
  value: ObjectiveEquipment,
  pick: (item: TarkovItem) => TarkovItem
): ObjectiveEquipment {
  return Array.isArray(value)
    ? value.map((entry) => (Array.isArray(entry) ? entry.map(pick) : pick(entry)))
    : pick(value);
}
