import {
  createBackupImportSession,
  BackupImportError,
  type BackupCommand,
} from '@/utils/backup/importSession';
const run = createBackupImportSession();
// DOM and worker lib globals overlap; use the small endpoint contract instead of loading both libs.
const endpoint = globalThis as unknown as {
  onmessage: (event: MessageEvent<{ id: number; command: BackupCommand }>) => void;
  postMessage: (value: unknown) => void;
};
endpoint.onmessage = async ({ data: { id, command } }) => {
  try {
    endpoint.postMessage({ id, reply: await run(command) });
  } catch (error) {
    endpoint.postMessage({
      id,
      error: error instanceof BackupImportError ? error.message : 'Failed to read backup file',
    });
  }
};
