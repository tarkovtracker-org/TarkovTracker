import {
  scanError,
  type ScanCommand,
  type ScanReply,
  type ScanResult,
  type ScanRect,
} from '@/utils/stashScan/types';
const plainRect = ({ x, y, width, height, slotsWide, slotsHigh }: ScanRect): ScanRect => ({
  x,
  y,
  width,
  height,
  slotsWide,
  slotsHigh,
});
/** Vue review rows are proxies; send only cloneable geometry across the worker boundary. */
const plainCommand = (command: ScanCommand): ScanCommand => {
  const rects = command.rects?.map(plainRect);
  return command.op === 'scan'
    ? { op: 'scan', file: command.file, rects }
    : { op: 'rects', rects: rects! };
};
/** One active request and bounded image per worker; terminating is immediate cancellation. */
export function createStashScanner(
  onProgress: (progress: Extract<ScanReply, { type: 'progress' }>) => void
) {
  if (!globalThis.Worker || !globalThis.OffscreenCanvas || !globalThis.createImageBitmap)
    throw scanError('unsupported');
  const worker = new Worker(new URL('../../workers/stashScan.worker.ts', import.meta.url), {
    type: 'module',
  });
  let pending: { resolve: (value: ScanResult) => void; reject: (error: Error) => void } | undefined;
  let closed = false;
  function cancel() {
    closed = true;
    worker.terminate();
    pending?.reject(scanError('cancelled'));
    pending = undefined;
  }
  worker.onmessage = ({ data }: MessageEvent<ScanReply>) => {
    if (data.type === 'progress') {
      onProgress(data);
      return;
    }
    settle(data);
    pending = undefined;
  };
  function settle(data: Exclude<ScanReply, { type: 'progress' }>) {
    if (data.type === 'error') pending?.reject(new Error(data.error));
    else pending?.resolve(data.result);
  }
  const failed = () => {
    pending?.reject(scanError('scan_failed'));
    cancel();
  };
  worker.onerror = failed;
  worker.onmessageerror = failed;
  function request(command: ScanCommand): Promise<ScanResult> {
    if (closed || pending) return Promise.reject(scanError('cancelled'));
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      try {
        worker.postMessage(plainCommand(command));
      } catch {
        pending = undefined;
        reject(scanError('scan_failed'));
      }
    });
  }
  return { request, cancel };
}
