// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cellFeatures, rotateClockwise } from '@/utils/stashScan/core/features';
import { detectGrid, type RgbImage } from '@/utils/stashScan/core/grid';
import {
  addCatalogIcon,
  addTemplate,
  createIconIndex,
  matchCell,
} from '@/utils/stashScan/core/matcher';
function image(width: number, height: number, shade = 24): RgbImage {
  return { width, height, data: new Uint8Array(width * height * 3).fill(shade) };
}
function pixel(target: RgbImage, x: number, y: number, color: number[]): void {
  target.data.set(color, (y * target.width + x) * 3);
}
function line(
  target: RgbImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  shade: number
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) pixel(target, x, y, [shade, shade, shade]);
  }
}
function grid(pitch: number, thickness = 1): RgbImage {
  const x = (i: number) => 8 + Math.round(i * pitch);
  const y = (i: number) => 8 + Math.round(i * pitch);
  const target = image(x(8) + 9, y(6) + 9);
  for (let i = 0; i <= 8; i++) line(target, x(i), y(0), x(i) + thickness - 1, y(6), 160);
  for (let j = 0; j <= 6; j++) line(target, x(0), y(j), x(8), y(j) + thickness - 1, 160);
  // One 2x2 item; all other regions remain 1x1 slots.
  line(target, x(3), y(1) + thickness, x(3) + thickness - 1, y(3) - 1, 24);
  line(target, x(2) + thickness, y(2), x(4) - 1, y(2) + thickness - 1, 24);
  return target;
}
function croppedGrid(
  source: RgbImage,
  left: number,
  top: number,
  right: number,
  bottom: number
): RgbImage {
  const width = source.width - left - right;
  const height = source.height - top - bottom;
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const start = ((top + y) * source.width + left) * 3;
    data.set(source.data.subarray(start, start + width * 3), y * width * 3);
  }
  return { data, width, height };
}
function paintIcon(target: RgbImage, seed: number): void {
  for (let y = 15; y < target.height - 16; y++) {
    for (let x = 1; x < target.width - 1; x++) {
      const v = ((Math.floor(x / 7) * 29 + Math.floor(y / 6) * 17) * seed) % 180;
      pixel(target, x, y, [45 + v, 25 + ((v * seed) % 190), 30 + ((v * 3) % 160)]);
    }
  }
}
function paintLabel(target: RgbImage): void {
  for (let y = 3; y < 11; y++) {
    for (let x = target.width - 23; x < target.width - 4; x += 4)
      pixel(target, x, y, [240, 240, 240]);
  }
}
function icon(slotsWide = 1, slotsHigh = 1, seed = 1): RgbImage {
  const target = image(slotsWide * 63 + 1, slotsHigh * 63 + 1);
  paintIcon(target, seed);
  paintLabel(target);
  return target;
}
function features(target: RgbImage, w = 1, h = 1) {
  return cellFeatures(target, 0, 0, target.width, target.height, w, h);
}
function add(
  index: ReturnType<typeof createIconIndex>,
  id: string,
  target: RgbImage,
  w = 1,
  h = 1
): void {
  expect(addCatalogIcon(index, { id, shortName: id, width: w, height: h, grid: target })).toBe(
    true
  );
}
describe('pinned cultist-circle grid detection', () => {
  it.each([63, 42, 84])(
    'detects original and scaled %s-pixel lattices with merged cells',
    (pitch) => {
      const result = detectGrid(grid(pitch));
      expect(result.pitch).toBeCloseTo(pitch, 1);
      expect(result.cells).toHaveLength(45);
      expect(
        result.cells.filter((cell) => cell.slotsWide === 2 && cell.slotsHigh === 2)
      ).toHaveLength(1);
      expect(result.cells[0]).toMatchObject({ x: 8, y: 8, slotsWide: 1, slotsHigh: 1 });
    }
  );
  it.each([
    [8, 0, 0, 0],
    [0, 8, 0, 0],
    [0, 0, 8, 0],
    [0, 0, 0, 8],
    [8, 8, 8, 8],
    [0, 0, 7, 0],
    [0, 0, 0, 7],
    [7, 7, 7, 7],
  ])('retains grid cells with borders at image edges %#', (left, top, right, bottom) => {
    const cropped = croppedGrid(grid(63), left!, top!, right!, bottom!);
    expect(detectGrid(cropped).cells).toHaveLength(45);
  });
  it('detects fractional-scale two-pixel borders with the upstream subpixel refinement', () => {
    const result = detectGrid(grid(52.5, 2));
    expect(result.pitch).toBeCloseTo(52.5, 0);
    expect(result.cells).toHaveLength(45);
    expect(
      result.cells.filter((cell) => cell.slotsWide === 2 && cell.slotsHigh === 2)
    ).toHaveLength(1);
  });
  it('retains the upstream double-pitch result for idealized fractional one-pixel borders', () => {
    const result = detectGrid(grid(52.5));
    expect(result.pitch).toBe(105);
    expect(result.cells).toHaveLength(11);
  });
  it('handles two-pixel borders and an interrupted separator', () => {
    const target = grid(63, 2);
    line(target, 71, 90, 72, 101, 24);
    expect(detectGrid(target).cells).toHaveLength(45);
  });
  it('finds grey borders beside the brighter coloured frame newer clients draw', () => {
    // Pixels measured across a 1440p border: teal slot, cyan glow, 2px grey line, then the
    // slot again or, on some items only, a cyan frame. Glow and frame outshine the line.
    const pitch = 84;
    const at = (i: number) => 8 + i * pitch;
    const target = image(at(8) + 9, at(6) + 9);
    for (let p = 0; p < target.width * target.height; p++) target.data.set([26, 52, 62], p * 3);
    const across = [
      [-1, [56, 86, 96]],
      [0, [73, 81, 84]],
      [1, [73, 81, 84]],
    ] as const;
    for (const [offset, color] of across) {
      for (let i = 0; i <= 8; i++) {
        for (let y = at(0); y <= at(6) + 1; y++) pixel(target, at(i) + offset, y, [...color]);
      }
      for (let j = 0; j <= 6; j++) {
        for (let x = at(0); x <= at(8) + 1; x++) pixel(target, x, at(j) + offset, [...color]);
      }
    }
    for (let j = 0; j < 6; j++) {
      for (let i = j % 2; i < 8; i += 2) {
        for (let t = 2; t < pitch; t++) {
          pixel(target, at(i) + 2, at(j) + t, [80, 126, 134]);
          pixel(target, at(i) + t, at(j) + 2, [80, 126, 134]);
        }
      }
    }
    expect(detectGrid(target).cells).toHaveLength(48);
  });
  it('accepts a separator two pixels off its lattice line at 1080p scale and above', () => {
    // JPEG chroma blur can move a ridge onto the item frame beside the grid line.
    const target = grid(84);
    const x = 8 + 5 * 84;
    line(target, x, 8 + 4 * 84 + 1, x, 8 + 5 * 84 - 1, 24);
    line(target, x + 2, 8 + 4 * 84 + 1, x + 2, 8 + 5 * 84 - 1, 160);
    expect(detectGrid(target).cells).toHaveLength(45);
  });
  it('returns no cells for flat or tiny valid images', () => {
    expect(detectGrid(image(320, 240))).toEqual({ pitch: 0, cells: [] });
    expect(detectGrid(image(1, 1))).toEqual({ pitch: 0, cells: [] });
  });
});
describe('art and glyph matching', () => {
  it('ranks an exact item first and returns distinct-item alternatives', () => {
    const index = createIconIndex();
    const target = icon();
    add(index, 'target', target);
    add(index, 'target', target);
    add(index, 'other', icon(1, 1, 5));
    const result = matchCell(features(target), index);
    expect(result.empty).toBe(false);
    expect(result.matches.map((match) => match.itemId)).toEqual(['target', 'other']);
    expect(result.matches[0]!.score).toBeGreaterThan(0.99);
    expect(result.margin).toBeCloseTo(result.matches[0]!.score - result.matches[1]!.score, 8);
  });
  it('normalizes a screenshot at two-thirds icon scale before matching', () => {
    const source = icon(1, 2);
    const scaled = image(43, 85);
    for (let y = 0; y < scaled.height; y++) {
      for (let x = 0; x < scaled.width; x++) {
        const offset = (Math.round(y * 1.5) * source.width + Math.round(x * 1.5)) * 3;
        pixel(scaled, x, y, [...source.data.subarray(offset, offset + 3)]);
      }
    }
    const index = createIconIndex();
    add(index, 'target', source, 1, 2);
    add(index, 'other', icon(1, 2, 5), 1, 2);
    const result = matchCell(features(scaled, 1, 2), index);
    expect(result.matches[0]!.itemId).toBe('target');
    expect(result.matches[0]!.artScore).toBeGreaterThan(0.9);
  });
  it('retains the pinned source feature values for deterministic RGB input', () => {
    // Golden values computed from upstream d6228d1; no image decoder or network involved.
    const width = 127;
    const height = 127;
    const data = Uint8Array.from(
      { length: width * height * 3 },
      (_, i) => (i * 17 + Math.floor(i / 31) * 43) % 256
    );
    const cell = features({ width, height, data }, 2, 2);
    expect([...cell.artCoarse.slice(0, 6)]).toEqual([
      -0.0361531600356102, -0.03113105148077011, -0.0021568266674876213, -0.06388027966022491,
      0.045118413865566254, 0.020517762750387192,
    ]);
    expect([...cell.artFine.slice(0, 6)]).toEqual([
      0.0029610060155391693, 0.003183454740792513, 0.012405467219650745, -0.013591736555099487,
      -0.013369272463023663, -0.010594704188406467,
    ]);
    expect([...cell.text.slice(0, 6)]).toEqual([
      0.04291767254471779, -0.02963750809431076, -0.0510919988155365, -0.020275551825761795,
      -0.019105302169919014, -0.048491451889276505,
    ]);
    expect(cell.textInk).toBe(0.3021091811414392);
    expect(cell.artContrast).toBeCloseTo(10.026699499621444, 10);
  });
  it('creates and matches the rotated non-square template', () => {
    const index = createIconIndex();
    const target = icon(1, 2);
    add(index, 'long', target, 1, 2);
    expect(index.size).toBe(2);
    const rotated = rotateClockwise(target);
    // Rotated art is retained; the in-game name remains upright, right-aligned.
    line(rotated, 1, 1, rotated.width - 2, 13, 24);
    for (let y = 1; y <= 13; y++) {
      for (let x = 1; x < target.width - 1; x++) {
        const offset = (y * target.width + x) * 3;
        pixel(rotated, rotated.width - target.width + x, y, [
          ...target.data.subarray(offset, offset + 3),
        ]);
      }
    }
    const result = matchCell(features(rotated, 2, 1), index);
    expect(result.matches[0]).toMatchObject({ itemId: 'long', rotated: true });
    expect(result.matches[0]!.artScore).toBeGreaterThan(0.99);
  });
  it('recenters a wide upright label after cropping it for a rotated narrow item', () => {
    const source = image(190, 64);
    paintIcon(source, 1);
    for (let y = 3; y < 11; y++) {
      for (let x = 130; x < 187; x += 3) pixel(source, x, y, [240, 240, 240]);
    }
    const index = createIconIndex();
    add(index, 'wide', source, 3, 1);
    const rotated = rotateClockwise(source);
    for (let y = 1; y <= 13; y++) {
      rotated.data.fill(24, (y * 64 + 1) * 3, (y * 64 + 63) * 3);
      for (let x = 0; x < 61; x++) {
        const start = (y * source.width + 128 + x) * 3;
        rotated.data.set(source.data.subarray(start, start + 3), (y * 64 + 2 + x) * 3);
      }
    }
    const text = index.bySize.get('1x3')![0]!.features.text;
    const mean =
      Array.from(text.values).reduce((sum, value) => sum + value * text.scale, 0) /
      text.values.length;
    expect(Math.abs(mean)).toBeLessThan(0.0005);
    expect(matchCell(features(rotated, 1, 3), index).matches[0]!.textScore).toBeGreaterThan(0.99);
  });
  it('recognizes empty regions and preserves occupied-but-unmatched regions', () => {
    const index = createIconIndex();
    expect(matchCell(features(image(64, 64)), index)).toEqual({
      empty: true,
      matches: [],
      margin: 0,
    });
    expect(matchCell(features(icon()), index)).toEqual({ empty: false, matches: [], margin: 0 });
  });
  it('keeps a dark, unlabelled item occupied instead of treating it as an empty slot', () => {
    // A downscaled dark item: no readable label and about 8 levels of art contrast.
    const target = image(64, 64);
    for (let y = 16; y < 48; y++) {
      for (let x = 1; x < 63; x++) {
        const v = 24 + ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 12 : -12);
        pixel(target, x, y, [v, v, v]);
      }
    }
    const cell = features(target);
    expect(cell.artContrast).toBeGreaterThan(5);
    expect(cell.artContrast).toBeLessThan(12);
    expect(matchCell(cell, createIconIndex()).empty).toBe(false);
  });
  it('matches a short name drawn higher in game than in the catalog icon', () => {
    const index = createIconIndex();
    const source = icon();
    add(index, 'target', source);
    add(index, 'other', icon(1, 1, 5));
    const raised = image(64, 64);
    raised.data.set(source.data);
    // In-game labels sit about two template pixels above the Tarkov.dev label.
    for (let y = 1; y < 13; y++) {
      for (let x = 1; x < 63; x++) {
        const from = ((y + 2) * 64 + x) * 3;
        pixel(raised, x, y, y + 2 < 13 ? [...source.data.subarray(from, from + 3)] : [24, 24, 24]);
      }
    }
    const result = matchCell(features(raised), index);
    expect(result.matches[0]).toMatchObject({ itemId: 'target' });
    expect(result.matches[0]!.textScore).toBeGreaterThan(0.95);
  });
  it('keeps a label that already lines up when the offset text and art lists miss it', () => {
    // Labels as two bright bands. The decoy's bands sit two rows lower, so it matches the
    // lowered cell text exactly, and its art matches the cell too.
    const labelled = (seed: number, rows: number[]) => {
      const target = image(64, 64);
      paintIcon(target, seed);
      for (const y of rows) for (let x = 4; x < 60; x++) pixel(target, x, y, [240, 240, 240]);
      return target;
    };
    const index = createIconIndex();
    add(index, 'target', labelled(7, [3, 4, 8, 9]));
    // More decoy templates than either coarse list keeps.
    for (let i = 0; i < 26; i++) add(index, 'decoy', labelled(2, [5, 6, 10, 11]));
    const result = matchCell(features(labelled(2, [3, 4, 8, 9])), index);
    expect(result.matches.map((match) => match.itemId)).toContain('target');
  });
  it('rejects wrong catalog dimensions without mutating the index', () => {
    const index = createIconIndex();
    expect(
      addCatalogIcon(index, { id: 'bad', shortName: 'bad', width: 2, height: 1, grid: icon() })
    ).toBe(false);
    expect(index.size).toBe(0);
  });
});
describe('fail-closed numeric and allocation bounds', () => {
  it.each([0, -1, NaN, Infinity, 1.5, 16_385])('rejects invalid image width %s', (width) => {
    expect(() => detectGrid({ width, height: 1, data: new Uint8Array(3) })).toThrow();
  });
  it.each([0, -1, NaN, Infinity, 1.5, 16_385])('rejects invalid image height %s', (height) => {
    expect(() => detectGrid({ width: 1, height, data: new Uint8Array(3) })).toThrow();
  });
  it('rejects pixel budget overflow, byte mismatch, and non-byte storage before detection', () => {
    expect(() => detectGrid({ width: 8192, height: 8192, data: new Uint8Array(0) })).toThrow(
      RangeError
    );
    expect(() => detectGrid({ width: 64, height: 64, data: new Uint8Array(3) })).toThrow(
      RangeError
    );
    expect(() =>
      detectGrid({ width: 1, height: 1, data: [1, 2, 3] as unknown as Uint8Array })
    ).toThrow(TypeError);
  });
  it('rejects out-of-image, fractional and unbounded cell regions', () => {
    const target = icon();
    expect(() => cellFeatures(target, -1, 0, 64, 64, 1, 1)).toThrow(RangeError);
    expect(() => cellFeatures(target, 0, 0, 65, 64, 1, 1)).toThrow(RangeError);
    expect(() => cellFeatures(target, 0.5, 0, 63, 64, 1, 1)).toThrow(RangeError);
    expect(() => cellFeatures(target, 0, 0, 64, 64, 11, 1)).toThrow(RangeError);
  });
  it('rejects nonfinite cell vectors and malformed serialized templates', () => {
    const index = createIconIndex();
    const cell = features(icon());
    cell.artFine[0] = NaN;
    expect(() => matchCell(cell, index)).toThrow(RangeError);
    expect(() => matchCell({ ...features(icon()), textInk: -1 }, index)).toThrow(RangeError);
    expect(() => matchCell({ ...features(icon()), artContrast: -1 }, index)).toThrow(RangeError);
    expect(() =>
      matchCell({ ...features(icon()), text: [] as unknown as Float32Array }, index)
    ).toThrow(TypeError);
    add(index, 'good', icon());
    const template = index.bySize.get('1x1')![0]!;
    const destination = createIconIndex();
    expect(() =>
      addTemplate(destination, 1, 1, {
        ...template,
        features: { ...template.features, artFine: { values: new Int8Array(1), scale: 1 } },
      })
    ).toThrow(RangeError);
    expect(() =>
      addTemplate(destination, 1, 1, {
        ...template,
        features: {
          ...template.features,
          artFine: { ...template.features.artFine, scale: Infinity },
        },
      })
    ).toThrow(RangeError);
    expect(destination.size).toBe(0);
  });
});
