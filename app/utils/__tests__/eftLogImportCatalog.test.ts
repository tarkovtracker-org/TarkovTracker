import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEftImportTaskCatalog } from '@/utils/eftLogImportCatalog';
const dataOverlay = { version: 'catalog-test', sha256: 'catalog-sha' };
const withOverlay = <T>(data: T) => ({ data, dataOverlay });
describe('loadEftImportTaskCatalog', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('loads the destination mode and joins objective data into the task catalog', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(withOverlay({ tasks: [{ id: 'task', name: 'Task' }] }))
      .mockResolvedValueOnce(
        withOverlay({ tasks: [{ id: 'task', objectives: { a: { id: 'objective', count: 4 } } }] })
      );
    vi.stubGlobal('$fetch', fetch);
    expect(await loadEftImportTaskCatalog('seasonal')).toEqual([
      { id: 'task', name: 'Task', objectives: [{ id: 'objective', count: 4 }] },
    ]);
    expect(fetch.mock.calls[0]?.[1].query.gameMode).toBe('pvp-season');
    expect(fetch.mock.calls[1]?.[1].query.gameMode).toBe('pvp-season');
    expect(fetch.mock.calls[1]?.[1].query.version).toBe('json-v4');
  });
  it('rejects incomplete objectives instead of importing partial progress', async () => {
    vi.stubGlobal(
      '$fetch',
      vi
        .fn()
        .mockResolvedValueOnce(withOverlay({ tasks: [{ id: 'task' }] }))
        .mockResolvedValueOnce(withOverlay({ tasks: [] }))
    );
    await expect(loadEftImportTaskCatalog('pve')).rejects.toThrow('incomplete');
  });
  it('rejects failed metadata responses', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ error: 'offline' }));
    await expect(loadEftImportTaskCatalog('pvp')).rejects.toThrow('could not be loaded');
  });
  it.each([undefined, { version: 'catalog-test', sha256: '' }])(
    'rejects missing objective provenance before returning a catalog: %j',
    async (objectiveOverlay) => {
      vi.stubGlobal(
        '$fetch',
        vi
          .fn()
          .mockResolvedValueOnce(withOverlay({ tasks: [{ id: 'task' }] }))
          .mockResolvedValueOnce({
            data: { tasks: [{ id: 'task', objectives: [] }] },
            dataOverlay: objectiveOverlay,
          })
      );
      await expect(loadEftImportTaskCatalog('pve')).rejects.toThrow('overlay');
    }
  );
  it('accepts complete task data while separately cached global overlay identities propagate', async () => {
    vi.stubGlobal(
      '$fetch',
      vi
        .fn()
        .mockResolvedValueOnce(withOverlay({ tasks: [{ id: 'task' }] }))
        .mockResolvedValueOnce({
          data: { tasks: [{ id: 'task', objectives: [] }] },
          dataOverlay: { version: 'earlier-non-task-overlay', sha256: 'earlier-sha' },
        })
    );
    await expect(loadEftImportTaskCatalog('pve')).resolves.toEqual([
      { id: 'task', objectives: [] },
    ]);
  });
});
describe('persisted objective identity', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('qualifies shared objective IDs with each destination task ID', async () => {
    vi.stubGlobal(
      '$fetch',
      vi
        .fn()
        .mockResolvedValueOnce(withOverlay({ tasks: [{ id: 'task-a' }, { id: 'task-b' }] }))
        .mockResolvedValueOnce({
          dataOverlay,
          data: {
            tasks: [
              { id: 'task-a', objectives: [{ id: 'shared', count: 2 }] },
              {
                id: 'task-b',
                objectives: [
                  { id: 'shared', count: 5 },
                  { id: 'unique', count: 1 },
                ],
              },
            ],
          },
        })
    );
    const tasks = await loadEftImportTaskCatalog('pve');
    expect(tasks[0]?.objectives).toEqual([{ id: 'shared:task-a', count: 2 }]);
    expect(tasks[1]?.objectives).toEqual([
      { id: 'shared:task-b', count: 5 },
      { id: 'unique', count: 1 },
    ]);
  });
});
