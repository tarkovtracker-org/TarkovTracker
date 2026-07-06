import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
import { PRECOMPUTED_TTL_SECONDS, runPrecompute, validatePrecomputeFilter } from '../precompute';
import type { KvWriter } from '../precompute';
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
    applyOverlayMock.mockReset().mockResolvedValue({ data: { tasks: [{ id: 'task-1' }] } });
  });
  it('writes a valid envelope per combination with the 7-day TTL', async () => {
    const kv = createKvMock();
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.failures).toEqual([]);
    expect(result.successes).toEqual([
      'tasks-core-json-v1-en-regular',
      'tasks-core-json-v1-en-pve',
    ]);
    expect(kv.put).toHaveBeenCalledTimes(2);
    const [key, value, options] = kv.put.mock.calls[0];
    expect(key).toBe('tasks-core-json-v1-en-regular');
    expect(options).toEqual({ expirationTtl: PRECOMPUTED_TTL_SECONDS });
    expect(PRECOMPUTED_TTL_SECONDS).toBe(604800);
    const envelope = JSON.parse(value as string);
    expect(isPrecomputedEnvelope(envelope)).toBe(true);
    expect(envelope.payload).toEqual({ data: { tasks: [{ id: 'task-1' }] } });
  });
  it('passes lang and gameMode through to the pipeline', async () => {
    const kv = createKvMock();
    await runPrecompute(kv, { gameMode: 'pve', lang: 'de' });
    expect(createFetcherMock).toHaveBeenCalledTimes(1);
    expect(createFetcherMock).toHaveBeenCalledWith({ gameMode: 'pve', lang: 'de' });
    expect(applyOverlayMock).toHaveBeenCalledWith({ raw: true }, { gameMode: 'pve' });
  });
  it('records a pipeline failure and continues with remaining combinations', async () => {
    applyOverlayMock
      .mockRejectedValueOnce(new Error('upstream 502'))
      .mockResolvedValue({ data: { tasks: [{ id: 'task-1' }] } });
    const kv = createKvMock();
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.failures).toEqual([
      { error: 'upstream 502', key: 'tasks-core-json-v1-en-regular' },
    ]);
    expect(result.successes).toEqual(['tasks-core-json-v1-en-pve']);
    expect(kv.put).toHaveBeenCalledTimes(1);
  });
  it('records a KV write failure without aborting the run', async () => {
    const kv = createKvMock();
    kv.put.mockRejectedValueOnce(new Error('KV write failed')).mockResolvedValue(undefined);
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.failures).toEqual([
      { error: 'KV write failed', key: 'tasks-core-json-v1-en-regular' },
    ]);
    expect(result.successes).toEqual(['tasks-core-json-v1-en-pve']);
  });
  it('refuses to write a structurally empty payload to KV', async () => {
    applyOverlayMock
      .mockResolvedValueOnce({ data: { tasks: [] } })
      .mockResolvedValue({ data: { tasks: [{ id: 'task-1' }] } });
    const kv = createKvMock();
    const result = await runPrecompute(kv, { lang: 'en' });
    expect(result.failures).toEqual([
      {
        error: 'Sanity check failed: payload has no tasks; refusing to write to KV',
        key: 'tasks-core-json-v1-en-regular',
      },
    ]);
    expect(result.successes).toEqual(['tasks-core-json-v1-en-pve']);
    expect(kv.put).toHaveBeenCalledTimes(1);
  });
});
