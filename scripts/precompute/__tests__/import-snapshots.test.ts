import { runImportPrecompute } from '@@/scripts/precompute/import-snapshots';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TASK_IMPORT_MAX_AGE_MS } from '@/utils/taskImportCatalog';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), overlay: vi.fn(), create: vi.fn() }));
vi.mock('@/server/utils/tarkov-json', () => ({ createTarkovJsonTasksImportFetcher: mocks.create }));
vi.mock('@/server/utils/overlay', () => ({ applyOverlay: mocks.overlay }));
const tasks = [{ id: 'task', objectives: [{ id: 'objective', count: 7 }], failConditions: [] }];
describe('three English import snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockReturnValue(mocks.fetch);
    mocks.fetch.mockResolvedValue({ data: { tasks } });
    mocks.overlay.mockImplementation(async (base) => ({
      ...base,
      dataOverlay: { version: 'v1', sha256: 'sha1' },
    }));
  });
  it('publishes exactly three whole catalogs with one overlay pass per mode', async () => {
    const put = vi.fn();
    const result = await runImportPrecompute({ put }, {}, 'sha1');
    expect(result.failures).toEqual([]);
    expect(result.successes).toEqual([
      'tasks-import-json-v1-en-regular',
      'tasks-import-json-v1-en-pve',
      'tasks-import-json-v1-en-pvp-season',
    ]);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.overlay).toHaveBeenCalledTimes(3);
    for (const [index, mode] of ['regular', 'pve', 'pvp-season'].entries()) {
      expect(mocks.create.mock.calls[index]).toEqual([{ gameMode: mode, lang: 'en' }]);
      expect(mocks.overlay.mock.calls[index]?.[1]).toEqual({ gameMode: mode, locale: 'en' });
      const call = put.mock.calls[index]!;
      expect(JSON.parse(call[1]).payload).toMatchObject({
        data: { tasks },
        catalog: { lang: 'en', gameMode: mode },
      });
      expect(call[2]).toEqual({ expirationTtl: TASK_IMPORT_MAX_AGE_MS / 1000 });
    }
  });
  it.each([
    { status: 'missing' },
    { version: 'v1', sha256: 'wrong' },
    { version: 'v1', sha256: 'sha1', unconsumedSections: ['unknown'] },
  ])('retains last-good keys for invalid/mismatched overlay %j', async (dataOverlay) => {
    mocks.overlay.mockImplementation(async (base) => ({ ...base, dataOverlay }));
    const put = vi.fn();
    const result = await runImportPrecompute({ put }, {}, 'sha1');
    expect(result.failures).toHaveLength(3);
    expect(put).not.toHaveBeenCalled();
  });
  it('retains the old key on malformed objective counts and partial mode failures', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('upstream offline'));
    mocks.overlay.mockResolvedValueOnce({
      data: { tasks: [{ ...tasks[0], objectives: [{ id: 'objective', count: Infinity }] }] },
      dataOverlay: { version: 'v1', sha256: 'sha1' },
    });
    const put = vi.fn();
    const result = await runImportPrecompute({ put }, {}, 'sha1');
    expect(result.failures.map((row) => row.key)).toEqual([
      'tasks-import-json-v1-en-regular',
      'tasks-import-json-v1-en-pve',
    ]);
    expect(result.successes).toEqual(['tasks-import-json-v1-en-pvp-season']);
    expect(put).toHaveBeenCalledTimes(1);
  });
  it('honors the existing mode/language filters', async () => {
    const put = vi.fn();
    expect(await runImportPrecompute({ put }, { lang: 'de' })).toEqual({
      successes: [],
      failures: [],
    });
    expect(
      (await runImportPrecompute({ put }, { lang: 'en', gameMode: 'pve' }, 'sha1')).successes
    ).toEqual(['tasks-import-json-v1-en-pve']);
    expect(put).toHaveBeenCalledTimes(1);
  });
  it.each([
    {},
    { tasks: {} },
    { tasks: [] },
    { tasks: { task: { id: 'task', objectives: {} } } },
    { tasks: { task: { id: 'task' } } },
    { tasks: { task: { id: 'task', objectives: [null] } } },
    { tasks: { task: { id: 'task', objectives: [], failConditions: {} } } },
    { tasks: { task: { id: 'task', objectives: [{ id: 'obj', count: '9' }] } } },
    { tasks: { task: { id: 'task', objectives: [{ id: 'obj', type: 'giveItem', count: null }] } } },
  ])(
    'retains the full last-good snapshot when raw data is malformed, despite overlay additions: %j',
    async (source) => {
      const actual = await vi.importActual<typeof import('@/server/utils/tarkov-json')>(
        '@/server/utils/tarkov-json'
      );
      const fetcher = vi.fn(async (url: string) => ({
        data: url === 'https://json.tarkov.dev/regular/tasks' ? source : {},
        translations: [],
      }));
      mocks.create.mockImplementation((options) =>
        actual.createTarkovJsonTasksImportFetcher({
          ...options,
          deps: { fetcher: fetcher as never },
        })
      );
      mocks.overlay.mockResolvedValue({
        data: { tasks: [{ id: 'overlay-addition', objectives: [], failConditions: [] }] },
        dataOverlay: { version: 'v1', sha256: 'sha1' },
      });
      const prior = JSON.stringify({
        data: { tasks },
        dataOverlay: { version: 'last-good', sha256: 'last-good' },
      });
      const saved = new Map([['tasks-import-json-v1-en-regular', prior]]);
      const put = vi.fn(async (key: string, value: string) => {
        saved.set(key, value);
      });
      const result = await runImportPrecompute({ put }, { gameMode: 'regular' }, 'sha1');
      expect(result.failures).toEqual([
        {
          key: 'tasks-import-json-v1-en-regular',
          error: 'Invalid raw task import source; retaining previous snapshot',
        },
      ]);
      expect(put).not.toHaveBeenCalled();
      expect(mocks.overlay).not.toHaveBeenCalled();
      expect(saved.get('tasks-import-json-v1-en-regular')).toBe(prior);
    }
  );
  it('does not refresh any import key when a failed core run supplies no pinned release SHA', async () => {
    const put = vi.fn();
    const result = await runImportPrecompute({ put });
    expect(result.failures).toHaveLength(3);
    expect(
      result.failures.every(
        (row) => row.error === 'Import overlay release SHA unavailable; retaining previous entry'
      )
    ).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.overlay).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
