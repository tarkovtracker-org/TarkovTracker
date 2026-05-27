// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import * as cacheUtils from '@/utils/tarkovCache';
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
describe('useMetadataStore initialize', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('keeps initialized false when critical initialization fails without cache', async () => {
    const store = useMetadataStore();
    vi.spyOn(store, 'loadStaticMapData').mockResolvedValue(undefined);
    vi.spyOn(store, 'loadCriticalCacheData').mockResolvedValue(null);
    vi.spyOn(store, 'fetchAllData').mockRejectedValue(new Error('network down'));
    await expect(store.initialize()).rejects.toThrow('network down');
    expect(store.initialized).toBe(false);
    expect(store.initializationFailed).toBe(true);
  });
  it('rethrows critical task core fetch errors', async () => {
    const store = useMetadataStore();
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('task core offline')));
    await expect(store.fetchTasksCoreData(true)).rejects.toThrow('task core offline');
    expect(store.error).toBeInstanceOf(Error);
  });
  it('processes successful promise-keyed task core fetches', async () => {
    const store = useMetadataStore();
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({
        data: {
          maps: [],
          tasks: [{ id: 'task-1', name: 'Task One' }],
          traders: [],
        },
      })
    );
    await store.fetchTasksCoreData(true);
    expect(store.tasks).toHaveLength(1);
    expect(store.loading).toBe(false);
  });
  it('deduplicates concurrent task core fetches using the same promiseKey', async () => {
    const store = useMetadataStore();
    const fetchMock = vi.fn().mockResolvedValue({
      data: {
        maps: [],
        tasks: [{ id: 'task-1', name: 'Task One' }],
        traders: [],
      },
    });
    vi.stubGlobal('$fetch', fetchMock);
    // Trigger two concurrent fetches without forceRefresh
    await Promise.all([store.fetchTasksCoreData(false), store.fetchTasksCoreData(false)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.tasks).toHaveLength(1);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });
  it('keeps initialization failed when hideout fetch fails', async () => {
    const store = useMetadataStore();
    vi.spyOn(store, 'updateLanguageAndGameMode').mockImplementation(() => undefined);
    vi.spyOn(store, 'loadStaticMapData').mockResolvedValue(undefined);
    vi.spyOn(store, 'loadCriticalCacheData').mockResolvedValue(null);
    vi.spyOn(store, 'fetchBootstrapData').mockResolvedValue(undefined);
    vi.spyOn(store, 'fetchTasksCoreData').mockImplementation(async () => {
      store.tasks = [
        {
          id: 'task-1',
          name: 'Task One',
        } as never,
      ];
    });
    vi.spyOn(store, 'fetchHideoutData').mockImplementation(async () => {
      store.hideoutError = new Error('hideout unavailable');
      throw store.hideoutError;
    });
    vi.spyOn(store, 'fetchItemsLiteData').mockResolvedValue(undefined);
    vi.spyOn(store, 'fetchTaskObjectivesData').mockResolvedValue(undefined);
    vi.spyOn(store, 'fetchTaskRewardsData').mockResolvedValue(undefined);
    vi.spyOn(store, 'fetchPrestigeData').mockResolvedValue(undefined);
    vi.spyOn(store, 'fetchEditionsData').mockResolvedValue(undefined);
    await expect(store.initialize()).rejects.toThrow('hideout unavailable');
    expect(store.initialized).toBe(false);
    expect(store.initializationFailed).toBe(true);
    expect(store.hideoutError).toBeInstanceOf(Error);
  });
  it('clears stale critical errors when cached recovery succeeds', () => {
    const store = useMetadataStore();
    store.error = new Error('tasks unavailable');
    store.hideoutError = new Error('hideout unavailable');
    vi.spyOn(store, 'processTasksCoreData').mockImplementation(() => undefined);
    vi.spyOn(store, 'processHideoutData').mockImplementation(() => undefined);
    vi.spyOn(store, 'hydrateHideoutItems').mockImplementation(() => undefined);
    store.applyCriticalCachedData({
      editions: {
        editions: [],
        storyChapters: [],
      },
      hideout: {
        hideoutStations: [],
      },
      prestige: {
        prestige: [],
      },
      tasksCore: {
        maps: [],
        tasks: [],
        traders: [],
      },
    });
    expect(store.error).toBeNull();
    expect(store.hideoutError).toBeNull();
  });
});
