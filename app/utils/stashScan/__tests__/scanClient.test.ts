// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isProxy, reactive } from 'vue';
import { createStashScanner } from '@/utils/stashScan/scanClient';
import type { ScanCommand, ScanReply } from '@/utils/stashScan/types';
const instance = {
  onmessage: undefined as ((event: { data: ScanReply }) => void) | undefined,
  terminate: vi.fn(),
  postMessage: vi.fn((command: ScanCommand) => structuredClone(command)),
};
function CloneWorker() {
  return instance;
}
const rect = () => reactive({ x: 0, y: 0, width: 65, height: 65, slotsWide: 1, slotsHigh: 1 });
const complete = () => instance.onmessage?.({ data: { type: 'error', error: 'finished' } });
describe('scan worker transport', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', CloneWorker);
    vi.stubGlobal('OffscreenCanvas', vi.fn());
    vi.stubGlobal('createImageBitmap', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());
  it('ignores progress replies queued before cancellation', () => {
    const progress = vi.fn();
    const scanner = createStashScanner(progress);
    scanner.cancel();
    instance.onmessage?.({ data: { type: 'progress', stage: 'match', done: 3, total: 5 } });
    expect(progress).not.toHaveBeenCalled();
  });
  it('serializes reactive corrections and manual first-image regions', async () => {
    const scanner = createStashScanner(vi.fn());
    const geometry = reactive({
      ...rect(),
      x: 12,
      y: 34,
      width: 127,
      height: 64,
      slotsWide: 2,
      extra: 'never sent',
    });
    const plain = { x: 12, y: 34, width: 127, height: 64, slotsWide: 2, slotsHigh: 1 };
    const correction = scanner.request({ op: 'rects', rects: [geometry] });
    const corrected = expect(correction).rejects.toThrow('finished');
    complete();
    await corrected;
    const file = new File(['data'], 'image.png', { type: 'image/png' });
    const manual = scanner.request({
      op: 'scan',
      file,
      rects: [geometry],
    });
    const scanned = expect(manual).rejects.toThrow('finished');
    complete();
    await scanned;
    expect(instance.postMessage).toHaveBeenCalledTimes(2);
    expect(instance.postMessage).toHaveBeenNthCalledWith(1, { op: 'rects', rects: [plain] });
    expect(instance.postMessage).toHaveBeenNthCalledWith(2, { op: 'scan', file, rects: [plain] });
    const sent = instance.postMessage.mock.calls[1]![0];
    expect(sent.op === 'scan' && sent.file).toBe(file);
    expect(isProxy(sent.rects![0])).toBe(false);
    expect(Object.keys(sent.rects![0]!)).toEqual(Object.keys(plain));
    scanner.cancel();
  });
  it('clears a failed send so the next attempt is not permanently cancelled', async () => {
    const scanner = createStashScanner(vi.fn());
    instance.postMessage.mockImplementationOnce(() => {
      throw new Error('clone failed');
    });
    await expect(scanner.request({ op: 'rects', rects: [rect()] })).rejects.toThrow('scan_failed');
    const retried = scanner.request({ op: 'rects', rects: [rect()] });
    const done = expect(retried).rejects.toThrow('finished');
    complete();
    await done;
    scanner.cancel();
  });
  it('terminates work and rejects pending/future requests on cancellation', async () => {
    const scanner = createStashScanner(vi.fn());
    const pending = scanner.request({ op: 'rects', rects: [rect()] });
    const cancelled = expect(pending).rejects.toThrow('cancelled');
    scanner.cancel();
    await cancelled;
    expect(instance.terminate).toHaveBeenCalledTimes(1);
    await expect(scanner.request({ op: 'rects', rects: [rect()] })).rejects.toThrow('cancelled');
  });
});
