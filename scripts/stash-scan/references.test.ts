// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { addGridImage, readReferenceGrid } from '@@/scripts/stash-scan/references';
import { describe, expect, it, vi } from 'vitest';
import { createIconIndex } from '@/utils/stashScan/core/matcher';
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
const meds = {
  id: '5d1b3a5d86f774252167ba22',
  name: 'Pile of meds',
  shortName: 'Meds',
  width: 1,
  height: 1,
  maxStack: 1,
};
describe('curated scanner reference images', () => {
  it('adds a compatible, pinned reference without replacing existing templates', async () => {
    const index = createIconIndex();
    const reference = await readReferenceGrid(meds.id);
    expect(reference).toBeDefined();
    await addGridImage(
      index,
      meds,
      await readFile(new URL('./references/pile-of-meds-legacy-grid.webp', import.meta.url))
    );
    await addGridImage(index, meds, reference!);
    expect(index.size).toBe(2);
    expect(index.bySize.get('1x1')?.map((template) => template.itemId)).toEqual([meds.id, meds.id]);
    expect(index.bySize.get('1x1')![0]!.features).not.toEqual(
      index.bySize.get('1x1')![1]!.features
    );
  });
  it('returns no supplement for an item without an explicit reference', async () => {
    expect(await readReferenceGrid('unknown')).toBeUndefined();
  });
  it('rejects changed bytes instead of silently publishing a different reference', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(Buffer.from('tampered image'));
    await expect(readReferenceGrid(meds.id)).rejects.toThrow('Reference image hash mismatch');
  });
});
