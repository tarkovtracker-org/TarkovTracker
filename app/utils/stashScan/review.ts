import {
  SCAN_LIMITS,
  scanError,
  type ReviewedCell,
  type ScanCell,
  type ScanItem,
} from '@/utils/stashScan/types';
/** These are routing heuristics from the reference, not probabilities or permission to save. */
const strongSuggestion = (cell: ScanCell): boolean =>
  (cell.candidates[0]?.score ?? 0) >= 0.72 && cell.margin >= 0.08;
function suggestedItemId(cell: ScanCell): string {
  return (cell.candidates[0]?.score ?? 0) >= 0.5 ? cell.candidates[0]!.itemId : '';
}
export function reviewCell(cell: ScanCell, items: Map<string, ScanItem>): ReviewedCell {
  const itemId = suggestedItemId(cell);
  return {
    cell,
    itemId,
    quantity: items.get(itemId)?.maxStack === 1 ? 1 : null,
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
export function selectItem(row: ReviewedCell, item: ScanItem): void {
  row.itemId = item.id;
  row.quantity = item.maxStack === 1 ? 1 : null;
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
/** Validates all included rows, then groups physical observations once, independent of requirements. */
export function reviewedTotals(rows: ReviewedCell[]): ObservedTotals[] {
  if (rows.some(needsReview)) throw scanError('review_required');
  const totals = new Map<string, ObservedTotals>();
  for (const row of rows.filter((entry) => !entry.excluded)) {
    accumulateRow(totals, row);
  }
  return [...totals.values()];
}
function accumulateRow(totals: Map<string, ObservedTotals>, row: ReviewedCell): void {
  if (!Number.isSafeInteger(row.quantity) || Number(row.quantity) > SCAN_LIMITS.quantity)
    throw scanError('quantity');
  const total = totals.get(row.itemId) ?? { itemId: row.itemId, fir: 0, nonFir: 0, unknown: 0 };
  addQuantity(total, row);
  totals.set(row.itemId, total);
}
