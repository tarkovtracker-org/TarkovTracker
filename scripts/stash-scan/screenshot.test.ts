// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { addGridImage } from '@@/scripts/stash-scan/references';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellFeatures } from '@/utils/stashScan/core/features';
import { detectFirMark, matchFirMark } from '@/utils/stashScan/core/firMark';
import { detectGrid, type RgbImage } from '@/utils/stashScan/core/grid';
import { createIconIndex, matchCell, type IconIndex } from '@/utils/stashScan/core/matcher';
import { readStackCount } from '@/utils/stashScan/core/stackCount';
import { decodeScanShard } from '@/utils/stashScan/indexCodec';
import { blocksImport, reviewCell, reviewedTotals, selectItem } from '@/utils/stashScan/review';
import type { ScanCatalog, ScanCell, ScanRect, ScanItem } from '@/utils/stashScan/types';
const MEDS = '5d1b3a5d86f774252167ba22';
const FLASH = ['590c621186f774138d11ea29', '660bbc47c38b837877075e47'];
const directory = resolve('public/stash-scan');
let source: Buffer;
let index: IconIndex;
let items: Map<string, ScanItem>;
beforeAll(async () => {
  source = await readFile(resolve('public/img/demos/stash-1440p.png'));
  expect(createHash('sha256').update(source).digest('hex')).toBe(
    '0c14f5e0a9b95bad341443470c82e99d5c2be64d8b5be6f2a77d57f1fd6691d0'
  );
  const catalog = JSON.parse(
    await readFile(resolve(directory, 'catalog.json'), 'utf8')
  ) as ScanCatalog;
  items = new Map(catalog.items.map((item) => [item.id, item]));
  index = createIconIndex();
  for (const [size, shard] of Object.entries(catalog.shards)) {
    const decoded = decodeScanShard(gunzipSync(await readFile(resolve(directory, shard.file))));
    index.bySize.set(size, decoded.index.bySize.get(size)!);
    index.size += decoded.index.size;
  }
});
async function decode(bytes: Buffer): Promise<RgbImage> {
  const { data, info } = await sharp(bytes)
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
function region(image: RgbImage, rect: ScanRect, key = 0): ScanCell {
  const matched = matchCell(
    cellFeatures(image, rect.x, rect.y, rect.width, rect.height, rect.slotsWide, rect.slotsHigh),
    index
  );
  const mark = matchFirMark(image, rect);
  const fir = detectFirMark(image, rect, mark);
  const count = readStackCount(image, rect, fir && mark.lift <= 2);
  return {
    ...rect,
    key,
    empty: matched.empty,
    margin: matched.margin,
    candidates: matched.matches,
    fir,
    stack: count.kind === 'number' ? count.value : count.kind === 'none' ? 1 : null,
  };
}
const medsRect: ScanRect = { x: 831, y: 116, width: 85, height: 85, slotsWide: 1, slotsHigh: 1 };
describe('user-supplied 1440p demo screenshot', () => {
  it('detects the real inventory and reads the five document counts', async () => {
    const image = await decode(source);
    expect([image.width, image.height]).toEqual([2560, 1440]);
    const grid = detectGrid(image);
    expect(grid.pitch).toBe(84);
    expect(grid.cells.length).toBeGreaterThanOrEqual(155);
    const rows = grid.cells.map((rect, key) => reviewCell(region(image, rect, key), items));
    const counts = [
      ['6a317b9692cfdcddcb02a58e', 1],
      ['6a3181f178450ec91c0ea1aa', 2],
      ['6a31824878450ec91c0ea1ae', 4],
      ['6a3182dc6cd8de21cf0a3a7d', 1],
      ['6a31830dde69ceafd805afa0', 2],
    ] as const;
    for (const [itemId, quantity] of counts)
      expect(rows.find((row) => row.itemId === itemId)).toMatchObject({ quantity, reviewed: true });
  });
  it('matches meds on both current framing and a cleanly rendered label', async () => {
    const row = reviewCell(region(await decode(source), medsRect), items);
    expect(row).toMatchObject({ itemId: MEDS, quantity: 1, reviewed: true });
    expect(row.cell.candidates[0]!.artScore).toBeGreaterThan(0.97);
    expect(row.cell.candidates[0]!.textScore).toBeGreaterThan(0.85);
  });
  it('keeps misidentified meds blocking when only the old reference is available', async () => {
    const image = await decode(source);
    const templates = index.bySize.get('1x1')!;
    const others = templates.filter((template) => template.itemId !== MEDS);
    const legacy = {
      size: others.length,
      bySize: new Map([['1x1', others]]),
    };
    await addGridImage(
      legacy,
      items.get(MEDS)!,
      await readFile(new URL('./references/pile-of-meds-legacy-grid.webp', import.meta.url))
    );
    const match = matchCell(cellFeatures(image, 831, 116, 85, 85, 1, 1), legacy);
    const row = reviewCell(
      {
        ...medsRect,
        key: 0,
        empty: false,
        margin: match.margin,
        candidates: match.matches,
        fir: true,
        stack: 1,
      },
      items
    );
    expect(row.itemId).not.toBe(MEDS);
    const tracked = new Set([MEDS]);
    expect(blocksImport(row)).toBe(true);
    expect(() => reviewedTotals([row], tracked)).toThrow('review_required');
    selectItem(row, items.get(MEDS)!);
    expect(reviewedTotals([row], tracked)).toEqual([
      { itemId: MEDS, fir: 1, nonFir: 0, unknown: 0 },
    ]);
  });
  it('keeps all four identical flash-drive variants uncertain', async () => {
    const image = await decode(source);
    for (const [x, y] of [
      [1419, 704],
      [1503, 704],
      [1587, 704],
      [495, 788],
    ]) {
      const row = reviewCell(region(image, { ...medsRect, x: x!, y: y! }), items);
      expect(row.reviewed).toBe(false);
      for (const itemId of FLASH)
        expect(row.cell.candidates.map((candidate) => candidate.itemId)).toContain(itemId);
      expect(blocksImport(row)).toBe(true);
    }
  });
  it.each(['1080p', 'jpeg90', 'jpeg70'] as const)(
    'recognizes meds in a %s copy without changing the source fixture',
    async (variant) => {
      const transform = sharp(source);
      const bytes =
        variant === '1080p'
          ? await transform.resize(1920).png().toBuffer()
          : await transform.jpeg({ quality: variant === 'jpeg90' ? 90 : 70 }).toBuffer();
      const image = await decode(bytes);
      const factor = image.width / 2560;
      const grid = detectGrid(image);
      const rect = grid.cells.find(
        (cell) =>
          Math.abs(cell.x - medsRect.x * factor) < 2 && Math.abs(cell.y - medsRect.y * factor) < 2
      );
      expect(rect).toBeDefined();
      const row = reviewCell(region(image, rect!), items);
      expect(row.itemId).toBe(MEDS);
      expect(row.quantity).toBe(1);
    }
  );
});
