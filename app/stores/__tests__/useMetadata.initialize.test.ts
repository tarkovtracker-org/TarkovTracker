// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPromiseStore } from '@/stores/tarkov/promiseStore';
import { useMetadataStore } from '@/stores/useMetadata';
import * as cacheUtils from '@/utils/tarkovCache';
import { createDeferred } from '@/utils/test-helpers';
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
      scope: `${store.getApiGameMode()}-${store.languageCode}`,
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
const cacheBundle = (scope: string, id: string) => ({
  scope,
  tasksCore: { tasks: [{ id }], maps: [], traders: [] },
  hideout: { hideoutStations: [{ id: `hideout-${id}`, levels: [] }] },
  prestige: { prestige: [] },
  editions: { editions: [], storyChapters: [], seasonalPerks: [] },
});
describe('critical mode cache ownership', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
  });
  afterEach(() => vi.unstubAllGlobals());
  it('orders cached chapters and resolves perks only for Seasonal profiles', () => {
    const store = useMetadataStore();
    const bundle = {
      ...cacheBundle('pvp-season-en', 'seasonal'),
      editions: {
        editions: [],
        seasonalPerks: [{ id: 'perk', effects: [] }],
        storyChapters: [
          { id: 'later', name: 'Later', order: 2, objectives: {} },
          { id: 'first', name: 'First', order: 1, objectives: {} },
        ],
      },
    };
    store.currentGameMode = 'seasonal';
    expect(store.applyCriticalCachedData(bundle as never)).toBe(true);
    expect(store.storyChapters.map((chapter) => chapter.id)).toEqual(['first', 'later']);
    expect(store.resolvedSeasonalPerks).toMatchObject([{ id: 'perk', effects: [] }]);
    store.currentGameMode = 'pve';
    expect(store.resolvedSeasonalPerks).toEqual([]);
  });
  it('replaces previous-mode collections including authoritative empties', () => {
    const store = useMetadataStore();
    store.tasks = [{ id: 'pvp' }];
    store.hideoutStations = [{ id: 'pvp', levels: [] }] as never;
    store.editions = [{ id: 'old' }] as never;
    store.storyChapters = [{ id: 'old' }] as never;
    store.prestigeLevels = [{ id: 'old' }] as never;
    store.seasonalPerks = [{ id: 'old' }] as never;
    store.currentGameMode = 'pve';
    store.prestigeError = new Error('old');
    expect(store.applyCriticalCachedData(cacheBundle('pve-en', 'pve') as never)).toBe(true);
    expect(store.tasks[0]?.id).toBe('pve');
    expect(store.hideoutStations[0]?.id).toBe('hideout-pve');
    expect([
      store.editions,
      store.storyChapters,
      store.prestigeLevels,
      store.seasonalPerks,
    ]).toEqual([[], [], [], []]);
    expect(store.prestigeError).toBeNull();
  });
  it('rejects a cache read that resolves after its mode was replaced', async () => {
    const store = useMetadataStore();
    const cached = createDeferred<never>();
    vi.mocked(cacheUtils.getCachedData).mockImplementation(() => cached.promise);
    const old = store.loadCriticalCacheData();
    store.currentGameMode = 'pve';
    store.tasks = [{ id: 'pve' }];
    cached.resolve({
      tasks: [],
      hideoutStations: [],
      prestige: [],
      editions: [],
      storyChapters: [],
    } as never);
    const bundle = await old;
    expect(bundle?.scope).toBe('regular-en');
    expect(store.applyCriticalCachedData(bundle!)).toBe(false);
    expect(store.tasks[0]?.id).toBe('pve');
  });
  it('fences an old network response after another mode hydrates from cache', async () => {
    const store = useMetadataStore();
    const response = createDeferred<object>();
    vi.stubGlobal(
      '$fetch',
      vi.fn(() => response.promise)
    );
    const old = store.fetchTasksCoreData(true);
    await flushPromises();
    store.currentGameMode = 'pve';
    store.applyCriticalCachedData(cacheBundle('pve-en', 'pve') as never);
    expect(store.loading).toBe(false);
    response.resolve({ data: { tasks: [{ id: 'old-pvp' }], maps: [], traders: [] } });
    await old;
    expect(store.tasks[0]?.id).toBe('pve');
    expect(store.loading).toBe(false);
  });
  it('does not join another mode initializer or clear its newer ownership', async () => {
    const store = useMetadataStore();
    const first = createDeferred<never>();
    const second = createDeferred<never>();
    vi.spyOn(store, 'loadCriticalCacheData').mockImplementation(() =>
      store.currentGameMode === 'pvp' ? first.promise : second.promise
    );
    const fetch = vi.spyOn(store, 'fetchAllData').mockImplementation(async (_force, options) => {
      if (options?.cachedData) store.applyCriticalCachedData(options.cachedData);
    });
    const old = store.initialize({ gameMode: 'pvp' });
    await flushPromises();
    const current = store.initialize({ gameMode: 'pve' });
    await flushPromises();
    first.resolve(cacheBundle('regular-en', 'pvp') as never);
    await old;
    expect(getPromiseStore(store).isInitializing).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    second.resolve(cacheBundle('pve-en', 'pve') as never);
    await current;
    expect(store.tasks[0]?.id).toBe('pve');
    expect(getPromiseStore(store).isInitializing).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
it('does not resume an initializer superseded by a same-mode force refresh', async () => {
  setActivePinia(createPinia());
  const store = useMetadataStore();
  const oldBootstrap = createDeferred<undefined>();
  const newBootstrap = createDeferred<undefined>();
  vi.spyOn(store, 'loadCriticalCacheData').mockResolvedValue(null);
  vi.spyOn(store, 'checkCachePurge').mockResolvedValue();
  vi.spyOn(cacheUtils, 'cleanupExpiredCache').mockResolvedValue(0);
  vi.spyOn(store, 'fetchBootstrapData')
    .mockImplementationOnce(() => oldBootstrap.promise)
    .mockImplementationOnce(() => newBootstrap.promise);
  const taskFetch = vi.spyOn(store, 'fetchTasksCoreData').mockImplementation(async () => {
    store.tasks = [{ id: 'fresh' }];
  });
  vi.spyOn(store, 'fetchHideoutData').mockImplementation(async () => {
    store.hideoutStations = [{ id: 'hideout', levels: [] }] as never;
  });
  for (const key of [
    'fetchPrestigeData',
    'fetchEditionsData',
    'fetchTaskObjectivesData',
    'fetchTaskRewardsData',
    'fetchItemsLiteData',
  ] as const)
    vi.spyOn(store, key).mockResolvedValue();
  const old = store.initialize({ gameMode: 'pvp' });
  await flushPromises();
  const fresh = store.initialize({ gameMode: 'pvp', forceRefresh: true });
  await flushPromises();
  oldBootstrap.resolve(undefined);
  await old;
  expect(taskFetch).not.toHaveBeenCalled();
  expect(getPromiseStore(store).isInitializing).toBe(true);
  newBootstrap.resolve(undefined);
  await fresh;
  expect(taskFetch).toHaveBeenCalledExactlyOnceWith(true);
  expect(store.tasks[0]?.id).toBe('fresh');
});
