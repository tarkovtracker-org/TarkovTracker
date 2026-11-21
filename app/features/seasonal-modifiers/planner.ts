export const modifierCategories = [
  'skills',
  'hideout',
  'raid_combat',
  'movement_stamina',
  'health_provisions',
  'traders_economy',
  'gear_goals',
  'general',
] as const;
export type ModifierCategory = (typeof modifierCategories)[number];
export interface Modifier {
  id: string;
  category: ModifierCategory;
  netCost: number;
}
export interface ModifierDisplay extends Modifier {
  name: string;
  effect: string;
}
export type ModifierOrder = 'category' | 'low' | 'high';
export const netCostOf = (items: readonly Modifier[]) =>
  items.reduce((sum, item) => sum + item.netCost, 0);
export function lowestNetCost(total: number, available: readonly Modifier[]): number {
  return total + netCostOf(available.filter((item) => item.netCost < 0));
}
function collectBalances<T extends Modifier>(available: readonly T[]): Map<number, T[]> {
  const changes = new Map<number, T[]>([[0, []]]);
  for (const item of available) {
    for (const [change, picks] of [...changes]) {
      const next = change + item.netCost;
      if ((changes.get(next)?.length ?? Infinity) > picks.length + 1) {
        changes.set(next, [...picks, item]);
      }
    }
  }
  return changes;
}
export function suggestBalance<T extends Modifier>(total: number, available: readonly T[]) {
  let closest = total <= 0 ? total : -Infinity;
  let additions: T[] = [];
  if (total === 0) return { closest, additions };
  for (const [change, picks] of collectBalances(available)) {
    const result = total + change;
    if (result <= 0 && result > closest) {
      closest = result;
      additions = picks;
    }
  }
  return { closest, additions };
}
export function groupModifiers(items: ModifierDisplay[], order: ModifierOrder) {
  if (order === 'category') {
    return modifierCategories.map((key) => ({
      key,
      entries: items.filter((item) => item.category === key),
    }));
  }
  const values = [...new Set(items.map((item) => Math.abs(item.netCost)))];
  values.sort((a, b) => (order === 'low' ? a - b : b - a));
  return values.map((value) => ({
    key: value,
    entries: items
      .filter((item) => Math.abs(item.netCost) === value)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
