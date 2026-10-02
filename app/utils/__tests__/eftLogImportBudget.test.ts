import { strToU8, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { readEftLogSources } from '@/utils/eftLogFileReader';
import { EftLogImportBudgetError, type EftLogImportLimits } from '@/utils/eftLogImportBudget';
import { parseEftLogsForQuestImport } from '@/utils/eftLogQuestParser';
const quest = '657315ddab5a49b71f098853';
const mode = '2026-09-10 10:00:01.000|Info|output|Session mode: Pve\n';
const legacy =
  '2026-09-10 10:00:01.000|Info|backend|---> Request https://prod-01.escapefromtarkov.com/client/quest/list\n';
const event = (id: string, type = 12) =>
  `2026-09-10 10:00:02.000|Info|notifications|Got notification | ChatMessageReceived {"eventId":"${id}","message":{"type":${type},"templateId":"${quest}"}}\n`;
const raw = (text: string, name = 'notifications.log') => new File([text], name);
const archive = (members: Record<string, string>) =>
  new File(
    [
      new Uint8Array(
        zipSync(
          Object.fromEntries(Object.entries(members).map(([name, text]) => [name, strToU8(text)]))
        )
      ),
    ],
    'logs.zip'
  );
const read = (files: File[], limits: Partial<EftLogImportLimits> = {}) =>
  readEftLogSources(files, {
    signal: new AbortController().signal,
    onProgress: () => {},
    limits,
  });
describe('selection-wide EFT log import budgets', () => {
  it.each([false, true])('bounds repeated and unique short events (unique: %s)', async (unique) => {
    const text = Array.from({ length: 20000 }, (_, i) => event(unique ? String(i) : 'same')).join(
      ''
    );
    await expect(
      read([archive({ 'notifications.log': text })], { evidenceCount: 100 })
    ).rejects.toMatchObject({
      name: 'EftLogImportBudgetError',
      limit: 'evidenceCount',
    });
  });
  it.each([10, 11, 12])(
    'preserves raw counters and late semantic dedup for event type %i',
    async (type) => {
      const result = await read([raw(event('same', type).repeat(3))], { evidenceCount: 3 });
      const preview = parseEftLogsForQuestImport(result.sources, [quest]);
      const counts = {
        10: 'startedEventCount',
        11: 'failedEventCount',
        12: 'completionEventCount',
      } as const;
      expect(preview[counts[type as keyof typeof counts]]).toBe(3);
      expect(preview.events).toHaveLength(1);
    }
  );
  it.each([mode, legacy])(
    'bounds explicit and legacy mode evidence before retaining it',
    async (text) => {
      await expect(
        read([raw(text.repeat(4), 'backend.log')], { evidenceCount: 3 })
      ).rejects.toMatchObject({ limit: 'evidenceCount' });
    }
  );
  it('shares evidence counts across ZIP members and raw files', async () => {
    const files = [
      archive({ 'a/notifications.log': event('a'), 'b/output.log': mode }),
      raw(event('b')),
    ];
    expect((await read(files, { evidenceCount: 3 })).sources).toHaveLength(3);
    await expect(read(files, { evidenceCount: 2 })).rejects.toMatchObject({
      limit: 'evidenceCount',
    });
  });
  it('charges retained string lengths independently of item count', async () => {
    const text = event('long'.repeat(100));
    const result = await read([raw(text)]);
    const item = result.sources[0]!.notifications!.completionEvents[0]!;
    const chars = item.eventKey.length + item.questId.length + item.timestamp!.length;
    expect((await read([raw(text)], { evidenceChars: chars })).sources).toHaveLength(1);
    await expect(read([raw(text)], { evidenceChars: chars - 1 })).rejects.toMatchObject({
      limit: 'evidenceChars',
    });
  });
  it('checks actual burst expansion before parsing, regardless of a false declared size', async () => {
    const file = archive({ 'notifications.log': event('same').repeat(2000) });
    const bytes = new Uint8Array(await file.arrayBuffer());
    new DataView(bytes.buffer).setUint32(22, 1, true);
    await expect(
      read([new File([bytes], 'logs.zip')], { expandedBytes: 1000, evidenceCount: 0 })
    ).rejects.toMatchObject({ limit: 'expandedBytes' });
  });
  it('shares actual expanded bytes across archives, members and raw files with an inclusive boundary', async () => {
    const files = [
      archive({ 'a/notifications.log': event('a'), 'b/output.log': mode }),
      archive({ 'notifications.log': event('b') }),
      raw(event('c')),
    ];
    const size = strToU8(event('a') + mode + event('b') + event('c')).length;
    expect((await read(files, { expandedBytes: size })).sources).toHaveLength(4);
    await expect(read(files, { expandedBytes: size - 1 })).rejects.toMatchObject({
      limit: 'expandedBytes',
    });
  });
  it('stops raw reads before processing the first over-budget slice', async () => {
    const file = raw(mode.repeat(10000), 'output.log');
    const slices = vi.spyOn(file, 'slice');
    await expect(
      read([file], { expandedBytes: 256 * 1024 - 1, evidenceCount: 0 })
    ).rejects.toMatchObject({ limit: 'expandedBytes' });
    expect(slices).toHaveBeenCalledOnce();
  });
  it('bounds selected sources including ignored files before any content reads', async () => {
    const file = raw('', 'ignored.txt');
    const slices = vi.spyOn(file, 'slice');
    await expect(read([file, file], { entries: 1 })).rejects.toMatchObject({ limit: 'entries' });
    expect(slices).not.toHaveBeenCalled();
    expect((await read([file], { entries: 1 })).scanned).toBe(1);
  });
  it('bounds ignored ZIP member overhead and aggregate names', async () => {
    const file = archive({ 'a.bin': '', 'b.bin': '' });
    await expect(read([file], { entries: 2 })).rejects.toMatchObject({ limit: 'entries' });
    expect((await read([file], { entries: 3, nameChars: file.name.length + 10 })).scanned).toBe(2);
    await expect(read([file], { nameChars: file.name.length + 9 })).rejects.toMatchObject({
      limit: 'nameChars',
    });
  });
  it('bounds aggregate selected input bytes before reading', async () => {
    const file = raw(mode, 'output.log');
    const slices = vi.spyOn(file, 'slice');
    await expect(read([file, file], { inputBytes: file.size * 2 - 1 })).rejects.toMatchObject({
      limit: 'inputBytes',
    });
    expect(slices).not.toHaveBeenCalled();
    expect((await read([file], { inputBytes: file.size })).sources).toHaveLength(1);
  });
  it('rejects cancellation after the final slice rather than returning partial evidence', async () => {
    const controller = new AbortController();
    await expect(
      readEftLogSources([raw(event('a'))], {
        signal: controller.signal,
        onProgress: ({ bytesRead }) => {
          if (bytesRead) controller.abort();
        },
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect((await read([raw(event('a'))])).sources).toHaveLength(1);
  });
  it('uses a typed actionable error', () => {
    expect(new EftLogImportBudgetError('expandedBytes').message).toContain(
      'Select fewer recent sessions'
    );
  });
  it('charges versions extracted from record headers to the aggregate string budget', async () => {
    const version = '1.1.0.1.46911';
    const text = `2026-09-10 10:00:01.000|${version}|Info|output|Unrelated diagnostics\n`;
    const files = [raw(text, 'a/output.log'), raw(text, 'b/output.log')];
    expect(
      (await read(files, { evidenceChars: version.length * 2 })).sources.map(
        (source) => source.version
      )
    ).toEqual([version, version]);
    await expect(read(files, { evidenceChars: version.length * 2 - 1 })).rejects.toMatchObject({
      limit: 'evidenceChars',
    });
  });
  it('preserves UTF-16 event identity when copying retained strings', async () => {
    const id = 'unicode:' + String.fromCharCode(0xd800);
    const text = event(JSON.stringify(id).slice(1, -1));
    const result = await read([raw(text)]);
    expect(result.sources[0]?.notifications?.completionEvents[0]?.eventKey).toBe(`event:${id}`);
  });
});
