import { BackupImportError } from '@/utils/backup/errors';
import {
  MAX_BACKUP_SIZE,
  MAX_RECOVERY_ARCHIVE_SIZE,
  validateBackup,
  resolveRecoveryArchive,
  defaultArchiveEntryIndex,
  parseRecoveryProgress,
  buildPreview,
  isDeviceRecoveryArchiveV1,
  type RecoveryArchiveEntry,
  type RawRecoveryArchiveEntry,
  type BackupPreviewData,
  type ValidatedBackup,
} from '@/utils/backup/parsing';
import { backupTokens, readBackupBatch, type BackupToken } from '@/utils/backup/transfer';
export type BackupMetadata = Pick<
  ValidatedBackup['export'],
  'exportedAt' | 'appVersion' | 'currentGameMode' | 'gameEdition' | 'tarkovUid'
>;
export type SelectedBackup = Omit<ValidatedBackup, 'export'> & { export: BackupMetadata };
export type BackupSummary = {
  preview: BackupPreviewData;
  entries: RecoveryArchiveEntry[];
  selected: number | null;
  ownerBound: boolean;
};
export type BackupCommand =
  | { op: 'open'; file: File; owner: string | null }
  | { op: 'select'; index: number }
  | { op: 'read' };
export type BackupReply = { summary: BackupSummary } | { tokens: BackupToken[]; done: boolean };
const fail = (message: string): never => {
  throw new BackupImportError(message);
};
// Only one file and one selected normalized snapshot are retained by each disposable worker.
export function createBackupImportSession() {
  let entries: RawRecoveryArchiveEntry[] = [];
  let selected: SelectedBackup | undefined;
  let stream: Generator<BackupToken> | undefined;
  function summarize(value: unknown, index: number | null): BackupReply {
    const result = validateBackup(value);
    if (!result.ok) return fail(result.error);
    const { exportedAt, appVersion, currentGameMode, gameEdition, tarkovUid } = result.data.export;
    const metadata = {
      exportedAt: typeof exportedAt === 'number' ? exportedAt : 0,
      appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 128) : '',
      currentGameMode,
      gameEdition,
      tarkovUid,
    };
    selected = {
      pvp: result.data.pvp,
      pve: result.data.pve,
      seasonal: result.data.seasonal,
      export: metadata,
    };
    stream = undefined;
    return {
      summary: {
        preview: buildPreview(metadata, selected.pvp, selected.pve, selected.seasonal),
        entries: entries.map(({ kind, index }) => ({ kind, index })),
        selected: index,
        ownerBound: index !== null,
      },
    };
  }
  function select(index: number): BackupReply {
    selected = undefined;
    stream = undefined;
    const entry = entries[index];
    if (!Number.isInteger(index) || !entry)
      return fail('settings.data_management.older_edit_unavailable');
    const result = parseRecoveryProgress(entry.raw);
    if (!result.ok) return fail(`settings.data_management.${result.error}`);
    return summarize(result.value, index);
  }
  function parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return fail('Failed to parse JSON — file may be corrupted');
    }
  }
  async function readFile(file: File): Promise<unknown> {
    if (file.size > MAX_RECOVERY_ARCHIVE_SIZE)
      return fail('settings.data_management.recovery_archive_too_large');
    const value = parseJson(await file.text());
    if (file.size > MAX_BACKUP_SIZE && !isDeviceRecoveryArchiveV1(value))
      return fail('Backup file is too large (max 5 MB)');
    return value;
  }
  async function open(file: File, owner: string | null): Promise<BackupReply> {
    entries = [];
    selected = undefined;
    stream = undefined;
    const value = await readFile(file);
    const result = resolveRecoveryArchive(value, owner);
    if (!result.ok) return fail(`settings.data_management.${result.error}`);
    if (!result.entries) return summarize(result.value, null);
    entries = result.entries;
    return select(defaultArchiveEntryIndex(entries));
  }
  function read(): BackupReply {
    if (!selected) return fail('settings.data_management.invalid_device_archive');
    stream ??= backupTokens(selected);
    const batch = readBackupBatch(stream);
    if (batch.done) stream = undefined;
    return batch;
  }
  return async (command: BackupCommand): Promise<BackupReply> => {
    if (command.op === 'open') return open(command.file, command.owner);
    if (command.op === 'select') return select(command.index);
    return read();
  };
}
