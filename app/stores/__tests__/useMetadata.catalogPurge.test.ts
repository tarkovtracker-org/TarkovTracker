// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import * as asyncUtils from '@/utils/async';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import * as cache from '@/utils/tarkovCache';
import type { Task } from '@/types/tarkov';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
const seedAt = '2026-11-18T12:00:00Z';
const purgeAt = '2026-11-18T13:00:00Z';
const requestAt = Date.parse('2026-11-18T14:00:00Z');
const payload = (count: number, fetchedAt?: string) => ({
  data: { tasks: [{ id: 'task', objectives: [{ id: 'objective', count }], failConditions: [] }] },
  dataOverlay: fetchedAt ? { fetchedAt } : {},
});
type HookOptions = { onResponse?: (context: { response: Response }) => void };
const notify = (options: HookOptions, status = 'PRECOMPUTE') =>
  options.onResponse?.({
    response: new Response(null, {
      headers: { 'X-Cache-Status': status, 'X-Catalog-Release': String(Date.parse(seedAt)) },
    }),
  });
const prepare = () => {
  const store = useMetadataStore();
  store.tasks = [{ id: 'task', objectives: [{ id: 'objective', count: 1 }] }] as Task[];
  vi.spyOn(store, 'fetchObjectiveModeCountDifferences').mockResolvedValue(undefined);
  return store;
};
describe('immutable catalog snapshots after an operator purge', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.spyOn(Date, 'now').mockReturnValue(requestAt);
    vi.spyOn(cache, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cache, 'setCachedData').mockResolvedValue();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  it.each([seedAt, undefined])(
    'accepts the active preseed after purge with overlay fetchedAt %s',
    async (fetchedAt) => {
      localStorage.setItem(STORAGE_KEYS.cachePurgeAt, purgeAt);
      const store = prepare();
      const delay = vi.spyOn(asyncUtils, 'delay').mockResolvedValue();
      const fetch = vi.fn(async (_url: string, options: HookOptions) => {
        notify(options);
        return payload(3, fetchedAt);
      });
      vi.stubGlobal('$fetch', fetch);
      await store.fetchTaskObjectivesData(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(delay).not.toHaveBeenCalled();
      expect(store.tasks[0]?.objectives?.[0]?.count).toBe(3);
      expect(cache.setCachedData).toHaveBeenCalledWith(
        'tasks-objectives',
        `neutral-v2-regular-${Date.parse(purgeAt)}`,
        'en',
        payload(3).data,
        expect.any(Number),
        expect.any(Function)
      );
    }
  );
  it('rejects a stale edge fallback after purge even when its body timestamp looks current', async () => {
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, purgeAt);
    const store = prepare();
    const merge = vi.spyOn(store, 'mergeTaskObjectives');
    const delay = vi.spyOn(asyncUtils, 'delay').mockResolvedValue();
    let reads = 0;
    vi.stubGlobal(
      '$fetch',
      vi.fn(async (_url: string, options: HookOptions) => {
        notify(options, reads++ === 0 ? 'STALE' : 'PRECOMPUTE');
        return reads === 1 ? payload(9, '2026-11-18T15:00:00Z') : payload(3, seedAt);
      })
    );
    await store.fetchTaskObjectivesData(true);
    expect(delay).toHaveBeenCalledTimes(1);
    expect(merge).toHaveBeenCalledTimes(1);
    expect(store.tasks[0]?.objectives?.[0]?.count).toBe(3);
  });
  it('fences a request begun before purge and adopts only its new post-purge retry', async () => {
    const store = prepare();
    const first = Promise.withResolvers<ReturnType<typeof payload>>();
    const retry = Promise.withResolvers<undefined>();
    const delay = vi.spyOn(asyncUtils, 'delay').mockReturnValue(retry.promise);
    let reads = 0;
    const fetch = vi.fn(async (_url: string, options: HookOptions) => {
      const result = reads++ === 0 ? await first.promise : payload(3, seedAt);
      notify(options);
      return result;
    });
    vi.stubGlobal('$fetch', fetch);
    const pending = store.fetchTaskObjectivesData(true);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const laterPurge = new Date(requestAt + 1000).toISOString();
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, laterPurge);
    first.resolve(payload(9, seedAt));
    await vi.waitFor(() => expect(delay).toHaveBeenCalledTimes(1));
    expect(cache.setCachedData).not.toHaveBeenCalled();
    expect(store.tasks[0]?.objectives?.[0]?.count).toBe(1);
    vi.mocked(Date.now).mockReturnValue(requestAt + 2000);
    retry.resolve(undefined);
    await pending;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.tasks[0]?.objectives?.[0]?.count).toBe(3);
  });
  it('accepts post-purge mode counts from the active seed and rejects stale fallback counts', async () => {
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, purgeAt);
    const store = prepare();
    let status = 'PRECOMPUTE';
    vi.stubGlobal(
      '$fetch',
      vi.fn(async (_url: string, options: HookOptions) => {
        notify(options, status);
        return payload(3);
      })
    );
    await expect(store.loadModeObjectiveCounts('pve', true)).resolves.toEqual({ objective: 3 });
    status = 'STALE';
    await expect(store.loadModeObjectiveCounts('pve', true)).rejects.toThrow(
      'Objective catalog predates'
    );
  });
});
