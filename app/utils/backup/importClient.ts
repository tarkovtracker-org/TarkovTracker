import { createBackupReceiver } from '@/utils/backup/transfer';
import type { BackupCommand, BackupReply, SelectedBackup } from '@/utils/backup/importSession';
export class BackupImportCancelled extends Error {}
export function createBackupImportClient() {
  const worker = new Worker(new URL('../../workers/backupImport.worker.ts', import.meta.url), {
    type: 'module',
  });
  let sequence = 0;
  let disposed = false;
  const pending = new Map<
    number,
    { resolve: (reply: BackupReply) => void; reject: (error: Error) => void }
  >();
  function cancel(error: Error = new BackupImportCancelled()) {
    disposed = true;
    worker.terminate();
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
  worker.onmessage = ({
    data,
  }: MessageEvent<{ id: number; reply: BackupReply; error?: string }>) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data.reply);
  };
  worker.onerror = () => cancel(new Error('Failed to read backup file'));
  worker.onmessageerror = () => cancel(new Error('Failed to read backup file'));
  function request(command: BackupCommand): Promise<BackupReply> {
    if (disposed) return Promise.reject(new BackupImportCancelled());
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, command });
      } catch {
        cancel(new Error('Failed to read backup file'));
      }
    });
  }
  async function read(): Promise<SelectedBackup> {
    const receiver = createBackupReceiver();
    for (;;) {
      const reply = await request({ op: 'read' });
      if (!('tokens' in reply)) throw new Error('Invalid backup worker response');
      receiver.accept(reply.tokens);
      if (reply.done) return receiver.value() as SelectedBackup;
    }
  }
  return { request, read, cancel };
}
