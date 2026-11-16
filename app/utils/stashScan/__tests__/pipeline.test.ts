// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { featureShape, FEATURE_VERSION } from '@/utils/stashScan/core/features';
import { validateRect } from '@/utils/stashScan/decodeImage';
import { checkDimensions, imageDimensions } from '@/utils/stashScan/imageHeader';
import { decodeScanShard, encodeScanShard } from '@/utils/stashScan/indexCodec';
import { overlapsRegion, splitRegion } from '@/utils/stashScan/regions';
import {
  blocksImport,
  needsReview,
  reviewCell,
  reviewedTotals,
  reviewState,
  selectItem,
} from '@/utils/stashScan/review';
import {
  SCAN_LIMITS,
  type ReviewedCell,
  type ScanCatalog,
  type ScanCell,
  type ScanItem,
  type ScanRect,
} from '@/utils/stashScan/types';
import type { IconTemplate } from '@/utils/stashScan/core/matcher';
const item = (id = 'single', maxStack = 1): ScanItem => ({
  id,
  name: id,
  shortName: id,
  width: 1,
  height: 1,
  maxStack,
});
/** A suggestion whose art and label are only moderately similar, so no single signal decides. */
const candidate = (itemId: string, score: number, artScore = 0.6, textScore = 0.6) => ({
  itemId,
  score,
  artScore,
  textScore,
});
const cell = (patch: Partial<ScanCell> = {}): ScanCell => ({
  key: 1,
  x: 8,
  y: 8,
  width: 64,
  height: 64,
  slotsWide: 1,
  slotsHigh: 1,
  empty: false,
  candidates: [candidate('single', 0.9)],
  margin: 0.2,
  fir: false,
  stack: null,
  ...patch,
});
const row = (patch: Partial<ReviewedCell> = {}): ReviewedCell => ({
  cell: cell(),
  itemId: 'single',
  quantity: 1,
  raidStatus: 'unknown',
  reviewed: true,
  excluded: false,
  ...patch,
});
const error = (code: string) => `stash_import.errors.${code}`;
describe('observation review and quantity accounting', () => {
  it('keeps a strong nonstack suggestion as one item with unknown FIR status', () => {
    const reviewed = reviewCell(cell(), new Map([['single', item()]]));
    expect(reviewed).toMatchObject({
      itemId: 'single',
      quantity: 1,
      raidStatus: 'unknown',
      reviewed: true,
      excluded: false,
    });
    expect(needsReview(reviewed)).toBe(false);
    expect(reviewedTotals([reviewed])).toEqual([
      { itemId: 'single', fir: 0, nonFir: 0, unknown: 1 },
    ]);
  });
  it('marks an item FIR when the scan saw its checkmark, and it stays editable', () => {
    const reviewed = reviewCell(cell({ fir: true }), new Map([['single', item()]]));
    expect(reviewed.raidStatus).toBe('fir');
    expect(reviewedTotals([reviewed])).toEqual([
      { itemId: 'single', fir: 1, nonFir: 0, unknown: 0 },
    ]);
    reviewed.raidStatus = 'non_fir';
    expect(reviewedTotals([reviewed])).toEqual([
      { itemId: 'single', fir: 0, nonFir: 1, unknown: 0 },
    ]);
  });
  it('requires an explicit quantity for stackable items even with strong similarity', () => {
    const reviewed = reviewCell(cell(), new Map([['single', item('single', 60)]]));
    expect(reviewed).toMatchObject({ quantity: null, reviewed: true, raidStatus: 'unknown' });
    expect(needsReview(reviewed)).toBe(true);
    expect(() => reviewedTotals([reviewed])).toThrow(error('review_required'));
    reviewed.quantity = 37;
    expect(reviewedTotals([reviewed])).toEqual([
      { itemId: 'single', fir: 0, nonFir: 0, unknown: 37 },
    ]);
  });
  it('routes weak, ambiguous, absent, and unidentified suggestions to review', () => {
    const items = new Map([['single', item()]]);
    expect(reviewCell(cell({ candidates: [candidate('single', 0.49)] }), items).itemId).toBe('');
    expect(needsReview(reviewCell(cell({ candidates: [] }), items))).toBe(true);
    expect(needsReview(reviewCell(cell({ margin: 0.079 }), items))).toBe(true);
    expect(needsReview(reviewCell(cell({ candidates: [candidate('single', 0.719)] }), items))).toBe(
      true
    );
    expect(needsReview(row({ itemId: '' }))).toBe(true);
    expect(needsReview(row({ reviewed: false }))).toBe(true);
  });
  it('manual item selection clears exclusion and resets stack quantity without guessing FIR', () => {
    const reviewed = row({ excluded: true, quantity: 99, reviewed: false, raidStatus: 'fir' });
    selectItem(reviewed, item('ammo', 60));
    expect(reviewed).toMatchObject({
      itemId: 'ammo',
      excluded: false,
      reviewed: true,
      quantity: null,
      raidStatus: 'fir',
    });
    selectItem(reviewed, item('single'));
    expect(reviewed.quantity).toBe(1);
  });
  it('fills a stack amount read from the icon, and only when the item can hold it', () => {
    const items = new Map([['single', item('single', 50)]]);
    expect(reviewCell(cell({ stack: 4 }), items)).toMatchObject({ quantity: 4, reviewed: true });
    expect(needsReview(reviewCell(cell({ stack: 4 }), items))).toBe(false);
    // A clear corner means one item; an unread or impossible count is left for the player.
    expect(reviewCell(cell({ stack: 1 }), items).quantity).toBe(1);
    expect(reviewCell(cell({ stack: null }), items).quantity).toBeNull();
    expect(reviewCell(cell({ stack: 51 }), items).quantity).toBeNull();
    // Picking another item keeps the count that was read from the icon.
    const reviewed = reviewCell(cell({ stack: 4 }), new Map());
    selectItem(reviewed, item('ammo', 60));
    expect(reviewed.quantity).toBe(4);
    // An item that cannot stack showing a plain number other than 1 is probably misidentified.
    const single = new Map([['single', item()]]);
    expect(reviewCell(cell({ stack: 2 }), single).quantity).toBeNull();
    expect(reviewCell(cell({ stack: null }), single).quantity).toBe(1);
    expect(reviewCell(cell({ stack: 1 }), single).quantity).toBe(1);
    // Choosing that item explicitly settles it at one unit, so the row can be confirmed.
    const doubted = reviewCell(cell({ stack: 2 }), single);
    selectItem(doubted, item());
    expect(doubted.quantity).toBe(1);
    expect(needsReview(doubted)).toBe(false);
  });
  it('accepts one decisive signal unless another candidate ties on it', () => {
    const items = new Map([
      ['tube', item('tube')],
      ['tape', item('tape')],
    ]);
    const confident = (candidates: ReturnType<typeof candidate>[]) =>
      !needsReview(reviewCell(cell({ candidates, margin: 0.04 }), items));
    // Near-identical art with a differently rendered label.
    expect(
      confident([candidate('tube', 0.8, 0.99, 0.7), candidate('tape', 0.76, 0.51, 0.89)])
    ).toBe(true);
    // An exact label on a tinted or modded weapon whose art does not match.
    expect(
      confident([candidate('tube', 0.53, -0.26, 0.95), candidate('tape', 0.46, 0.05, 0.8)])
    ).toBe(true);
    // Two items sharing an icon, or a short name, cannot be told apart by it.
    expect(
      confident([candidate('tube', 0.66, 0.99, 0.5), candidate('tape', 0.62, 0.99, 0.4)])
    ).toBe(false);
    expect(confident([candidate('tube', 0.6, 0.3, 0.95), candidate('tape', 0.58, 0.2, 0.9)])).toBe(
      false
    );
  });
  it('requires identity review even when the needed item is outside every suggestion', () => {
    const meds = row({
      itemId: 'mayo',
      reviewed: false,
      cell: cell({ candidates: [candidate('mayo', 0.72), candidate('mask', 0.71)] }),
    });
    const tracked = new Set(['meds']);
    expect(blocksImport(meds)).toBe(true);
    expect(reviewState(meds, tracked)).toBe('check');
    expect(() => reviewedTotals([meds], tracked)).toThrow(error('review_required'));
    expect(blocksImport({ ...meds, itemId: '', reviewed: true })).toBe(true);
    expect(blocksImport({ ...meds, cell: cell({ candidates: [] }), itemId: '' })).toBe(true);
    expect(blocksImport({ ...meds, excluded: true })).toBe(false);
  });
  it('groups only settled unneeded items, while unread amounts still block', () => {
    const weapon = row({
      itemId: 'rifle',
      reviewed: true,
      quantity: 1,
      cell: cell({ candidates: [candidate('rifle', 0.5), candidate('shotgun', 0.49)] }),
    });
    const tracked = new Set(['single']);
    expect(needsReview(weapon)).toBe(false);
    expect(blocksImport(weapon)).toBe(false);
    expect(reviewState(weapon, tracked)).toBe('skip');
    expect(reviewedTotals([weapon, row()], tracked)).toEqual([
      { itemId: 'single', fir: 0, nonFir: 0, unknown: 1 },
    ]);
    // Unknown identity and unread or contradictory amounts remain reviewable.
    const lookalike = { ...weapon, reviewed: false };
    expect(blocksImport(lookalike)).toBe(true);
    const unread = { ...weapon, quantity: null };
    expect(blocksImport(unread)).toBe(true);
    expect(() => reviewedTotals([unread], tracked)).toThrow(error('review_required'));
    expect(() => reviewedTotals([lookalike], tracked)).toThrow(error('review_required'));
    expect(() =>
      reviewedTotals([{ ...weapon, quantity: SCAN_LIMITS.quantity + 1 }], tracked)
    ).toThrow(error('quantity'));
    expect(reviewState(row(), tracked)).toBe('ok');
    expect(reviewState(row({ excluded: true }), tracked)).toBe('removed');
    expect(reviewState(lookalike, tracked)).toBe('check');
    expect(blocksImport({ ...weapon, itemId: '' })).toBe(true);
  });
  it('ignores excluded incomplete rows and automatically excludes detected empty slots', () => {
    expect(reviewCell(cell({ empty: true }), new Map()).excluded).toBe(true);
    const excluded = row({ itemId: '', reviewed: false, quantity: null, excluded: true });
    expect(needsReview(excluded)).toBe(false);
    expect(reviewedTotals([excluded, row()])).toEqual([
      { itemId: 'single', fir: 0, nonFir: 0, unknown: 1 },
    ]);
    expect(reviewedTotals([excluded])).toEqual([]);
  });
  it('groups physical quantities once per item and keeps FIR, non-FIR, and unknown separate', () => {
    expect(
      reviewedTotals([
        row({ quantity: 2, raidStatus: 'fir' }),
        row({ quantity: 3, raidStatus: 'non_fir' }),
        row({ quantity: 5 }),
        row({ quantity: 7, raidStatus: 'fir' }),
        row({ itemId: 'other', quantity: 11 }),
      ])
    ).toEqual([
      { itemId: 'single', fir: 9, nonFir: 3, unknown: 5 },
      { itemId: 'other', fir: 0, nonFir: 0, unknown: 11 },
    ]);
  });
  it.each([null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'blocks incomplete or invalid included quantity %s',
    (quantity) => {
      expect(() => reviewedTotals([row({ quantity })])).toThrow(error('review_required'));
    }
  );
  it('accepts the quantity boundary and rejects both one-row and cross-status overflow', () => {
    expect(reviewedTotals([row({ quantity: SCAN_LIMITS.quantity })])[0]!.unknown).toBe(
      SCAN_LIMITS.quantity
    );
    expect(() => reviewedTotals([row({ quantity: SCAN_LIMITS.quantity + 1 })])).toThrow(
      error('quantity')
    );
    expect(() =>
      reviewedTotals([
        row({ quantity: SCAN_LIMITS.quantity, raidStatus: 'fir' }),
        row({ quantity: 1, raidStatus: 'non_fir' }),
      ])
    ).toThrow(error('quantity'));
  });
});
describe('region correction geometry', () => {
  const whole: ScanRect = { x: 10, y: 20, width: 127, height: 127, slotsWide: 2, slotsHigh: 2 };
  it.each([
    [0, 1],
    [1, 0],
    [11, 1],
    [1, 11],
  ])(
    'rejects unsupported slot dimensions %s by %s as an invalid region',
    (slotsWide, slotsHigh) => {
      expect(() =>
        validateRect(
          { ...whole, slotsWide: slotsWide!, slotsHigh: slotsHigh! },
          { width: 200, height: 200 }
        )
      ).toThrow(error('region_invalid'));
    }
  );
  it.each([8, 14])('rejects splits with undersized parts for %spx regions', (size) => {
    expect(() => splitRegion({ ...whole, width: size, height: size }, 2, 2)).toThrow(
      error('region_invalid')
    );
  });
  it('allows 8px parts on the minimum shared-border extent', () => {
    const parts = splitRegion({ ...whole, width: 15, height: 15 }, 2, 2);
    expect(parts.every((part) => part.width === 8 && part.height === 8)).toBe(true);
  });
  it('splits row-major cells that share only their border pixels', () => {
    const parts = splitRegion(whole, 2, 2);
    expect(parts).toEqual([
      { x: 10, y: 20, width: 64, height: 64, slotsWide: 1, slotsHigh: 1 },
      { x: 73, y: 20, width: 64, height: 64, slotsWide: 1, slotsHigh: 1 },
      { x: 10, y: 83, width: 64, height: 64, slotsWide: 1, slotsHigh: 1 },
      { x: 73, y: 83, width: 64, height: 64, slotsWide: 1, slotsHigh: 1 },
    ]);
    expect(parts[0]!.x + parts[0]!.width - 1).toBe(parts[1]!.x);
    expect(overlapsRegion(parts[0]!, parts[1]!)).toBe(false);
    expect(overlapsRegion(parts[0]!, parts[2]!)).toBe(false);
  });
  it('distinguishes interior redraw overlap from shared borders and nearby detections', () => {
    const first = splitRegion(whole, 2, 2)[0]!;
    expect(overlapsRegion(first, first)).toBe(true);
    expect(overlapsRegion(first, { ...first, x: first.x + first.width - 2 })).toBe(false);
    expect(overlapsRegion(first, { ...first, x: first.x + first.width - 3 })).toBe(true);
    expect(overlapsRegion(first, { ...first, y: first.y + first.height + 1 })).toBe(false);
    const sibling = { ...first, x: first.x + 63 };
    const redraw = { ...first, x: first.x + 4, width: first.width - 8 };
    expect([first, sibling].filter((region) => !overlapsRegion(redraw, region))).toEqual([sibling]);
  });
  it('preserves the total extent at fractional screenshot scale', () => {
    const parts = splitRegion({ ...whole, width: 106, height: 106 }, 2, 2);
    expect(parts[0]!.width).toBe(54);
    expect(parts[1]!.width).toBe(53);
    expect(parts[1]!.x + parts[1]!.width).toBe(whole.x + 106);
    expect(parts[3]!.y + parts[3]!.height).toBe(whole.y + 106);
  });
  it.each([
    [0, 1],
    [-1, 1],
    [1.5, 1],
    [3, 1],
    [1, 3],
    [NaN, 1],
    [1, Infinity],
  ])('rejects nondivisible or invalid splits %s by %s', (columns, rows) => {
    expect(() => splitRegion(whole, columns!, rows!)).toThrow(error('region_invalid'));
  });
});
function ascii(bytes: Uint8Array, offset: number, text: string): void {
  bytes.set(
    Uint8Array.from(text, (char) => char.charCodeAt(0)),
    offset
  );
}
function png(width = 640, height = 480): Uint8Array {
  const bytes = new Uint8Array(30);
  ascii(bytes, 0, '\x89PNG\r\n\x1a\n');
  ascii(bytes, 12, 'IHDR');
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
function jpeg(width = 640, height = 480): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0xff, 0xd8, 0xff, 0xe1, 0, 4, 0, 0, 0xff, 0xc2, 0, 11, 8]);
  const view = new DataView(bytes.buffer);
  view.setUint16(13, height);
  view.setUint16(15, width);
  return bytes;
}
function jpegWithPrefix(prefix: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(2 + prefix.length + 30);
  bytes.set([0xff, 0xd8]);
  bytes.set(prefix, 2);
  bytes.set(jpeg().subarray(8), 2 + prefix.length);
  return bytes;
}
function webp(chunk: string, width = 640, height = 480): Uint8Array {
  const bytes = new Uint8Array(30);
  ascii(bytes, 0, 'RIFF');
  ascii(bytes, 8, 'WEBP');
  ascii(bytes, 12, chunk);
  writeWebpDimensions(bytes, chunk, width, height);
  return bytes;
}
function writeWebpDimensions(
  bytes: Uint8Array,
  chunk: string,
  width: number,
  height: number
): void {
  const view = new DataView(bytes.buffer);
  if (chunk === 'VP8X') {
    bytes.set([(width - 1) & 255, ((width - 1) >>> 8) & 255, (width - 1) >>> 16], 24);
    bytes.set([(height - 1) & 255, ((height - 1) >>> 8) & 255, (height - 1) >>> 16], 27);
  } else if (chunk === 'VP8L') {
    view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  } else {
    view.setUint16(26, width, true);
    view.setUint16(28, height, true);
  }
}
describe('raster header allocation guards', () => {
  it.each([png(), jpeg(), webp('VP8X'), webp('VP8L'), webp('VP8 ')])(
    'reads supported static raster dimensions',
    (bytes) => {
      expect(imageDimensions(bytes)).toEqual([640, 480]);
    }
  );
  it('respects a byte view offset instead of reading its backing-buffer prefix', () => {
    const wrapped = new Uint8Array(50);
    wrapped.set(png(), 11);
    expect(imageDimensions(wrapped.subarray(11, 41))).toEqual([640, 480]);
  });
  it.each([
    [0, 1],
    [-1, 1],
    [1.5, 1],
    [NaN, 1],
    [1, Infinity],
    [SCAN_LIMITS.axis + 1, 1],
    [8192, 8192],
  ])('blocks invalid or overbudget dimensions %s by %s', (width, height) => {
    expect(() => checkDimensions(width!, height!)).toThrow(error('image_size'));
  });
  it('accepts exact axis and pixel limits and rejects a header advertising too many pixels', () => {
    expect(() => checkDimensions(SCAN_LIMITS.axis, 1)).not.toThrow();
    expect(imageDimensions(png(4096, 4096))).toEqual([4096, 4096]);
    expect(() => imageDimensions(png(8192, 8192))).toThrow(error('image_size'));
  });
  it('rejects unsupported types and truncated or oversized files before parsing', () => {
    expect(() => imageDimensions(new Uint8Array(30))).toThrow(error('image_type'));
    expect(() => imageDimensions(png().subarray(0, 29))).toThrow(error('image_size'));
    expect(() => imageDimensions(new Uint8Array(SCAN_LIMITS.fileBytes + 1))).toThrow(
      error('image_size')
    );
  });
  it('bounds JPEG marker and fill work before a late valid frame', () => {
    expect(() => imageDimensions(jpegWithPrefix(new Uint8Array(8192).fill(0xff)))).toThrow(
      error('image_invalid')
    );
    const segments = new Uint8Array(8192 * 4);
    for (let offset = 0; offset < segments.length; offset += 4)
      segments.set([0xff, 0xe1, 0, 2], offset);
    expect(() => imageDimensions(jpegWithPrefix(segments))).toThrow(error('image_invalid'));
  });
  it('allows JPEG fill and a single maximum-length metadata segment without scanning its payload', () => {
    expect(imageDimensions(jpegWithPrefix(new Uint8Array(12).fill(0xff)))).toEqual([640, 480]);
    const segment = new Uint8Array(65_537);
    segment.set([0xff, 0xe1, 0xff, 0xff]);
    expect(imageDimensions(jpegWithPrefix(segment))).toEqual([640, 480]);
  });
  it('rejects broken PNG headers, truncated JPEG segments, and animated WebP', () => {
    const badPng = png();
    ascii(badPng, 12, 'oops');
    expect(() => imageDimensions(badPng)).toThrow(error('image_invalid'));
    const badJpeg = jpeg();
    new DataView(badJpeg.buffer).setUint16(4, 100);
    expect(() => imageDimensions(badJpeg)).toThrow(error('image_invalid'));
    const animated = webp('VP8X');
    animated[20] = 2;
    expect(() => imageDimensions(animated)).toThrow(error('image_invalid'));
    expect(() => imageDimensions(webp('JUNK'))).toThrow(error('image_invalid'));
  });
});
type VectorHeader = [number, number];
type TemplateHeader = [string, string, boolean, number, VectorHeader, VectorHeader, VectorHeader];
interface ShardHeader {
  version: number;
  width: number;
  height: number;
  templates: TemplateHeader[];
}
function template(): IconTemplate {
  const shape = featureShape(1, 1);
  const vector = (length: number) => ({
    scale: 0.001,
    values: Int8Array.from({ length }, (_, i) => (i % 255) - 127),
  });
  return {
    itemId: 'test',
    shortName: 'Test',
    rotated: false,
    features: {
      artCoarse: vector(shape.artCoarse),
      artFine: vector(shape.artFine),
      text: vector(shape.text),
      textWidth: shape.textWidth,
    },
  };
}
function rewriteHeader(bytes: Uint8Array, edit: (header: ShardHeader) => void): Uint8Array {
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, size + 4))) as ShardHeader;
  edit(header);
  const replacement = new TextEncoder().encode(JSON.stringify(header));
  const output = new Uint8Array(4 + replacement.length + bytes.length - 4 - size);
  new DataView(output.buffer).setUint32(0, replacement.length, true);
  output.set(replacement, 4);
  output.set(bytes.subarray(4 + size), 4 + replacement.length);
  return output;
}
describe('dimension shard serialization', () => {
  it('roundtrips signed quantized vectors, orientation, and zero scales in offset byte views', () => {
    const upright = template();
    const rotated = { ...template(), itemId: 'rotated', rotated: true };
    rotated.features.text.scale = 0;
    const encoded = encodeScanShard(1, 1, [upright, rotated]);
    const wrapped = new Uint8Array(encoded.length + 13);
    wrapped.set(encoded, 7);
    const result = decodeScanShard(wrapped.subarray(7, 7 + encoded.length));
    expect([result.width, result.height, result.index.size]).toEqual([1, 1, 2]);
    expect(result.index.bySize.get('1x1')).toEqual([upright, rotated]);
  });
  it('decodes every generated shard, verifies its manifest hash, and roundtrips the smallest', () => {
    const directory = resolve(process.cwd(), 'public/stash-scan');
    const catalog = JSON.parse(
      readFileSync(resolve(directory, 'catalog.json'), 'utf8')
    ) as ScanCatalog;
    expect(catalog.featureVersion).toBe(FEATURE_VERSION);
    const shards = Object.entries(catalog.shards).sort((a, b) => a[1].bytes - b[1].bytes);
    expect(shards.length).toBeGreaterThan(0);
    for (const [size, descriptor] of shards) {
      const compressed = readFileSync(resolve(directory, descriptor.file));
      expect(compressed.length).toBe(descriptor.bytes);
      expect(createHash('sha256').update(compressed).digest('hex')).toBe(descriptor.sha256);
      const decoded = gunzipSync(compressed);
      expect(decoded.length).toBe(descriptor.decodedBytes);
      const result = decodeScanShard(decoded);
      expect(`${result.width}x${result.height}`).toBe(size);
      expect(result.index.size).toBeGreaterThan(0);
    }
    const [size, descriptor] = shards[0]!;
    const result = decodeScanShard(gunzipSync(readFileSync(resolve(directory, descriptor.file))));
    const templates = result.index.bySize.get(size)!;
    const roundtrip = decodeScanShard(encodeScanShard(result.width, result.height, templates));
    expect(roundtrip.index.bySize.get(size)).toEqual(templates);
  });
  it.each([
    (header: ShardHeader) => {
      header.version++;
    },
    (header: ShardHeader) => {
      header.width = 0;
    },
    (header: ShardHeader) => {
      header.height = 1.5;
    },
    (header: ShardHeader) => {
      header.templates = Array.from({ length: 20_001 }, () => header.templates[0]!);
    },
    (header: ShardHeader) => {
      header.templates[0]![0] = 'x'.repeat(257);
    },
    (header: ShardHeader) => {
      header.templates[0]![2] = 'true' as unknown as boolean;
    },
    (header: ShardHeader) => {
      header.templates[0]![3]++;
    },
    (header: ShardHeader) => {
      header.templates[0]![4][0] = 1.1;
    },
    (header: ShardHeader) => {
      header.templates[0]![4][0] = -1;
    },
    (header: ShardHeader) => {
      header.templates[0]![4][0] = NaN;
    },
    (header: ShardHeader) => {
      header.templates[0]![4][1]--;
    },
    (header: ShardHeader) => {
      header.templates[0]![0] = '';
    },
  ])('rejects structurally tampered shard headers %#', (edit) => {
    const encoded = encodeScanShard(1, 1, [template()]);
    expect(() => decodeScanShard(rewriteHeader(encoded, edit))).toThrow(error('catalog_invalid'));
  });
  it.each(['{', 'null', '[]', 'true'])(
    'normalizes malformed shard JSON/header shape %s',
    (json) => {
      const header = new TextEncoder().encode(json);
      const bytes = new Uint8Array(header.length + 4);
      new DataView(bytes.buffer).setUint32(0, header.length, true);
      bytes.set(header, 4);
      expect(() => decodeScanShard(bytes)).toThrow(error('catalog_invalid'));
    }
  );
  it('rejects truncation, trailing bytes, oversized header declarations, and invalid UTF-8', () => {
    const encoded = encodeScanShard(1, 1, [template()]);
    expect(() => decodeScanShard(encoded.subarray(0, encoded.length - 1))).toThrow(
      error('catalog_invalid')
    );
    const trailing = new Uint8Array(encoded.length + 1);
    trailing.set(encoded);
    expect(() => decodeScanShard(trailing)).toThrow(error('catalog_invalid'));
    const largeHeader = encoded.slice();
    new DataView(largeHeader.buffer).setUint32(0, 4 * 1024 * 1024 + 1, true);
    expect(() => decodeScanShard(largeHeader)).toThrow(error('catalog_invalid'));
    const invalidUtf8 = encoded.slice();
    invalidUtf8[4] = 0xff;
    expect(() => decodeScanShard(invalidUtf8)).toThrow(error('catalog_invalid'));
    expect(() => decodeScanShard(new Uint8Array(3))).toThrow(error('catalog_invalid'));
  });
});
