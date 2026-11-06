// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest';
const { run, send } = vi.hoisted(() => ({ run: vi.fn(), send: vi.fn() }));
vi.mock('@/utils/backup/importSession', () => ({ createBackupImportSession: () => run }));
beforeEach(() => {
  vi.resetModules();
  run.mockReset();
  send.mockReset();
  vi.stubGlobal('postMessage', send);
  vi.stubGlobal('onmessage', null);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
async function dispatch() {
  await import('@/workers/backupImport.worker');
  const handler = globalThis.onmessage as unknown as (event: MessageEvent) => Promise<void>;
  await handler(new MessageEvent('message', { data: { id: 73, command: { op: 'read' } } }));
}
it('loads the real worker entrypoint and echoes the request id with its reply', async () => {
  const reply = { tokens: [], done: true };
  run.mockResolvedValue(reply);
  await dispatch();
  expect(send).toHaveBeenCalledExactlyOnceWith({ id: 73, reply });
});
it('preserves bounded expected validation errors without logging them', async () => {
  const { BackupImportError } = await import('@/utils/backup/errors');
  run.mockRejectedValue(new BackupImportError('Invalid backup'));
  await dispatch();
  expect(send).toHaveBeenCalledExactlyOnceWith({ id: 73, error: 'Invalid backup' });
  expect(console.error).not.toHaveBeenCalled();
});
it('returns a translation key and records a private-data-free diagnostic for unexpected errors', async () => {
  run.mockRejectedValue(new TypeError('private recovery bytes'));
  await dispatch();
  expect(send).toHaveBeenCalledExactlyOnceWith({
    id: 73,
    error: 'settings.data_management.import_error_description',
  });
  expect(console.error).toHaveBeenCalledWith(
    '[BackupImportWorker] Unexpected import failure',
    'TypeError'
  );
  expect(JSON.stringify(send.mock.calls)).not.toContain('private recovery bytes');
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    'private recovery bytes'
  );
});
