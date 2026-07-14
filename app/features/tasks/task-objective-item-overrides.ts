const OBJECTIVE_ITEM_ICON_OVERRIDES: Readonly<Record<string, string>> = {
  '69774bb0a247161ff1068335': '/img/items/69774bb0a247161ff1068335-icon.webp',
};
export function resolveObjectiveItemIcon(itemId?: string): string | undefined {
  if (!itemId) return undefined;
  return OBJECTIVE_ITEM_ICON_OVERRIDES[itemId];
}
