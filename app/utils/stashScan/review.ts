import {
  SCAN_LIMITS,
  scanError,
  type ReviewedCell,
  type ScanCandidate,
  type ScanCell,
  type ScanItem,
} from '@/utils/stashScan/types';
/** These are routing heuristics from the reference, not probabilities or permission to save. */
const strongScore = (cell: ScanCell): boolean =>
  (cell.candidates[0]?.score ?? 0) >= 0.72 && cell.margin >= 0.08;
/** How far the best candidate leads every other candidate on one signal. */
function lead(cell: ScanCell, signal: (candidate: ScanCandidate) => number): number {
  const [best, ...others] = cell.candidates;
  if (!best) return 0;
  return signal(best) - Math.max(-1, ...others.map(signal));
}
/**
 * One signal alone can be decisive when the other is spoiled: near-identical art with a label
 * the game rendered differently (Silicone tube), or an exact label on a tinted or modded weapon.
 * Items that share an icon or a short name tie on that signal, so they never pass.
 * Measured on 1080p and 1440p screenshots, neither rule accepted a wrong item.
 */
const decisiveArt = (cell: ScanCell): boolean =>
  (cell.candidates[0]?.artScore ?? 0) >= 0.97 && lead(cell, (c) => c.artScore) >= 0.3;
const decisiveLabel = (cell: ScanCell): boolean =>
  (cell.candidates[0]?.textScore ?? 0) >= 0.93 && lead(cell, (c) => c.textScore) >= 0.12;
const strongSuggestion = (cell: ScanCell): boolean =>
  strongScore(cell) || decisiveArt(cell) || decisiveLabel(cell);
function suggestedItemId(cell: ScanCell): string {
  return (cell.candidates[0]?.score ?? 0) >= 0.5 ? cell.candidates[0]!.itemId : '';
}
/**
 * Units on the item: the count read from the icon, if it fits the item. An item that cannot
 * stack is one unit, unless the icon shows a different plain number, which means the
 * identity is probably wrong. Capacity text such as "10/10" is never read as a number.
 */
function quantityFor(cell: ScanCell, item: ScanItem | undefined): number | null {
  if (!item) return null;
  if (item.maxStack <= 1) return cell.stack === null || cell.stack === 1 ? 1 : null;
  return cell.stack !== null && cell.stack <= item.maxStack ? cell.stack : null;
}
export function reviewCell(cell: ScanCell, items: Map<string, ScanItem>): ReviewedCell {
  const itemId = suggestedItemId(cell);
  return {
    cell,
    itemId,
    quantity: quantityFor(cell, items.get(itemId)),
    // A detected checkmark is FIR. Without one the status stays unknown, which only fills
    // non-FIR needs, because a covered or tiny mark is not proof the item lacks it.
    raidStatus: cell.fir ? 'fir' : 'unknown',
    reviewed: strongSuggestion(cell),
    excluded: cell.empty,
  };
}
const validQuantity = (quantity: number | null): boolean =>
  Number.isSafeInteger(quantity) && Number(quantity) >= 1;
export function needsReview(row: ReviewedCell): boolean {
  if (row.excluded) return false;
  return !row.reviewed || !row.itemId || !validQuantity(row.quantity);
}
/**
 * A shortlist cannot establish irrelevance. Unsettled identities and amounts always block:
 * even an impossible amount on a confident suggestion can expose a wrong identity.
 */
export function blocksImport(row: ReviewedCell): boolean {
  return needsReview(row);
}
/** How a row is shown: confirmed, to check, settled but unneeded, or removed. */
export type ReviewState = 'ok' | 'check' | 'skip' | 'removed';
export function reviewState(row: ReviewedCell, tracked?: ReadonlySet<string>): ReviewState {
  if (row.excluded) return 'removed';
  if (needsReview(row)) return 'check';
  return tracked && !tracked.has(row.itemId) ? 'skip' : 'ok';
}
export function selectItem(row: ReviewedCell, item: ScanItem): void {
  row.itemId = item.id;
  // The player chose this item, so one that cannot stack is one unit whatever the icon shows.
  row.quantity = item.maxStack <= 1 ? 1 : quantityFor(row.cell, item);
  row.reviewed = true;
  row.excluded = false;
}
export interface ObservedTotals {
  itemId: string;
  fir: number;
  nonFir: number;
  unknown: number;
}
function addQuantity(total: ObservedTotals, row: ReviewedCell): void {
  const key = row.raidStatus === 'non_fir' ? 'nonFir' : row.raidStatus;
  total[key] += row.quantity!;
  if (total.fir + total.nonFir + total.unknown > SCAN_LIMITS.quantity) throw scanError('quantity');
}
/**
 * Validates all included rows, then groups physical observations once, independent of
 * requirements. Only settled rows can be filtered by the account's needed item IDs.
 */
export function reviewedTotals(
  rows: ReviewedCell[],
  tracked?: ReadonlySet<string>
): ObservedTotals[] {
  if (rows.some(blocksImport)) throw scanError('review_required');
  const totals = new Map<string, ObservedTotals>();
  for (const row of rows.filter((entry) => !entry.excluded)) {
    assertQuantity(row);
    if (tracked && !tracked.has(row.itemId)) continue;
    accumulateRow(totals, row);
  }
  return [...totals.values()];
}
function assertQuantity(row: ReviewedCell): void {
  if (!Number.isSafeInteger(row.quantity) || Number(row.quantity) > SCAN_LIMITS.quantity)
    throw scanError('quantity');
}
function accumulateRow(totals: Map<string, ObservedTotals>, row: ReviewedCell): void {
  const total = totals.get(row.itemId) ?? { itemId: row.itemId, fir: 0, nonFir: 0, unknown: 0 };
  addQuantity(total, row);
  totals.set(row.itemId, total);
}
