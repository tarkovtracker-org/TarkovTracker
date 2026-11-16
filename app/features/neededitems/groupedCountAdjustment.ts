export interface GroupedCountTarget {
  id: string;
  current: number;
  total: number;
  fixed: boolean;
}
/** Preserve allocations: add in priority order, remove in reverse priority order. */
export function planGroupedCountAdjustment<T extends GroupedCountTarget>(
  targets: T[],
  requested: number
): { target: T; count: number }[] {
  if (!Number.isFinite(requested)) return [];
  const current = targets.reduce((sum, target) => sum + target.current, 0);
  const minimum = targets.reduce((sum, target) => sum + (target.fixed ? target.current : 0), 0);
  const maximum = targets.reduce((sum, target) => sum + target.total, 0);
  const delta = Math.min(maximum, Math.max(minimum, Math.floor(requested))) - current;
  const increasing = delta > 0;
  const ordered = increasing ? targets : [...targets].reverse();
  let remaining = Math.abs(delta);
  return ordered
    .filter((target) => !target.fixed)
    .flatMap((target) => {
      const capacity = increasing ? target.total - target.current : target.current;
      const amount = Math.min(remaining, capacity);
      remaining -= amount;
      return amount > 0
        ? [{ target, count: target.current + (increasing ? amount : -amount) }]
        : [];
    });
}
