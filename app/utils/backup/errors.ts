export const BACKUP_IMPORT_ERROR = 'settings.data_management.import_error_description';
export class BackupImportError extends Error {
  constructor(message: string) {
    super(message.slice(0, 512));
  }
}
export function backupWorkerError(error: unknown): string {
  if (error instanceof BackupImportError) return error.message;
  // Diagnostics identify unexpected failures without logging private backup data or raw messages.
  console.error(
    '[BackupImportWorker] Unexpected import failure',
    error instanceof Error ? error.constructor.name : typeof error
  );
  return BACKUP_IMPORT_ERROR;
}
