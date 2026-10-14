import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEftImportTaskCatalog } from '@/utils/eftLogImportCatalog';
const task = (id = 'task', count = 4) => ({
  id,
  objectives: [{ id: 'objective', count }],
  failConditions: [],
});
const payload = (gameMode = 'regular', tasks = [task()]) => ({
  data: { tasks },
  dataOverlay: { version: 'catalog-test', sha256: 'catalog-sha' },
  catalog: { lang: 'en', gameMode },
});
describe('loadEftImportTaskCatalog', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ['pvp', 'regular'],
    ['pve', 'pve'],
    ['seasonal', 'pvp-season'],
  ] as const)('loads one whole %s catalog without joining UI caches', async (mode, upstream) => {
    const snapshot = payload(upstream);
    const fetch = vi.fn().mockResolvedValue(snapshot);
    vi.stubGlobal('$fetch', fetch);
    expect(await loadEftImportTaskCatalog(mode)).toEqual(snapshot.data.tasks);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/tarkov/tasks-import',
      expect.objectContaining({ query: { gameMode: upstream }, cache: 'no-store' })
    );
  });
  it.each([
    { error: 'offline' },
    payload('pve'),
    { ...payload(), catalog: { lang: 'de', gameMode: 'regular' } },
    { ...payload(), dataOverlay: { status: 'missing' } },
    { ...payload(), dataOverlay: { version: 'v1', sha256: '' } },
    payload('regular', []),
    payload('regular', [task(), task()]),
    payload('regular', [{ ...task(), objectives: [{ id: 'objective', count: -1 }] }]),
    payload('regular', [{ ...task(), objectives: undefined } as never]),
    payload('regular', [{ ...task(), failConditions: undefined } as never]),
  ])('rejects unusable catalog %j', async (snapshot) => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(snapshot));
    await expect(loadEftImportTaskCatalog('pvp')).rejects.toThrow('could not be loaded');
  });
  it('returns updated counts, gates, additions and removals together', async () => {
    const updated = {
      ...task('new-task', 9),
      minPlayerLevel: 25,
      taskRequirements: [{ task: { id: 'gate' }, status: ['complete'] }],
    };
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(payload('regular', [updated])));
    const tasks = await loadEftImportTaskCatalog('pvp');
    expect(tasks).toEqual([updated]);
    expect(tasks.some((task) => task.id === 'retired-task')).toBe(false);
  });
  it('does not require a UI/global release SHA to agree with a whole valid snapshot', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(payload()));
    await expect(loadEftImportTaskCatalog('pvp')).resolves.toEqual([task()]);
  });
  it('qualifies shared objective IDs with each destination task ID', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue(payload('pve', [task('a', 2), task('b', 5)]))
    );
    const tasks = await loadEftImportTaskCatalog('pve');
    expect(tasks.map((task) => task.objectives)).toEqual([
      [{ id: 'objective:a', count: 2 }],
      [{ id: 'objective:b', count: 5 }],
    ]);
  });
});
