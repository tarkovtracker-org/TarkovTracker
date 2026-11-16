// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readStackCount, STACK_DIGITS } from '@/utils/stashScan/core/stackCount';
import type { GridCell, RgbImage } from '@/utils/stashScan/core/grid';
const BACKGROUND = 30;
function cellImage(pitch: number): { image: RgbImage; cell: GridCell } {
  const size = pitch + 1;
  const image = {
    width: size,
    height: size,
    data: new Uint8Array(size * size * 3).fill(BACKGROUND),
  };
  return { image, cell: { x: 0, y: 0, width: size, height: size, slotsWide: 1, slotsHigh: 1 } };
}
function shade(image: RgbImage, x: number, y: number, value: number): void {
  const v = Math.max(0, Math.min(255, Math.round(value)));
  image.data.set([v, v, v], (y * image.width + x) * 3);
}
/** Paints one glyph shape solid, as the game draws text: levels of 3 or more are stroke. */
function paintShape(image: RgbImage, rows: string[], left: number, top: number, scale: number) {
  const height = Math.round(rows.length * scale);
  const width = Math.round(rows[0]!.length * scale);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const level = Number(rows[Math.floor(y / scale)]![Math.floor(x / scale)]);
      if (level >= 3) shade(image, left + x, top + y, 230);
    }
  }
  return width;
}
/**
 * A slash as the game draws it in "10/10": a thin diagonal a little taller than the digits.
 * Without a slash shape of its own, this reads as a 7.
 */
function paintSlash(image: RgbImage, right: number, bottom: number, unit: number): number {
  const width = Math.round(5.25 * unit);
  const height = Math.round(9 * unit);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lineX = ((height - 1 - y) / (height - 1)) * (width - 1);
      if (Math.abs(x - lineX) <= 0.75) shade(image, right - width + x, bottom - height + y, 230);
    }
  }
  return width;
}
/**
 * Paints `text` right-aligned like the game: digits 8 template pixels tall, ending 3 pixels
 * left of and 4 pixels above the bottom-right border. A space leaves a wider gap.
 */
function paintCount(image: RgbImage, pitch: number, text: string): void {
  const unit = pitch / 63;
  const scale = (8 * unit) / STACK_DIGITS.height;
  let right = image.width - 1 - Math.round(3 * unit);
  const top = image.height - 1 - Math.round(4 * unit) - Math.round(STACK_DIGITS.height * scale);
  for (const char of [...text].reverse()) {
    if (char === ' ') {
      right -= Math.round(4 * unit);
      continue;
    }
    // The game leaves about two template pixels between glyphs.
    const gap = Math.round(2 * unit);
    if (char === '/') {
      right -= paintSlash(image, right, top + Math.round(STACK_DIGITS.height * scale), unit) + gap;
      continue;
    }
    const shape = STACK_DIGITS.rows[char]!.split(' ');
    // Drop blank columns so glyph spacing matches the game's.
    const used = [...shape[0]!].flatMap((_, x) =>
      shape.some((row) => Number(row[x]) >= 3) ? [x] : []
    );
    const rows = shape.map((row) => row.slice(used[0], used.at(-1)! + 1));
    const width = Math.round(rows[0]!.length * scale);
    paintShape(image, rows, right - width, top, scale);
    right -= width + gap;
  }
}
describe('stack count reading', () => {
  it.each([
    [63, '4', 4],
    [84, '2', 2],
    [84, '12', 12],
    [126, '24', 24],
  ])('reads a %spx slot showing "%s"', (pitch, text, value) => {
    const { image, cell } = cellImage(pitch);
    paintCount(image, pitch, text);
    expect(readStackCount(image, cell)).toEqual({ kind: 'number', value });
  });
  it('refuses to guess between look-alike digits', () => {
    // 8 is close to 0, 6 and 9; a wrong count is worse than asking.
    const { image, cell } = cellImage(84);
    paintCount(image, 84, '8');
    expect(readStackCount(image, cell)).toEqual({ kind: 'unclear' });
  });
  it('reports a single item when the corner is clear or holds the FIR mark', () => {
    const { image, cell } = cellImage(84);
    expect(readStackCount(image, cell)).toEqual({ kind: 'none' });
    paintCount(image, 84, '4');
    expect(readStackCount(image, cell, true)).toEqual({ kind: 'none' });
  });
  it('leaves capacity text, spaced thousands and tiny slots for the player', () => {
    // Every digit here reads on its own; only the slash, the gap or the size stops them.
    for (const [pitch, text] of [
      [84, '12/12'],
      [84, '12 412'],
      [42, '4'],
    ] as const) {
      const { image, cell } = cellImage(pitch);
      paintCount(image, pitch, text);
      expect(readStackCount(image, cell)).toEqual({ kind: 'unclear' });
    }
  });
  it('does not read an item frame along the border as a 1', () => {
    const { image, cell } = cellImage(84);
    // A digit-high stretch of frame on the last column before the border line.
    for (let y = 68; y < 79; y++) shade(image, 83, y, 230);
    expect(readStackCount(image, cell)).toEqual({ kind: 'unclear' });
  });
});
