import { TEMPLATE_SLOT_PX } from '@/utils/stashScan/core/features';
import type { GridCell, RgbImage } from '@/utils/stashScan/core/grid';
/**
 * The found-in-raid checkmark: a ring with a tick, drawn in the bottom-right corner of an item,
 * or above its stack, durability or uses count. Values are luminance at 63px-per-slot scale,
 * averaged over 214 marked items from 1080p and 1440p screenshots and scaled to ±99.
 */
const MARK_WIDTH = 14;
const MARK_HEIGHT = 12;
// prettier-ignore
const MARK = Int8Array.from([
  -38, -40, -43, -44, -38, -30, -27, -31, -40, -45, -44, -41, -41, -44,
  -40, -42, -42, -24, 17, 51, 63, 47, 10, -26, -26, -3, -22, -43,
  -42, -40, -6, 53, 58, 21, 6, 31, 66, 54, 56, 86, 16, -43,
  -45, -23, 43, 45, -19, -43, -45, -42, -1, 72, 99, 54, -17, -44,
  -46, 5, 55, 13, -10, -20, -42, -31, 25, 87, 78, 3, -41, -43,
  -47, 18, 46, 20, 74, 61, 2, 33, 85, 82, 69, 7, -41, -43,
  -46, 18, 50, -4, 29, 85, 91, 86, 48, 23, 57, 9, -41, -43,
  -46, 4, 62, 11, -27, 25, 78, 49, -9, 28, 60, -8, -42, -42,
  -46, -26, 42, 58, -3, -25, -9, -9, 12, 67, 30, -33, -43, -42,
  -44, -44, -14, 50, 73, 45, 31, 53, 77, 47, -22, -43, -42, -42,
  -44, -44, -44, -23, 26, 60, 69, 56, 18, -25, -42, -42, -42, -42,
  -45, -44, -44, -44, -44, -44, -44, -43, -43, -43, -42, -42, -42, -42,
]);
/** The measured mark, for tests that paint it into synthetic cells. */
export const FIR_MARK = { width: MARK_WIDTH, height: MARK_HEIGHT, values: MARK } as const;
/** Only pixels within this radius of the mark centre are compared, so nearby art is ignored. */
const MARK_RADIUS = 6;
/** Unlifted mark position: its left and top edges, in template pixels from the border line. */
const MARK_LEFT = 15;
const MARK_TOP = 14;
/** How far a count line can push the mark up, and how far left an item can shift it. */
const MAX_LIFT = 24;
const MAX_SHIFT_LEFT = 2;
const SEARCH_WIDTH = MARK_LEFT + MAX_SHIFT_LEFT;
const SEARCH_HEIGHT = MARK_TOP + MAX_LIFT;
/**
 * Marked items score 0.68 or more at 1080p and 1440p (0.5 to 0.6 when a coin or tooltip
 * covers part of the ring); unmarked corners stay at 0.46 or less. Below 40px per slot the
 * ring is under 9 pixels wide, so the mark is left for the player to confirm.
 */
const FIR_SCORE = 0.65;
const MIN_SLOT_PX = 40;
/** Luminance spread a real mark always has; flat or near-black corners cannot match. */
const MIN_CONTRAST = 12;
const DISC = (() => {
  const centreX = (MARK_WIDTH - 1) / 2;
  const centreY = (MARK_HEIGHT - 1) / 2;
  const disc: number[] = [];
  for (let y = 0; y < MARK_HEIGHT; y++) {
    for (let x = 0; x < MARK_WIDTH; x++)
      if (Math.hypot(x - centreX, y - centreY) <= MARK_RADIUS) disc.push(y * MARK_WIDTH + x);
  }
  return disc;
})();
const CENTRED_MARK = (() => {
  const mean = DISC.reduce((sum, i) => sum + MARK[i]!, 0) / DISC.length;
  const values = DISC.map((i) => MARK[i]! - mean);
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => value / norm);
})();
const luminance = (image: RgbImage, p: number) =>
  0.299 * image.data[p * 3]! + 0.587 * image.data[p * 3 + 1]! + 0.114 * image.data[p * 3 + 2]!;
function areaAverage(image: RgbImage, left: number, top: number, size: number): number {
  let sum = 0;
  let weight = 0;
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(image.height, top + size); y++) {
    const wy = Math.min(y + 1, top + size) - Math.max(y, top);
    for (let x = Math.max(0, Math.floor(left)); x < Math.min(image.width, left + size); x++) {
      const w = wy * (Math.min(x + 1, left + size) - Math.max(x, left));
      sum += luminance(image, y * image.width + x) * w;
      weight += w;
    }
  }
  return weight > 0 ? sum / weight : 0;
}
/** The cell's bottom-right corner at template scale, ending on its border lines. */
function cornerPatch(image: RgbImage, cell: GridCell): Float64Array {
  const scale = (cell.height - 1) / (cell.slotsHigh * TEMPLATE_SLOT_PX);
  const right = cell.x + cell.width - 1;
  const bottom = cell.y + cell.height - 1;
  const patch = new Float64Array(SEARCH_WIDTH * SEARCH_HEIGHT);
  for (let v = 0; v < SEARCH_HEIGHT; v++) {
    for (let u = 0; u < SEARCH_WIDTH; u++)
      patch[v * SEARCH_WIDTH + u] = areaAverage(
        image,
        right - (SEARCH_WIDTH - u) * scale,
        bottom - (SEARCH_HEIGHT - v) * scale,
        scale
      );
  }
  return patch;
}
function scoreAt(patch: Float64Array, left: number, top: number): number {
  const at = (i: number) =>
    patch[(top + Math.floor(i / MARK_WIDTH)) * SEARCH_WIDTH + left + (i % MARK_WIDTH)]!;
  const mean = DISC.reduce((sum, i) => sum + at(i), 0) / DISC.length;
  let dot = 0;
  let energy = 0;
  DISC.forEach((i, k) => {
    const value = at(i) - mean;
    dot += value * CENTRED_MARK[k]!;
    energy += value * value;
  });
  if (Math.sqrt(energy / DISC.length) < MIN_CONTRAST) return 0;
  return dot / Math.sqrt(energy);
}
export interface FirMarkMatch {
  /** Best normalised correlation with the mark. */
  score: number;
  /** Template pixels the best match sits above the unlifted corner position. */
  lift: number;
}
/** Best match with the mark anywhere it can sit in this cell's corner. */
export function matchFirMark(image: RgbImage, cell: GridCell): FirMarkMatch {
  const patch = cornerPatch(image, cell);
  const unlifted = SEARCH_HEIGHT - MARK_TOP;
  let best = { score: 0, lift: 0 };
  for (let top = 0; top <= SEARCH_HEIGHT - MARK_HEIGHT; top++) {
    for (let left = 0; left <= SEARCH_WIDTH - MARK_WIDTH; left++) {
      const score = scoreAt(patch, left, top);
      if (score > best.score) best = { score, lift: unlifted - top };
    }
  }
  return best;
}
export const firMarkScore = (image: RgbImage, cell: GridCell): number =>
  matchFirMark(image, cell).score;
/** True for a clear mark on slots large enough to resolve it; `match` reuses a search. */
export function detectFirMark(
  image: RgbImage,
  cell: GridCell,
  match: FirMarkMatch = matchFirMark(image, cell)
): boolean {
  return (cell.height - 1) / cell.slotsHigh >= MIN_SLOT_PX && match.score >= FIR_SCORE;
}
