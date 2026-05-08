import type { TarkovItem, TaskObjective } from '@/types/tarkov';
export type ObjectiveWithItems = TaskObjective & {
  item?: TarkovItem;
  items?: TarkovItem[];
  markerItem?: TarkovItem;
  questItem?: TarkovItem;
  requiredKeys?: TarkovItem[][];
  containsAll?: TarkovItem[];
  useAny?: TarkovItem[];
  usingWeapon?: TarkovItem;
  usingWeaponMods?: TarkovItem[];
  wearing?: TarkovItem[];
  notWearing?: TarkovItem[];
};
export function createItemPicker(itemsById: Map<string, TarkovItem>) {
  const pickItemLite = (item?: TarkovItem | null): TarkovItem | undefined => {
    if (!item?.id) return item ?? undefined;
    const fullItem = itemsById.get(item.id);
    if (!fullItem) return item;
    // Intentional asymmetry: we merge the full item into the sparse item so fullItem
    // provides baseline data, but we let item.properties override fullItem.properties
    // so sparse items can carry custom property overrides.
    const mergedProperties = item.properties
      ? { ...(fullItem.properties ?? {}), ...item.properties }
      : fullItem.properties;
    const merged = { ...item, ...fullItem };
    if (mergedProperties) merged.properties = mergedProperties;
    return merged;
  };
  const pickItemArray = (items?: TarkovItem[] | null): TarkovItem[] | undefined => {
    if (!Array.isArray(items)) return items ?? undefined;
    return items.map((i) => pickItemLite(i) ?? i);
  };
  const pickItemMatrix = (items?: TarkovItem[][] | null): TarkovItem[][] | undefined => {
    if (!Array.isArray(items)) return items ?? undefined;
    return items.map((group) => pickItemArray(group) ?? []);
  };
  return { pickItemLite, pickItemArray, pickItemMatrix };
}
