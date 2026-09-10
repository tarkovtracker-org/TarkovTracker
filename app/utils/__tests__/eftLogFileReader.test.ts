import { strToU8, zipSync, Zip, ZipDeflate } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { readEftLogSources } from '@/utils/eftLogFileReader';
import { parseEftLogsForQuestImport } from '@/utils/eftLogQuestParser';
import { EftLogRecordSizeError } from '@/utils/eftLogRecordReader';
const QUEST = '657315ddab5a49b71f098853';
const SESSION = 'Logs/log_2026.09.10_10-00-00_1.1.0.1.46911';
const noise = '2026-09-10 10:00:00.000|Info|output|Unrelated diagnostics\n';
const mode = '2026-09-10 10:00:01.000|Info|output|Session mode: Pve\n';
const notification = `2026-09-10 10:00:02.000|Info|push-notifications|Got notification | ChatMessageReceived
{"eventId":"completed","message":{"type":12,"templateId":"${QUEST} successMessageText","text":"Unicode: 😀"}}
`;
const read = (files: File[]) =>
  readEftLogSources(files, { signal: new AbortController().signal, onProgress: () => {} });
/** Simulates a real large file with reusable bounded slices, avoiding a giant test allocation. */
function largeOutputFile(size: number): File {
  const file = new File([], 'output_000.log');
  Object.defineProperty(file, 'size', { value: size });
  Object.defineProperty(file, 'webkitRelativePath', { value: `${SESSION}/output_000.log` });
  const chunkSize = 256 * 1024;
  const padding = noise.repeat(Math.ceil(chunkSize / noise.length));
  const middle = strToU8(padding.slice(0, chunkSize - 1) + '\n');
  const last = strToU8((mode + padding).slice(0, chunkSize - 1) + '\n');
  vi.spyOn(file, 'slice').mockImplementation((start = 0, end = size) => {
    const chunk = end === size ? last : middle;
    return { arrayBuffer: async () => chunk.slice(0, end - start).buffer } as Blob;
  });
  return file;
}
describe('readEftLogSources', () => {
  it('reads an unzipped folder past all former byte limits and preserves its late mode evidence', async () => {
    const output = largeOutputFile(513 * 1024 * 1024);
    const notifications = new File([notification], 'notifications.log');
    Object.defineProperty(notifications, 'webkitRelativePath', {
      value: `${SESSION}/notifications.log`,
    });
    const wholeText = vi.spyOn(output, 'text');
    const wholeBuffer = vi.spyOn(output, 'arrayBuffer');
    const onProgress = vi.fn();
    const result = await readEftLogSources([notifications, output], {
      signal: new AbortController().signal,
      onProgress,
    });
    const preview = parseEftLogsForQuestImport(result.sources, [QUEST]);
    expect(preview.matchedTaskIdsByMode.pve).toEqual([QUEST]);
    expect(preview.availableVersions).toEqual(['1.1.0.1.46911']);
    expect(wholeText).not.toHaveBeenCalled();
    expect(wholeBuffer).not.toHaveBeenCalled();
    expect(output.slice).toHaveBeenCalledTimes(2052);
    expect(onProgress).toHaveBeenLastCalledWith({
      bytesRead: output.size + notifications.size,
      totalBytes: output.size + notifications.size,
    });
    expect(result.sources[1]).not.toHaveProperty('text');
    expect(result.sources[1]?.timeline).toHaveLength(1);
  }, 30000);
  it('imports a ZIP log expanded beyond 32 MiB with notifications from a raw file', async () => {
    const content = noise.repeat(Math.ceil((33 * 1024 * 1024) / noise.length)) + mode;
    const zip = new File(
      [new Uint8Array(zipSync({ [`${SESSION}/output.log`]: strToU8(content) }))],
      'Logs.zip'
    );
    const raw = new File([notification], 'notifications.log');
    Object.defineProperty(raw, 'webkitRelativePath', { value: `${SESSION}/notifications.log` });
    const result = await read([zip, raw]);
    expect(parseEftLogsForQuestImport(result.sources, [QUEST]).matchedTaskIdsByMode.pve).toEqual([
      QUEST,
    ]);
  });
  it('discards irrelevant compressed entries without inflating them or changing the next log decoder', async () => {
    const archive = zipSync({
      'ignored.bin': new Uint8Array(100000),
      'notifications.log': strToU8(notification),
    });
    const header = new DataView(archive.buffer);
    const dataStart = 30 + header.getUint16(26, true) + header.getUint16(28, true);
    // Deliberately corrupt irrelevant compressed data: the reader must discard it without inflation.
    archive[dataStart] = 255;
    const result = await read([new File([new Uint8Array(archive)], 'Logs.zip')]);
    expect(result.scanned).toBe(2);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.notifications?.completionEventCount).toBe(1);
  });
  it('supports ZIP entries with streaming data descriptors instead of declared sizes', async () => {
    const parts: Uint8Array<ArrayBuffer>[] = [];
    const zip = new Zip((error, data) => {
      if (error) throw error;
      parts.push(new Uint8Array(data));
    });
    const entry = new ZipDeflate('notifications.log');
    zip.add(entry);
    entry.push(strToU8(notification), true);
    zip.end();
    const result = await read([new File(parts, 'Logs.zip')]);
    expect(result.sources[0]?.notifications?.completionEventCount).toBe(1);
  });
  it('preserves UTF-8 characters split between raw file slices', async () => {
    const header =
      '2026-09-10 10:00:02.000|Info|push-notifications|Got notification | ChatMessageReceived\n';
    const prefix = '{"eventId":"';
    const padding = ' '.repeat(256 * 1024 - header.length - prefix.length - 1);
    const text = `${header}${padding}${prefix}😀","message":{"type":12,"templateId":"${QUEST} successMessageText"}}`;
    const result = await read([new File([text], 'notifications.log')]);
    expect(result.sources[0]?.notifications?.completionEvents[0]?.eventKey).toBe('event:😀');
  });
  it('cancels ZIP reads between input slices', async () => {
    const zip = new File(
      [
        new Uint8Array(
          zipSync({ 'notifications.log': strToU8(noise.repeat(1000) + notification) }, { level: 0 })
        ),
      ],
      'Logs.zip'
    );
    const slices = vi.spyOn(zip, 'slice');
    const controller = new AbortController();
    await expect(
      readEftLogSources([zip], {
        signal: controller.signal,
        onProgress: ({ bytesRead }) => {
          if (bytesRead) controller.abort();
        },
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(slices).toHaveBeenCalledOnce();
  });
  it('cancels a raw file between slices without reading the rest', async () => {
    const file = largeOutputFile(64 * 1024 * 1024);
    const controller = new AbortController();
    await expect(
      readEftLogSources([file], {
        signal: controller.signal,
        onProgress: ({ bytesRead }) => {
          if (bytesRead) controller.abort();
        },
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(file.slice).toHaveBeenCalledOnce();
  });
  it('rejects malformed unbounded records instead of buffering an entire file', async () => {
    const file = new File(['x'.repeat(9 * 1024 * 1024)], 'notifications.log');
    const slices = vi.spyOn(file, 'slice');
    await expect(read([file])).rejects.toBeInstanceOf(EftLogRecordSizeError);
    expect(slices.mock.calls.length).toBeLessThan(file.size / (256 * 1024));
  });
  it('rejects truncated ZIP content without returning a partial import', async () => {
    const archive = zipSync({ 'notifications.log': strToU8(notification) });
    await expect(
      read([new File([new Uint8Array(archive.subarray(0, 70))], 'Logs.zip')])
    ).rejects.toThrow();
  });
});
