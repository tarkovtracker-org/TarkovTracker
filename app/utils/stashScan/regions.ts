import { scanError, type ScanRect } from '@/utils/stashScan/types';
function splitAxis(start: number, length: number, count: number, index: number): [number, number] {
  const from = Math.round(start + ((length - 1) * index) / count);
  const to = Math.round(start + ((length - 1) * (index + 1)) / count);
  return [from, to - from + 1];
}
const validSplitCount = (count: number, slots: number): boolean =>
  Number.isInteger(count) && count >= 1 && slots % count === 0;
const canSplitAxis = (length: number, slots: number, count: number): boolean =>
  validSplitCount(count, slots) &&
  Number.isSafeInteger(length) &&
  Math.floor((length - 1) / count) + 1 >= 8;
export function canSplitRegion(rect: ScanRect, columns: number, rows: number): boolean {
  return (
    canSplitAxis(rect.width, rect.slotsWide, columns) &&
    canSplitAxis(rect.height, rect.slotsHigh, rows)
  );
}
/** Shared border pixels are intentional; interiors never overlap. */
export function splitRegion(rect: ScanRect, columns: number, rows: number): ScanRect[] {
  if (!canSplitRegion(rect, columns, rows)) throw scanError('region_invalid');
  return Array.from({ length: rows * columns }, (_, index) => {
    const [x, width] = splitAxis(rect.x, rect.width, columns, index % columns);
    const [y, height] = splitAxis(rect.y, rect.height, rows, Math.floor(index / columns));
    return {
      x,
      y,
      width,
      height,
      slotsWide: rect.slotsWide / columns,
      slotsHigh: rect.slotsHigh / rows,
    };
  });
}
/** A manually redrawn region replaces overlapping detections instead of counting them twice. */
export function overlapsRegion(a: ScanRect, b: ScanRect): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 2 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 2
  );
}
