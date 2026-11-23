import { distinctObjectiveItems, objectiveEquipmentItems } from '@/utils/objectiveEquipment';
import type { ObjectiveEquipment, TarkovItem, TaskObjective } from '@/types/tarkov';
export const MAX_RENDERED_OBJECTIVE_ITEMS = 24;
export const getObjectiveEquipmentItems = (
  objective: TaskObjective,
  mode: 'all' | 'bring' = 'all'
): TarkovItem[] => {
  const items: TarkovItem[] = [];
  const isBringType =
    objective.type &&
    ['plantItem', 'plantQuestItem', 'place', 'useItem', 'sellItem'].includes(objective.type);
  if (objective.markerItem?.id) items.push(objective.markerItem);
  // Bring-mode callers (the map required-items summary) need the canonical singular `item`,
  // which upstream populates for bring objectives that expose no `items` array. Task-card
  // rendering ('all') keeps using the array fields so its chip set stays unchanged.
  if (mode === 'bring' && isBringType && objective.item?.id) items.push(objective.item);
  if (objective.items?.length && (mode === 'all' || isBringType)) {
    const cap = objective.type === 'sellItem' ? MAX_RENDERED_OBJECTIVE_ITEMS : Infinity;
    items.push(...objective.items.slice(0, cap));
  }
  if (objective.questItem?.id && (mode === 'all' || isBringType)) {
    items.push(objective.questItem);
  }
  if (mode === 'all') {
    if (objective.useAny?.length) {
      items.push(...objective.useAny.slice(0, MAX_RENDERED_OBJECTIVE_ITEMS));
    }
    items.push(...objectiveEquipmentItems(objective.usingWeapon));
    items.push(...objectiveEquipmentItems(objective.usingWeaponMods));
    items.push(...objectiveEquipmentItems(objective.wearing));
  }
  return distinctObjectiveItems(items);
};
const equipmentBundles = (value: ObjectiveEquipment | undefined): TarkovItem[][] => {
  if (!Array.isArray(value) || !value.every(Array.isArray)) return [];
  return value.every((bundle) => bundle.length > 0 && bundle.every((item) => item?.id))
    ? value
    : [];
};
const getModChoices = (value: ObjectiveEquipment | undefined): TarkovItem[] => {
  const bundles = equipmentBundles(value);
  return bundles.every((bundle) => bundle.length === 1)
    ? distinctObjectiveItems(bundles.flat())
    : [];
};
const wearableKind = (item: TarkovItem) => item.category?.id ?? item.properties?.propertiesType;
const FACE_COVER_CATEGORY_ID = '5a341c4686f77469e155819e';
// The full item catalog confirms this category for the face covers without a kind in items-lite.
const FACE_COVERS_WITHOUT_KIND = new Set([
  '59e7715586f7742ee5789605',
  '5b432c305acfc40019478128',
  '60363c0c92ec1c31037959f5',
  '689b404db49f27df1c0873f6',
  '689b880fff8b4adc420f5b56',
]);
const getSingleSlotChoices = (items: TarkovItem[]): TarkovItem[][] => {
  // Some catalogs encode separately required gear as singleton bundles. Keep unlike gear inline.
  const kinds = new Set(
    items.map((item) =>
      FACE_COVERS_WITHOUT_KIND.has(item.id) ? FACE_COVER_CATEGORY_ID : wearableKind(item)
    )
  );
  const [kind] = kinds;
  return kinds.size === 1 && typeof kind === 'string' && kind.length > 0 ? [items] : [];
};
const outfitColumns = (bundles: TarkovItem[][], first: TarkovItem[]): TarkovItem[][] => {
  if (bundles.some((bundle) => bundle.length !== first.length)) return [];
  const columns = first.map((_, slot) =>
    distinctObjectiveItems(bundles.map((bundle) => bundle[slot]))
  );
  const items = columns.flat();
  if (distinctObjectiveItems(items).length !== items.length) return [];
  // Factoring exact combinations preserves equipment that has to be worn together.
  const combinations = new Set(bundles.map((bundle) => bundle.map((item) => item.id).join(',')));
  const productSize = columns.reduce((product, column) => product * column.length, 1);
  return combinations.size === productSize ? columns : [];
};
const getWearableChoices = (value: ObjectiveEquipment | undefined): TarkovItem[][] => {
  const bundles = equipmentBundles(value);
  const first = bundles[0];
  if (!first || bundles.length < 2) return [];
  if (bundles.every((bundle) => bundle.length === 1)) {
    return getSingleSlotChoices(distinctObjectiveItems(bundles.flat()));
  }
  return outfitColumns(bundles, first);
};
export const getTaskEquipmentDisplay = (objective: TaskObjective) => {
  const mods = getModChoices(objective.usingWeaponMods);
  const wearable = getWearableChoices(objective.wearing);
  const equipment = getObjectiveEquipmentItems({
    ...objective,
    usingWeaponMods: mods.length > 1 ? undefined : objective.usingWeaponMods,
    wearing: wearable.length > 0 ? undefined : objective.wearing,
  });
  return {
    equipment: distinctObjectiveItems([
      ...equipment,
      ...wearable.filter((group) => group.length === 1).flat(),
    ]),
    choices: [mods, ...wearable].filter((group) => group.length > 1),
  };
};
