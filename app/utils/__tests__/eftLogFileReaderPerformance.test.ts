import { UnzipInflate, strToU8, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { readEftLogSources } from '@/utils/eftLogFileReader';
const BATCH_BYTES = 256 * 1024;
const BOUNDARY = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}(?: [+-]\d{2}:\d{2})?\|/gm;
const mode = '2026-09-10 10:00:01.000|Info|output|Session mode: Pve\n';
const longRecord = '2026-09-10 10:00:00.000|Info|output|' + 'x'.repeat(512 * 1024) + '\n' + mode;
const archive = (text: string, level: 0 | 6) =>
  new File([new Uint8Array(zipSync({ 'output.log': strToU8(text) }, { level }))], 'logs.zip');
describe('bounded ZIP transport and parser work', () => {
  it('batches stored ZIP reads and bounds repeated scanning independently of inflation slices', async () => {
    const zip = archive(longRecord, 0);
    const slices = vi.spyOn(zip, 'slice');
    const progress = vi.fn();
    const original = String.prototype.matchAll;
    let scannedChars = 0;
    vi.spyOn(String.prototype, 'matchAll').mockImplementation(function (
      this: string,
      pattern: RegExp
    ) {
      if (pattern.source === BOUNDARY.source) scannedChars += this.length;
      return original.call(this, pattern);
    });
    const result = await readEftLogSources([zip], {
      signal: new AbortController().signal,
      onProgress: progress,
    });
    expect(result.sources[0]?.timeline).toHaveLength(1);
    // A 512 KiB record under the former 1 KiB path scanned roughly 128 MiB. Count actual
    // boundary-search input rather than timing the machine or creating an 8 MiB crash fixture.
    expect(scannedChars).toBeLessThanOrEqual(longRecord.length * 4);
    const inputReads = Math.ceil(zip.size / BATCH_BYTES);
    expect(slices).toHaveBeenCalledTimes(inputReads + 1); // includes bounded ZIP end-record read
    expect(progress).toHaveBeenCalledTimes(inputReads + 1); // includes initial zero progress
    expect(progress).toHaveBeenLastCalledWith({ bytesRead: zip.size, totalBytes: zip.size });
  });
  it('keeps compressed slices small and decoded batches bounded for burst output', async () => {
    const inflate = vi.spyOn(UnzipInflate.prototype, 'push');
    const decode = vi.spyOn(TextDecoder.prototype, 'decode');
    const result = await readEftLogSources([archive(longRecord, 6)], {
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    expect(result.sources[0]?.timeline).toHaveLength(1);
    expect(inflate).toHaveBeenCalled();
    expect(Math.max(...inflate.mock.calls.map(([chunk]) => chunk.byteLength))).toBeLessThanOrEqual(
      1024
    );
    expect(
      Math.max(...decode.mock.calls.map(([chunk]) => chunk?.byteLength ?? 0))
    ).toBeLessThanOrEqual(BATCH_BYTES);
  });
  it('observes cancellation between inflation slices within a single filesystem read', async () => {
    const text = Array.from({ length: 1000 }, (_, i) =>
      mode.replace('Pve', `Unrelated diagnostic ${i}`)
    ).join('');
    const zip = archive(text, 6);
    expect(zip.size).toBeGreaterThan(1024);
    const controller = new AbortController();
    const original = UnzipInflate.prototype.push;
    const inflate = vi.spyOn(UnzipInflate.prototype, 'push').mockImplementation(function (
      this: UnzipInflate,
      chunk,
      final
    ) {
      original.call(this, chunk, final);
      controller.abort();
    });
    await expect(
      readEftLogSources([zip], {
        signal: controller.signal,
        onProgress: () => {},
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(inflate).toHaveBeenCalledOnce();
  });
});
