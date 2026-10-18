import { describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import { createBackupImportSession } from '@/utils/backup/importSession';
import { MAX_BACKUP_SIZE, MAX_RECOVERY_ARCHIVE_SIZE } from '@/utils/backup/parsing';
import {
  createBackupReceiver,
  backupTokens,
  readBackupBatch,
  BACKUP_TRANSFER_TEXT,
  BACKUP_TRANSFER_TOKENS,
} from '@/utils/backup/transfer';
const raw = (level = 42, owner: string | null = 'owner') =>
  JSON.stringify({
    _userId: owner,
    data: { ...defaultState, pvp: { ...defaultState.pvp, level } },
  });
const archive = (current: string | null, older_tab_edits: string[] = []) =>
  new File(
    [
      JSON.stringify({
        _format: 'tarkovtracker-device-progress',
        _version: 1,
        current,
        older_tab_edits,
      }),
    ],
    'archive.json'
  );
describe('isolated recovery parsing', () => {
  it('bounds error replies even when an invalid version contains a large string', async () => {
    const run = createBackupImportSession();
    const file = new File(
      [JSON.stringify({ _format: 'tarkovtracker-backup', _version: 'x'.repeat(100_000) })],
      'bad-version.json'
    );
    try {
      await run({ op: 'open', file, owner: null });
      throw new Error('Expected version rejection');
    } catch (error) {
      expect((error as Error).message).toContain('Unsupported backup version');
      expect((error as Error).message.length).toBeLessThanOrEqual(512);
    }
  });
  it('returns compact summaries and transfers only the selected sanitized snapshot on demand', async () => {
    const original = raw() + ' '.repeat(6 * 1024 * 1024);
    const file = archive(original, [raw(7), raw(1, 'foreign')]);
    const bytes = await file.text();
    const run = createBackupImportSession();
    const first = await run({ op: 'open', file, owner: 'owner' });
    expect(JSON.stringify(first).length).toBeLessThan(2048);
    expect(first).toMatchObject({
      summary: {
        preview: { pvp: { level: 42 } },
        entries: [
          { kind: 'current', index: 0 },
          { kind: 'older', index: 0 },
        ],
      },
    });
    const receiver = createBackupReceiver();
    for (;;) {
      const batch = await run({ op: 'read' });
      if (!('tokens' in batch)) throw new Error('Expected transfer');
      receiver.accept(batch.tokens);
      if (batch.done) break;
    }
    expect(receiver.value()).toMatchObject({ pvp: { level: 42 } });
    expect(JSON.stringify(receiver.value()).length).toBeLessThan(4096);
    expect(await run({ op: 'select', index: 1 })).toMatchObject({
      summary: { preview: { pvp: { level: 7 } } },
    });
    expect(await file.text()).toBe(bytes);
  });
  it('rejects over-limit files before reading, and large ordinary files after worker parsing', async () => {
    const text = vi.fn();
    const run = createBackupImportSession();
    await expect(
      run({
        op: 'open',
        owner: 'owner',
        file: { size: MAX_RECOVERY_ARCHIVE_SIZE + 1, text } as unknown as File,
      })
    ).rejects.toThrow('recovery_archive_too_large');
    expect(text).not.toHaveBeenCalled();
    const file = new File(
      [JSON.stringify({ padding: ' '.repeat(MAX_BACKUP_SIZE) })],
      'ordinary.json'
    );
    await expect(run({ op: 'open', file, owner: 'owner' })).rejects.toThrow(
      'Backup file is too large'
    );
  });
  it('handles malformed input and foreign owners without exposing entries or retaining an old selection', async () => {
    const run = createBackupImportSession();
    await run({ op: 'open', owner: 'owner', file: archive(raw()) });
    await expect(run({ op: 'open', owner: 'other', file: archive(raw()) })).rejects.toThrow(
      'invalid_device_archive'
    );
    await expect(run({ op: 'read' })).rejects.toThrow('invalid_device_archive');
    await expect(
      run({ op: 'open', owner: 'owner', file: new File(['{broken'], 'bad.json') })
    ).rejects.toThrow('Failed to parse JSON');
  });
});
describe('bounded selected-snapshot transfer', () => {
  it('round-trips nested progress, long keys, strings, empty objects, arrays and prototype-looking keys in bounded batches', () => {
    const long = '😀'.repeat(BACKUP_TRANSFER_TEXT * 3);
    const value = {
      [long]: { [long]: long },
      array: [true, false, null, 1, [], {}],
      ...JSON.parse('{"__proto__":{"safe":true}}'),
    };
    const receiver = createBackupReceiver();
    const source = backupTokens(value);
    let batches = 0;
    for (;;) {
      const batch = readBackupBatch(source);
      expect(batch.tokens.length).toBeLessThanOrEqual(BACKUP_TRANSFER_TOKENS);
      expect(JSON.stringify(batch).length).toBeLessThan(4 * BACKUP_TRANSFER_TEXT);
      receiver.accept(batch.tokens);
      batches++;
      if (batch.done) break;
    }
    expect(batches).toBeGreaterThan(10);
    expect(receiver.value()).toEqual(value);
    expect(Object.getPrototypeOf(receiver.value())).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).safe).toBeUndefined();
  });
});
