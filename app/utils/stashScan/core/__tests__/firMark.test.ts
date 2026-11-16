// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { detectFirMark, FIR_MARK, firMarkScore } from '@/utils/stashScan/core/firMark';
import type { GridCell, RgbImage } from '@/utils/stashScan/core/grid';
const BACKGROUND = 30;
function cellImage(pitch: number, slotsHigh = 1): { image: RgbImage; cell: GridCell } {
  const width = pitch + 1;
  const height = slotsHigh * pitch + 1;
  const image = { width, height, data: new Uint8Array(width * height * 3).fill(BACKGROUND) };
  return { image, cell: { x: 0, y: 0, width, height, slotsWide: 1, slotsHigh } };
}
function shade(image: RgbImage, x: number, y: number, value: number): void {
  const v = Math.max(0, Math.min(255, Math.round(value)));
  image.data.set([v, v, v], (y * image.width + x) * 3);
}
/** Paints the measured mark, scaled like the game UI, `lift` template pixels above its slot. */
function paintMark(image: RgbImage, pitch: number, lift = 0): void {
  const scale = pitch / 63;
  const right = image.width - 1;
  const bottom = image.height - 1;
  for (let y = 0; y < Math.round(FIR_MARK.height * scale); y++) {
    for (let x = 0; x < Math.round(FIR_MARK.width * scale); x++) {
      const v =
        FIR_MARK.values[
          Math.min(FIR_MARK.height - 1, Math.floor(y / scale)) * FIR_MARK.width +
            Math.min(FIR_MARK.width - 1, Math.floor(x / scale))
        ]!;
      shade(
        image,
        Math.round(right - 15 * scale) + x,
        Math.round(bottom - (14 + lift) * scale) + y,
        BACKGROUND + ((v + 47) / 146) * 120
      );
    }
  }
}
function paintCount(image: RgbImage, pitch: number): void {
  // A white "20/20" line where stack counts sit, under a lifted mark.
  const scale = pitch / 63;
  for (let y = Math.round(image.height - 13 * scale); y < image.height - 3 * scale; y++) {
    for (let x = Math.round(image.width - 30 * scale); x < image.width - 3; x += 3)
      shade(image, x, y, 230);
  }
}
function paintRing(image: RgbImage, pitch: number): void {
  // A bare ring where the mark would be: round item art, no tick.
  const scale = pitch / 63;
  const cx = image.width - 1 - 8.5 * scale;
  const cy = image.height - 1 - 8.5 * scale;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const distance = Math.hypot(x - cx, y - cy) / scale;
      if (distance > 4 && distance < 6) shade(image, x, y, 150);
    }
  }
}
function paintTexture(image: RgbImage): void {
  for (let y = 1; y < image.height - 1; y++) {
    for (let x = 1; x < image.width - 1; x++) shade(image, x, y, 40 + ((x * 37 + y * 91) % 120));
  }
}
describe('found-in-raid checkmark detection', () => {
  it.each([63, 84, 126])('finds the mark at %s pixels per slot', (pitch) => {
    const { image, cell } = cellImage(pitch);
    paintMark(image, pitch);
    expect(firMarkScore(image, cell)).toBeGreaterThan(0.9);
    expect(detectFirMark(image, cell)).toBe(true);
  });
  it('finds the mark raised above a stack count on a taller item', () => {
    const { image, cell } = cellImage(63, 2);
    paintCount(image, 63);
    paintMark(image, 63, 16);
    expect(detectFirMark(image, cell)).toBe(true);
  });
  it('ignores bright item art touching the corners around the mark', () => {
    const { image, cell } = cellImage(63);
    paintMark(image, 63);
    // The 14x12 template window spans x 48-61, y 49-60 here; its 2x2 corners lie outside the
    // 6px disc that is compared.
    for (const [x0, y0] of [
      [48, 49],
      [60, 49],
      [48, 59],
      [60, 59],
    ] as const) {
      for (let y = y0; y < y0 + 2; y++) for (let x = x0; x < x0 + 2; x++) shade(image, x, y, 250);
    }
    expect(firMarkScore(image, cell)).toBeGreaterThan(0.9);
  });
  it('ignores a mark too faint to tell from compression noise', () => {
    const { image, cell } = cellImage(63);
    paintMark(image, 63);
    for (let i = 0; i < image.data.length; i++)
      image.data[i] = BACKGROUND + Math.round((image.data[i]! - BACKGROUND) / 12);
    expect(firMarkScore(image, cell)).toBe(0);
    expect(detectFirMark(image, cell)).toBe(false);
  });
  it('reports no mark for flat corners, item texture and round art without a tick', () => {
    for (const paint of [() => {}, paintTexture, paintRing]) {
      const { image, cell } = cellImage(63);
      paint(image, 63);
      expect(firMarkScore(image, cell)).toBeLessThan(0.65);
      expect(detectFirMark(image, cell)).toBe(false);
    }
  });
  it('leaves FIR unknown when slots are too small to resolve the mark', () => {
    const { image, cell } = cellImage(39);
    paintMark(image, 39);
    expect(detectFirMark(image, cell)).toBe(false);
  });
});
