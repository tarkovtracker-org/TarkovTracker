import type { ItemCategory, SeasonalPerk, TarkovItem } from '@/types/tarkov';
const itemCategories = (item: TarkovItem) => [
  ...(item.categories ?? []),
  ...(item.category ? [item.category] : []),
];
/** Keep raw IDs and explicit unresolved references as the item catalog hydrates. */
export function resolveSeasonalPerks(perks: SeasonalPerk[], items: TarkovItem[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const categoryById = new Map<string, ItemCategory>();
  for (const item of items) {
    for (const category of itemCategories(item)) categoryById.set(category.id, category);
  }
  const resolve = <T>(ids: string[], byId: Map<string, T>) =>
    ids.map((id) => ({ id, value: byId.get(id) ?? null }));
  return perks.map((perk) => ({
    ...perk,
    effects: perk.effects.map((effect) => ({
      ...effect,
      resolvedItemFilter: effect.itemFilter
        ? {
            allowedItems: resolve(effect.itemFilter.allowedItems, itemById),
            excludedItems: resolve(effect.itemFilter.excludedItems, itemById),
            allowedCategories: resolve(effect.itemFilter.allowedCategories, categoryById),
            excludedCategories: resolve(effect.itemFilter.excludedCategories, categoryById),
          }
        : undefined,
    })),
  }));
}
