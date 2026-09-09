import {
  PRECOMPUTED_TTL_SECONDS,
  runPrecompute,
  validatePrecomputeFilter,
} from '@@/scripts/precompute/precompute';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTasksCorePrecomputedKey,
  isPrecomputedEnvelope,
} from '@/server/utils/precomputedTarkov';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import type { KvWriter } from '@@/scripts/precompute/precompute';
const { applyOverlayMock, createFetcherMock, fetcherMock } = vi.hoisted(() => {
  const hoistedFetcherMock = vi.fn();
  return {
    applyOverlayMock: vi.fn(),
    createFetcherMock: vi.fn(() => hoistedFetcherMock),
    fetcherMock: hoistedFetcherMock,
  };
});
vi.mock('@/server/utils/tarkov-json', () => ({
  createTarkovJsonTasksCoreFetcher: createFetcherMock,
}));
vi.mock('@/server/utils/overlay', () => ({
  applyOverlay: applyOverlayMock,
}));
function createKvMock(): KvWriter & { put: ReturnType<typeof vi.fn> } {
  return { put: vi.fn().mockResolvedValue(undefined) };
}
describe('validatePrecomputeFilter', () => {
  it('accepts an empty filter and supported values', () => {
    expect(validatePrecomputeFilter({})).toBeNull();
    expect(validatePrecomputeFilter({ lang: 'en' })).toBeNull();
    expect(validatePrecomputeFilter({ gameMode: 'pve' })).toBeNull();
    expect(validatePrecomputeFilter({ gameMode: 'pvp-season' })).toBeNull();
    expect(validatePrecomputeFilter({ gameMode: 'regular', lang: 'de' })).toBeNull();
  });
  it('rejects unsupported lang and gameMode values', () => {
    expect(validatePrecomputeFilter({ lang: 'xx' })).toContain('Unsupported lang "xx"');
    expect(validatePrecomputeFilter({ gameMode: 'arena' })).toContain(
      'Unsupported gameMode "arena"'
    );
  });
});
describe('runPrecompute', () => {
  beforeEach(() => {
    fetcherMock.mockReset().mockResolvedValue({ raw: true });
    createFetcherMock.mockClear();
    applyOverlayMock.mockReset().mockResolvedValue({
      data: { tasks: [{ id: 'task-1' }] },
      dataOverlay: { version: '1', sha256: 'release-sha' },
    });
  });
  it('retains all payload provenance when final manifest publication fails', async () => {
    const kv = createKvMock();
    kv.put.mockImplementation(async (key: string) => {
      if (key === 'overlay-precompute-manifest-json-v4') throw new Error('manifest unavailable');
    });
    const result = await runPrecompute(kv);
    expect(result.successes).toHaveLength(48);
    expect(result.manifest).toHaveLength(48);
    expect(result.failures).toEqual([
      { key: 'overlay-precompute-manifest-json-v4', error: 'manifest unavailable' },
    ]);
    expect(result.manifest.every((entry) => entry.overlay.sha256 === 'release-sha')).toBe(true);
  });
  it('writes a valid envelope per combination with the 7-day TTL', async () => {
    const kv = createKvMock();
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.failures).toEqual([]);
    expect(result.successes).toHaveLength(3);
    expect(result.successes).toEqual(
      expect.arrayContaining([
        'tasks-core-json-v4-en-regular',
        'tasks-core-json-v4-en-pve',
        'tasks-core-json-v4-en-pvp-season',
      ])
    );
    expect(kv.put).toHaveBeenCalledTimes(3);
    const putCall = kv.put.mock.calls.find(([key]) => key === 'tasks-core-json-v4-en-regular');
    expect(putCall).toBeDefined();
    const [, value, options] = putCall!;
    expect(options).toEqual({ expirationTtl: PRECOMPUTED_TTL_SECONDS });
    expect(PRECOMPUTED_TTL_SECONDS).toBe(604800);
    const envelope = JSON.parse(value as string);
    expect(isPrecomputedEnvelope(envelope)).toBe(true);
    expect(envelope.payload).toEqual({
      data: { tasks: [{ id: 'task-1' }] },
      dataOverlay: { version: '1', sha256: 'release-sha' },
    });
  });
  it('passes lang and gameMode through to the pipeline', async () => {
    const kv = createKvMock();
    await runPrecompute(kv, { gameMode: 'pve', lang: 'de' });
    expect(createFetcherMock).toHaveBeenCalledTimes(1);
    expect(createFetcherMock).toHaveBeenCalledWith({ gameMode: 'pve', lang: 'de' });
    expect(applyOverlayMock).toHaveBeenCalledWith({ raw: true }, { gameMode: 'pve', locale: 'de' });
  });
  it('expands to all supported lang and gameMode combinations when no filter is provided', async () => {
    const kv = createKvMock();
    const result = await runPrecompute(kv, {});
    const expectedKeys = API_SUPPORTED_LANGUAGES.flatMap((lang) =>
      VALID_GAME_MODES.map((gameMode) => buildTasksCorePrecomputedKey(lang, gameMode))
    );
    expect(result.failures).toEqual([]);
    expect(result.successes).toHaveLength(expectedKeys.length);
    expect(result.successes).toEqual(expect.arrayContaining(expectedKeys));
    expect(kv.put).toHaveBeenCalledTimes(expectedKeys.length + 1);
  });
  it('records a pipeline failure and continues with remaining combinations', async () => {
    applyOverlayMock.mockRejectedValueOnce(new Error('upstream 502')).mockResolvedValue({
      data: { tasks: [{ id: 'task-1' }] },
      dataOverlay: { version: '1', sha256: 'release-sha' },
    });
    const kv = createKvMock();
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.failures).toEqual([
      { error: 'upstream 502', key: 'tasks-core-json-v4-en-regular' },
    ]);
    expect(result.successes).toEqual([
      'tasks-core-json-v4-en-pve',
      'tasks-core-json-v4-en-pvp-season',
    ]);
    expect(kv.put).toHaveBeenCalledTimes(2);
  });
  it('records a KV write failure without aborting the run', async () => {
    const kv = createKvMock();
    kv.put.mockRejectedValueOnce(new Error('KV write failed')).mockResolvedValue(undefined);
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.failures).toEqual([
      { error: 'KV write failed', key: 'tasks-core-json-v4-en-regular' },
    ]);
    expect(result.successes).toEqual([
      'tasks-core-json-v4-en-pve',
      'tasks-core-json-v4-en-pvp-season',
    ]);
  });
  it.each([
    { name: 'empty tasks', tasks: [], error: 'payload has no tasks' },
    {
      name: 'malformed task entries',
      tasks: [null, { id: 'task-good', objectives: [] }],
      error: 'payload contains a malformed task',
    },
  ])('refuses to publish $name to KV', async ({ tasks, error }) => {
    applyOverlayMock.mockResolvedValueOnce({ data: { tasks } }).mockResolvedValue({
      data: { tasks: [{ id: 'task-good', objectives: [] }] },
      dataOverlay: { version: '1', sha256: 'release-sha' },
    });
    const kv = createKvMock();
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.failures).toEqual([
      {
        error: `Sanity check failed: ${error}; refusing to write to KV`,
        key: 'tasks-core-json-v4-en-regular',
      },
    ]);
    expect(result.successes).toEqual([
      'tasks-core-json-v4-en-pve',
      'tasks-core-json-v4-en-pvp-season',
    ]);
    expect(kv.put).toHaveBeenCalledTimes(2);
  });
  it('refuses to publish overlay objective patches as objects', async () => {
    applyOverlayMock
      .mockResolvedValueOnce({
        data: { tasks: [{ id: 'task-bad', objectives: { objective: { count: 2 } } }] },
      })
      .mockResolvedValue({
        data: { tasks: [{ id: 'task-good', objectives: [] }] },
        dataOverlay: { version: '1', sha256: 'release-sha' },
      });
    const kv = createKvMock();
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.failures).toEqual([
      {
        error:
          'Sanity check failed: task "task-bad" has malformed objective arrays; refusing to write to KV',
        key: 'tasks-core-json-v4-en-regular',
      },
    ]);
    expect(result.successes).toEqual([
      'tasks-core-json-v4-en-pve',
      'tasks-core-json-v4-en-pvp-season',
    ]);
    expect(kv.put).toHaveBeenCalledTimes(2);
  });
});
describe('overlay provenance gate', () => {
  it('retains old entries when a release changes midway through the run', async () => {
    const payload = (sha256: string) => ({
      data: { tasks: [{ id: 'task' }] },
      dataOverlay: { version: '1', sha256 },
    });
    applyOverlayMock
      .mockReset()
      .mockResolvedValueOnce(payload('first'))
      .mockResolvedValue(payload('second'));
    const kv = createKvMock();
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.successes).toHaveLength(1);
    expect(result.failures).toHaveLength(2);
    expect(kv.put).toHaveBeenCalledTimes(1);
  });
  it('refuses unknown sections and missing provenance', async () => {
    applyOverlayMock
      .mockReset()
      .mockResolvedValueOnce({
        data: { tasks: [{ id: 'task' }] },
        dataOverlay: { version: '1', sha256: 'sha', unconsumedSections: ['future'] },
      })
      .mockResolvedValue({ data: { tasks: [{ id: 'task' }] } });
    const kv = createKvMock();
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.failures).toHaveLength(3);
    expect(kv.put).not.toHaveBeenCalled();
  });
});
