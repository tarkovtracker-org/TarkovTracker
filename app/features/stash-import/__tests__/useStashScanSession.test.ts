import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { useStashScanSession } from '@/features/stash-import/useStashScanSession';
import type { ScanResult } from '@/utils/stashScan/types';
const mocks = vi.hoisted(() => ({ request: vi.fn(), cancel: vi.fn() }));
vi.mock('@/utils/stashScan/scanClient', () => ({ createStashScanner: () => mocks }));
function fixture(): ScanResult {
  return {
    width: 130,
    height: 130,
    sourceHash: 'a'.repeat(64),
    preview: new Blob(['preview']),
    catalog: {
      version: 1,
      featureVersion: 1,
      builtAt: '',
      missing: [],
      shards: {},
      items: [{ id: 'item', name: 'Item', shortName: 'Item', width: 1, height: 1, maxStack: 1 }],
    },
    cells: [0, 1].map((key) => ({
      key,
      x: key * 65,
      y: 0,
      width: 65,
      height: 65,
      slotsWide: 1,
      slotsHigh: 1,
      empty: false,
      candidates: [{ itemId: 'item', score: 0.6 }],
      margin: 0.05,
    })),
  };
}
function screenshot(): File {
  const bytes = new Uint8Array(32);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 130);
  view.setUint32(20, 130);
  return new File([bytes], 'stash.png', { type: 'image/png' });
}
function setup() {
  const scope = effectScope();
  return { scope, session: scope.run(useStashScanSession)! };
}
describe('stash scan session', () => {
  beforeEach(() => {
    mocks.request.mockReset().mockResolvedValue(fixture());
    mocks.cancel.mockReset();
  });
  it('ignores a rejected header read from an obsolete selection', async () => {
    const { scope, session } = setup();
    const obsolete = screenshot();
    let rejectRead!: (error: Error) => void;
    vi.spyOn(obsolete, 'arrayBuffer').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRead = reject;
        })
    );
    const reading = session.select([obsolete]);
    await session.select([screenshot(), screenshot()]);
    rejectRead(new Error('old read failed'));
    await reading;
    expect(session.error.value).toBe('stash_import.errors.one_image');
    expect(session.result.value).toBeUndefined();
    scope.stop();
  });
  it('retains corrections on untouched regions and replaces overlapping detections', async () => {
    const { scope, session } = setup();
    await session.select([screenshot()]);
    session.rows.value[1]!.quantity = 5;
    session.rows.value[1]!.reviewed = true;
    const replacement = { x: 0, y: 0, width: 60, height: 60, slotsWide: 1, slotsHigh: 1 };
    const next = fixture();
    next.cells = [next.cells[1]!, { ...next.cells[0]!, ...replacement }];
    mocks.request.mockResolvedValueOnce(next);
    await session.region(replacement);
    expect(mocks.request.mock.lastCall?.[0].rects).toHaveLength(2);
    expect(session.rows.value[0]!.quantity).toBe(5);
    expect(session.rows.value[1]!.reviewed).toBe(false);
    scope.stop();
  });
  it('ignores a worker result after cancellation and releases its resources', async () => {
    const { scope, session } = setup();
    let finish!: (result: ScanResult) => void;
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const selected = session.select([screenshot()]);
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalled());
    session.cancel();
    finish(fixture());
    await selected;
    expect(session.result.value).toBeUndefined();
    expect(session.busy.value).toBe(false);
    expect(mocks.cancel).toHaveBeenCalled();
    scope.stop();
    expect(session.image.value).toBeUndefined();
  });
  it('clears the old screenshot when replacement input is invalid', async () => {
    const { scope, session } = setup();
    await session.select([screenshot()]);
    await session.select([screenshot(), screenshot()]);
    expect(session.source.value).toBeUndefined();
    expect(session.image.value).toBeUndefined();
    expect(session.rows.value).toEqual([]);
    expect(session.error.value).toBe('stash_import.errors.one_image');
    scope.stop();
  });
  it('allows a manually sized item after automatic grid detection fails', async () => {
    const { scope, session } = setup();
    mocks.request.mockRejectedValueOnce(new Error('stash_import.errors.no_grid'));
    await session.select([screenshot()]);
    const rect = { x: 0, y: 0, width: 65, height: 65, slotsWide: 1, slotsHigh: 1 };
    await session.region(rect);
    expect(mocks.request.mock.lastCall?.[0]).toMatchObject({ op: 'scan', rects: [rect] });
    expect(session.result.value).toBeDefined();
    scope.stop();
  });
  it('restores worker source before correcting a cancelled scan', async () => {
    const { scope, session } = setup();
    await session.select([screenshot()]);
    session.cancel();
    await session.region({ x: 0, y: 0, width: 65, height: 65, slotsWide: 1, slotsHigh: 1 });
    expect(mocks.request.mock.lastCall?.[0]).toMatchObject({
      op: 'scan',
      file: session.source.value,
    });
    expect(mocks.request.mock.lastCall?.[0].rects).toHaveLength(2);
    scope.stop();
  });
  it('keeps normalized image dimensions available when no grid is found', async () => {
    const { scope, session } = setup();
    mocks.request.mockResolvedValueOnce({ ...fixture(), width: 70, height: 140, cells: [] });
    await session.select([screenshot()]);
    expect([session.width.value, session.height.value]).toEqual([70, 140]);
    expect(session.error.value).toBe('stash_import.errors.no_grid');
    expect(session.image.value).toBeDefined();
    scope.stop();
  });
  it('ignores a second correction while one is still being matched', async () => {
    const { scope, session } = setup();
    await session.select([screenshot()]);
    let finish!: (result: ScanResult) => void;
    mocks.request.mockImplementationOnce(
      () => new Promise<ScanResult>((resolve) => (finish = resolve))
    );
    const rect = { x: 0, y: 0, width: 65, height: 65, slotsWide: 1, slotsHigh: 1 };
    const first = session.region(rect);
    await session.region({ ...rect, x: 65 });
    session.activeKey.value = 0;
    await session.split(1, 1);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    finish(fixture());
    await first;
    expect(session.error.value).toBe('');
    expect(mocks.cancel).not.toHaveBeenCalled();
    scope.stop();
  });
});
