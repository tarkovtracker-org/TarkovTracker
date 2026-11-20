// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import * as cache from '@/utils/tarkovCache';
import { createDeferred } from '@/utils/test-helpers';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
const purge = '2026-11-18T13:00:00Z';
const bundle = () => ({
  scope: 'regular-en',
  tasksCore: { tasks: [{ id: 'cached', name: 'Cached' }], maps: [], traders: [] },
  hideout: { hideoutStations: [{ id: 'station', name: 'Station', levels: [] }] },
  prestige: { prestige: [] },
  editions: { editions: [], storyChapters: [] },
});
const prepareCache = () => {
  const current = bundle();
  const entries = new Map<string, unknown>([
    ['tasks-core', current.tasksCore],
    ['hideout', current.hideout],
    ['prestige', current.prestige],
    ['editions', current.editions],
  ]);
  vi.spyOn(cache, 'getCachedData').mockImplementation(
    async (type) => (entries.get(type) ?? null) as never
  );
  return entries;
};
describe('critical metadata cache purge generation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.spyOn(cache, 'setCachedData').mockResolvedValue();
    vi.spyOn(cache, 'cleanupExpiredCache').mockResolvedValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  it('waits for the shared purge check before reading critical IndexedDB entries', async () => {
    prepareCache();
    const store = useMetadataStore();
    const gate = createDeferred<undefined>();
    vi.spyOn(store, 'checkCachePurge').mockReturnValue(gate.promise);
    const pending = store.loadCriticalCacheData();
    try {
      await flushPromises();
      expect(cache.getCachedData).not.toHaveBeenCalled();
    } finally {
      gate.resolve(undefined);
      await pending;
    }
  });
  it('discards the old critical entries when the server reports a newer purge', async () => {
    const entries = prepareCache();
    vi.spyOn(cache, 'clearAllCache').mockImplementation(async () => entries.clear());
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ data: { lastPurgeAt: purge } }));
    const cached = await useMetadataStore().loadCriticalCacheData();
    expect(cached).toBeNull();
    expect(cache.clearAllCache).toHaveBeenCalledTimes(1);
  });
  it('rejects a preloaded critical bundle after its purge generation changes', async () => {
    prepareCache();
    const store = useMetadataStore();
    vi.spyOn(store, 'checkCachePurge').mockResolvedValue();
    const cached = await store.loadCriticalCacheData();
    expect(cached).not.toBeNull();
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, purge);
    expect(store.applyCriticalCachedData(cached!)).toBe(false);
    expect(store.tasks).toEqual([]);
  });
  it('rejects critical data whose IndexedDB read crosses a purge generation', async () => {
    const entries = prepareCache();
    const taskRead = createDeferred<unknown>();
    vi.mocked(cache.getCachedData).mockImplementation(
      async (type) => (type === 'tasks-core' ? taskRead.promise : entries.get(type)) as never
    );
    const store = useMetadataStore();
    vi.spyOn(store, 'checkCachePurge').mockResolvedValue();
    const pending = store.loadCriticalCacheData();
    await vi.waitFor(() => expect(cache.getCachedData).toHaveBeenCalled());
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, purge);
    taskRead.resolve(bundle().tasksCore);
    expect(await pending).toBeNull();
  });
  it('finishes the purge check before applying an externally preloaded startup bundle', async () => {
    const store = useMetadataStore();
    const gate = createDeferred<undefined>();
    vi.spyOn(store, 'checkCachePurge').mockReturnValue(gate.promise);
    const apply = vi.spyOn(store, 'applyCriticalCachedData');
    for (const name of [
      'fetchBootstrapData',
      'fetchItemsLiteData',
      'fetchTaskObjectivesData',
      'fetchTaskRewardsData',
      'fetchPrestigeData',
      'fetchEditionsData',
    ] as const)
      vi.spyOn(store, name).mockResolvedValue();
    vi.spyOn(store, 'fetchTasksCoreData').mockImplementation(async () => {
      store.tasks = [{ id: 'fresh', name: 'Fresh' }] as never;
    });
    vi.spyOn(store, 'fetchHideoutData').mockImplementation(async () => {
      store.hideoutStations = bundle().hideout.hideoutStations as never;
    });
    const pending = store.fetchAllData(false, { cachedData: bundle() as never });
    try {
      await flushPromises();
      expect(apply).not.toHaveBeenCalled();
    } finally {
      localStorage.setItem(STORAGE_KEYS.cachePurgeAt, purge);
      gate.resolve(undefined);
      await pending;
    }
    expect(store.tasks[0]?.id).toBe('fresh');
  });
});
