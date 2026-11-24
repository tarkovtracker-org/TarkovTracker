// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  detectGrid,
  type GridCell,
  type GridDetection,
  type RgbImage,
} from '@/utils/stashScan/core/grid';
function line(image: RgbImage, x0: number, y0: number, x1: number, y1: number, shade = 160): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++)
      image.data.fill(shade, (y * image.width + x) * 3, (y * image.width + x) * 3 + 3);
  }
}
function regularGrid(columns: number, rows: number, size?: number): RgbImage {
  const width = size ?? columns * 24 + 17;
  const height = size ?? rows * 24 + 17;
  const image = { width, height, data: new Uint8Array(width * height * 3).fill(24) };
  for (let i = 0; i <= columns; i++) line(image, 8 + i * 24, 8, 8 + i * 24, 8 + rows * 24);
  for (let j = 0; j <= rows; j++) line(image, 8, 8 + j * 24, 8 + columns * 24, 8 + j * 24);
  return image;
}
function expectedCells(columns: number, rows: number): GridCell[] {
  return Array.from({ length: columns * rows }, (_, i) => ({
    x: 8 + (i % columns) * 24,
    y: 8 + Math.floor(i / columns) * 24,
    width: 25,
    height: 25,
    slotsWide: 1,
    slotsHigh: 1,
  }));
}
function countComparisons(image: RgbImage): { result: GridDetection; comparisons: number } {
  const original = Array.prototype.some;
  let comparisons = 0;
  const spy = vi.spyOn(Array.prototype, 'some').mockImplementation(function (
    this: unknown[],
    predicate,
    thisArg
  ) {
    const first = this[0] as Partial<GridCell> | undefined;
    const cells = typeof first?.slotsWide === 'number' && typeof first?.slotsHigh === 'number';
    return original.call(this, (value, index, array) => {
      if (cells) comparisons++;
      return predicate.call(thisArg, value, index, array);
    });
  });
  try {
    return { result: detectGrid(image), comparisons };
  } finally {
    spy.mockRestore();
  }
}
describe('bounded overlap suppression', () => {
  it('keeps overlap checks proportional to local grid neighbors instead of all prior cells', () => {
    const { result, comparisons } = countComparisons(regularGrid(40, 40));
    expect(result.cells).toEqual(expectedCells(40, 40));
    expect(comparisons).toBeLessThan(result.cells.length * 32);
  });
  it('returns every cell of a permitted maximum-pixel dense screenshot without truncation', () => {
    const result = detectGrid(regularGrid(170, 170, 4096));
    expect(result.pitch).toBe(24);
    expect(result.cells).toEqual(expectedCells(170, 170));
  });
  it('preserves stable suppression and row-major ordering of overlapping lattice candidates', () => {
    const image = regularGrid(8, 6);
    for (let i = 0; i <= 8; i++) line(image, 12 + i * 24, 12, 12 + i * 24, 12 + 6 * 24);
    for (let j = 0; j <= 6; j++) line(image, 12, 12 + j * 24, 12 + 8 * 24, 12 + j * 24);
    expect(detectGrid(image).cells).toEqual(expectedCells(8, 6));
  });
  it('indexes the full footprint of a ten-slot cell to suppress weaker interior candidates', () => {
    const image = regularGrid(30, 30);
    for (let i = 2; i <= 10; i++) line(image, 8 + i * 24, 33, 8 + i * 24, 271, 24);
    for (let j = 2; j <= 10; j++) line(image, 33, 8 + j * 24, 271, 8 + j * 24, 24);
    for (let i = 0; i < 10; i++) line(image, 36 + i * 24, 36, 36 + i * 24, 252);
    for (let j = 0; j < 10; j++) line(image, 36, 36 + j * 24, 252, 36 + j * 24);
    const outside = expectedCells(30, 30).filter(
      (cell) => cell.x < 32 || cell.x >= 272 || cell.y < 32 || cell.y >= 272
    );
    const expected = [
      ...outside,
      { x: 32, y: 32, width: 241, height: 241, slotsWide: 10, slotsHigh: 10 },
    ].sort((a, b) => a.y - b.y || a.x - b.x);
    expect(detectGrid(image).cells).toEqual(expected);
  });
});
