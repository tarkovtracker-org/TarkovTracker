import { TEMPLATE_SLOT_PX } from '@/utils/stashScan/core/features';
import type { GridCell, RgbImage } from '@/utils/stashScan/core/grid';
/**
 * Digit shapes of the in-game label font at 7x10, averaged from 2,417 catalog short names
 * that contain digits and scaled to 0-9. Rows are separated by spaces.
 */
const DIGITS: Record<string, string> = {
  '0': '4664586 6421388 7301478 7302647 7325426 7345116 8753016 8851026 6753345 1589962',
  '1': '0068200 0278200 0147200 0027200 0027200 0027200 0027200 0027200 0148410 0299930',
  '2': '7644575 2211246 0000036 0000136 0001265 0015621 2453210 5531000 8633333 8999998',
  '3': '4444688 1112653 0014421 0148421 0268842 0011257 0000047 0000047 2233356 7899941',
  '4': '1101396 1112796 1125675 1256354 1564154 5631155 8887788 5555688 1111155 1111144',
  '5': '8744443 7411111 7400000 7533321 7888863 1111147 0000037 0000047 2233356 5799951',
  '6': '4664456 7421122 8300000 8533321 8888874 8411136 8300015 8410026 5533355 0599972',
  '7': '1456991 0223771 0013751 0026621 0147311 1067211 1564111 1761111 1851110 1851110',
  '8': '5664577 7521246 8500036 6533346 3588875 7521157 8400025 8500036 6533356 1499963',
  '9': '5754575 7421246 7300026 7410036 6521147 1233357 0111136 0000036 2233356 5799962',
};
const GLYPH_WIDTH = 7;
const GLYPH_HEIGHT = 10;
/** The digit shapes, for tests that paint counts into synthetic cells. */
export const STACK_DIGITS = { width: GLYPH_WIDTH, height: GLYPH_HEIGHT, rows: DIGITS } as const;
/** Count text sits right-aligned in the bottom rows, under a raised FIR mark. */
const BAND_HEIGHT = 13;
const BAND_WIDTH = 44;
/** Digits are about 8 template pixels tall; anything far off that is art or a mark. */
const DIGIT_HEIGHT = 8;
/** The last digit ends within this many template pixels of the right border. */
const RIGHT_PADDING = 8;
/** Digits of one number are closer than this; a wider gap could hide a thousands group. */
const DIGIT_GAP = 3.5;
/** Other ink within this many template pixels left of the count makes it unclear. */
const CLEAR_GAP = 7;
/** A digit must clearly beat the runner-up shape, or the count is left for the player. */
const MIN_DIGIT_SCORE = 0.5;
const MIN_DIGIT_MARGIN = 0.2;
const INK = 0.35;
const NOISE_PIXELS = 3;
const MIN_SLOT_PX = 48;
export type StackCount = { kind: 'none' } | { kind: 'number'; value: number } | { kind: 'unclear' };
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  pixels: number;
}
const TEMPLATES = Object.entries(DIGITS).map(([digit, rows]) => ({
  digit,
  values: centred(Float32Array.from(rows.replaceAll(' ', ''), (c) => Number(c))),
}));
/**
 * A slash, as in "10/10" magazine and durability text. It is close enough to a 7 that, without
 * its own shape, such text would read as a number. Matching it makes the count unclear.
 */
const SLASH = centred(
  Float32Array.from({ length: GLYPH_WIDTH * GLYPH_HEIGHT }, (_, i) => {
    const x = i % GLYPH_WIDTH;
    const y = Math.floor(i / GLYPH_WIDTH);
    const lineX = ((GLYPH_HEIGHT - 1 - y) / (GLYPH_HEIGHT - 1)) * (GLYPH_WIDTH - 1);
    return Math.max(0, 1 - Math.abs(x - lineX) / 1.2);
  })
);
TEMPLATES.push({ digit: '/', values: SLASH });
function centred(values: Float32Array): Float32Array {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let norm = 0;
  for (let i = 0; i < values.length; i++) {
    values[i]! -= mean;
    norm += values[i]! * values[i]!;
  }
  norm = Math.sqrt(norm) || 1;
  return values.map((value) => value / norm);
}
/** Bright, unsaturated label ink, 0-1. */
function ink(r: number, g: number, b: number): number {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return Math.max(0, Math.min(1, (min - 90) / 100 - Math.max(0, max - min - 40) / 100));
}
/** The count band in native pixels, ending on the cell's bottom and right border lines. */
function band(image: RgbImage, cell: GridCell) {
  const scale = (cell.height - 1) / (cell.slotsHigh * TEMPLATE_SLOT_PX);
  const right = cell.x + cell.width - 1;
  const bottom = cell.y + cell.height - 1;
  const left = Math.max(cell.x + 1, Math.round(right - BAND_WIDTH * scale));
  const top = Math.max(cell.y + 1, Math.round(bottom - (BAND_HEIGHT + 1) * scale));
  const width = right - left;
  const height = bottom - top;
  const map = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = ((top + y) * image.width + left + x) * 3;
      map[y * width + x] = ink(image.data[i]!, image.data[i + 1]!, image.data[i + 2]!);
    }
  }
  return { map, width, scale };
}
function extendBox(box: Box, x: number, y: number): void {
  box.x0 = Math.min(box.x0, x);
  box.x1 = Math.max(box.x1, x);
  box.y0 = Math.min(box.y0, y);
  box.y1 = Math.max(box.y1, y);
  box.pixels++;
}
/** The 8-connected neighbours of pixel `p` inside a `width` x `height` map. */
function neighbours(p: number, width: number, height: number): number[] {
  const x = p % width;
  const y = Math.floor(p / width);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if ((dx || dy) && xx >= 0 && yy >= 0 && xx < width && yy < height) out.push(yy * width + xx);
    }
  }
  return out;
}
/** Bounding box of the ink component that contains `start`, marking its pixels seen. */
function floodBox(map: Float32Array, width: number, start: number, seen: Uint8Array): Box {
  const height = map.length / width;
  const box = { x0: width, x1: -1, y0: height, y1: -1, pixels: 0 };
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const p = stack.pop()!;
    extendBox(box, p % width, Math.floor(p / width));
    for (const q of neighbours(p, width, height)) {
      if (seen[q] || map[q]! <= INK) continue;
      seen[q] = 1;
      stack.push(q);
    }
  }
  return box;
}
function components(map: Float32Array, width: number): Box[] {
  const seen = new Uint8Array(map.length);
  const boxes: Box[] = [];
  for (let start = 0; start < map.length; start++) {
    if (!seen[start] && map[start]! > INK) boxes.push(floodBox(map, width, start, seen));
  }
  return boxes;
}
function digitSized(box: Box, scale: number): boolean {
  const height = (box.y1 - box.y0 + 1) / scale;
  return height >= 0.7 * DIGIT_HEIGHT && height <= 1.4 * DIGIT_HEIGHT;
}
/**
 * Count digits end about 3 template pixels left of the border and 4 above it. Ink touching
 * the border is an item frame or art, never a digit.
 */
function clearOfBorder(box: Box, width: number, height: number, scale: number): boolean {
  return (width - 1 - box.x1) / scale >= 1.5 && (height - 1 - box.y1) / scale >= 2;
}
/** Resamples a glyph box into the 7x10 digit grid (bilinear), keeping its aspect ratio. */
function glyphVector(map: Float32Array, width: number, box: Box): Float32Array {
  const out = new Float32Array(GLYPH_WIDTH * GLYPH_HEIGHT);
  const step = (box.y1 - box.y0 + 1) / GLYPH_HEIGHT;
  const drawn = Math.min(GLYPH_WIDTH, (box.x1 - box.x0 + 1) / step);
  const offset = (GLYPH_WIDTH - drawn) / 2;
  const at = (x: number, y: number) =>
    map[Math.min(box.y1, Math.max(box.y0, y)) * width + Math.min(box.x1, Math.max(box.x0, x))]!;
  for (let y = 0; y < GLYPH_HEIGHT; y++) {
    for (let x = 0; x < GLYPH_WIDTH; x++) {
      const sx = box.x0 + (x - offset + 0.5) * step - 0.5;
      const sy = box.y0 + (y + 0.5) * step - 0.5;
      if (sx < box.x0 - 0.5 || sx > box.x1 + 0.5) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      out[y * GLYPH_WIDTH + x] =
        (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) +
        (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
    }
  }
  return centred(out);
}
function readDigit(vector: Float32Array): string | undefined {
  const scores = TEMPLATES.map(({ digit, values }) => ({
    digit,
    score: values.reduce((sum, value, i) => sum + value * vector[i]!, 0),
  })).sort((a, b) => b.score - a.score);
  const [best, next] = scores;
  if (best!.score < MIN_DIGIT_SCORE || best!.score - next!.score < MIN_DIGIT_MARGIN) return;
  return best!.digit;
}
/** The right-aligned run of digit-sized glyphs ending near the right border, if any. */
function countRun(boxes: Box[], width: number, height: number, scale: number): Box[] {
  const glyphs = boxes
    .filter((box) => digitSized(box, scale) && clearOfBorder(box, width, height, scale))
    .sort((a, b) => a.x0 - b.x0);
  const last = glyphs.at(-1);
  if (!last || (width - 1 - last.x1) / scale > RIGHT_PADDING) return [];
  const run = [glyphs.pop()!];
  while (glyphs.length && (run[0]!.x0 - glyphs.at(-1)!.x1) / scale <= DIGIT_GAP)
    run.unshift(glyphs.pop()!);
  return run;
}
/**
 * Reads the stack count printed in an item's bottom-right corner. "none" means the corner is
 * clear, which the game shows for a single item. Pass `markInCorner` when a FIR mark sits in
 * the corner itself: a count would have pushed it up, so that also means a single item.
 * Anything else near the count (a covered mark, a slash, a spaced thousands group) is
 * "unclear" so the player enters it; art further left is ignored. Slots under 48 px are too
 * small to read reliably and are always "unclear".
 */
export function readStackCount(image: RgbImage, cell: GridCell, markInCorner = false): StackCount {
  if ((cell.height - 1) / cell.slotsHigh < MIN_SLOT_PX) return { kind: 'unclear' };
  if (markInCorner) return { kind: 'none' };
  const { map, width, scale } = band(image, cell);
  const boxes = components(map, width).filter((box) => box.pixels >= NOISE_PIXELS * scale);
  const run = countRun(boxes, width, map.length / width, scale);
  const zoneStart = run.length
    ? run[0]!.x0 - CLEAR_GAP * scale
    : width - 1 - (RIGHT_PADDING + DIGIT_HEIGHT) * scale;
  const nearby = boxes.filter((box) => !run.includes(box) && box.x1 >= zoneStart);
  if (nearby.length) return { kind: 'unclear' };
  if (!run.length) return { kind: 'none' };
  const digits = run.map((box) => readDigit(glyphVector(map, width, box)));
  if (digits.some((digit) => !digit || digit === '/') || digits[0] === '0')
    return { kind: 'unclear' };
  return { kind: 'number', value: Number(digits.join('')) };
}
