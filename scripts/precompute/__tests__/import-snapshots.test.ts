import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TASK_IMPORT_MAX_AGE_MS } from '@/utils/taskImportCatalog';
import { runImportPrecompute } from '../import-snapshots';
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
    const result = await runImportPrecompute({ put });
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
    expect((await runImportPrecompute({ put }, { lang: 'en', gameMode: 'pve' })).successes).toEqual(
      ['tasks-import-json-v1-en-pve']
    );
    expect(put).toHaveBeenCalledTimes(1);
  });
});
