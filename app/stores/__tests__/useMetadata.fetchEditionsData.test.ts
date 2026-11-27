// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPromiseStore } from '@/stores/tarkov/promiseStore';
import { useMetadataStore } from '@/stores/useMetadata';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import * as cacheUtils from '@/utils/tarkovCache';
import { createDeferred } from '@/utils/test-helpers';
import type { GameEdition, SeasonalPerk, StoryChapter } from '@/types/tarkov';
const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));
const createEdition = (id: string, value: number, title: string): GameEdition => ({
  id,
  value,
  title,
  defaultStashLevel: 1,
  defaultCultistCircleLevel: 0,
  traderRepBonus: {},
});
const createStoryChapter = (id: string, order: number, name: string): StoryChapter => ({
  id,
  name,
  normalizedName: name.toLowerCase(),
  objectives: {},
  order,
  wikiLink: `https://example.com/${id}`,
});
const createSeasonalPerk = (id: string, name: string): SeasonalPerk => ({
  id,
  type: 'perk',
  name,
  description: '',
  points: 0,
  mutuallyExclusiveSeasonalPerkIds: [],
  effects: [],
});
describe('useMetadataStore fetchEditionsData', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  it.each(['success', 'failure'] as const)(
    'retries an editions response crossing an observed purge and preserves last-good on %s',
    async (outcome) => {
      const store = useMetadataStore();
      const kept = createEdition('kept', 1, 'Last good');
      const current = createEdition('current', 2, 'Current');
      store.editions = [kept];
      const old = createDeferred<object>();
      const retry = createDeferred<object>();
      const write = vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
      vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
      vi.spyOn(cacheUtils, 'clearAllCache').mockResolvedValue();
      const editions = vi.fn().mockReturnValueOnce(old.promise).mockReturnValue(retry.promise);
      vi.stubGlobal(
        '$fetch',
        vi.fn((endpoint) =>
          endpoint === '/api/tarkov/cache-meta'
            ? Promise.resolve({ data: { lastPurgeAt: '2026-11-18T13:00:00Z' } })
            : editions()
        )
      );
      const request = store.fetchEditionsData();
      await vi.waitFor(() => expect(editions).toHaveBeenCalledOnce());
      await store.checkCachePurge();
      old.resolve({
        data: { editions: [createEdition('obsolete', 3, 'Obsolete')], storyChapters: [] },
      });
      await vi.waitFor(() => expect(editions).toHaveBeenCalledTimes(2));
      expect(store.editions).toEqual([kept]);
      expect(write).not.toHaveBeenCalled();
      if (outcome === 'success')
        retry.resolve({ data: { editions: [current], storyChapters: [] } });
      else retry.reject(new Error('Fresh generation unavailable'));
      await request;
      expect(store.editions).toEqual([outcome === 'success' ? current : kept]);
      expect(write).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 0);
      expect(store.hasRevalidatedCatalog('regular-en')).toBe(outcome === 'success');
      expect(store.editionsLoading).toBe(false);
    }
  );
  it('does not retry a purged editions request after a newer request takes ownership', async () => {
    const store = useMetadataStore();
    const old = createDeferred<object>();
    const current = createEdition('current', 2, 'Current');
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    const write = vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.spyOn(cacheUtils, 'clearAllCache').mockResolvedValue();
    const editions = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ data: { editions: [current], storyChapters: [] } });
    vi.stubGlobal(
      '$fetch',
      vi.fn((endpoint) =>
        endpoint === '/api/tarkov/cache-meta'
          ? Promise.resolve({ data: { lastPurgeAt: '2026-11-18T13:00:00Z' } })
          : editions()
      )
    );
    const first = store.fetchEditionsData();
    await vi.waitFor(() => expect(editions).toHaveBeenCalledOnce());
    await store.checkCachePurge();
    await store.fetchEditionsData(true);
    old.resolve({ data: { editions: [], storyChapters: [] } });
    await first;
    expect(editions).toHaveBeenCalledTimes(2);
    expect(store.editions).toEqual([current]);
    expect(write).toHaveBeenCalledTimes(1);
    expect(store.editionsError).toBeNull();
  });
  it('bounds editions retries when both responses cross a purge generation', async () => {
    const store = useMetadataStore();
    const kept = createEdition('kept', 1, 'Last good');
    store.editions = [kept];
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    const write = vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const editions = vi.fn(async () => {
      localStorage.setItem(
        STORAGE_KEYS.cachePurgeAt,
        `2026-11-18T13:00:0${editions.mock.calls.length}Z`
      );
      return { data: { editions: [], storyChapters: [] } };
    });
    vi.stubGlobal('$fetch', editions);
    await store.fetchEditionsData();
    expect(editions).toHaveBeenCalledTimes(2);
    expect(store.editions).toEqual([kept]);
    expect(write).not.toHaveBeenCalled();
    expect(store.hasRevalidatedCatalog('regular-en')).toBe(false);
    expect(store.editionsLoading).toBe(false);
  });
  it('rejects an editions cache read completed after a newer purge', async () => {
    const store = useMetadataStore();
    const cached = createDeferred<object>();
    const current = createEdition('current', 2, 'Current');
    vi.spyOn(cacheUtils, 'getCachedData').mockReturnValue(cached.promise);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.spyOn(cacheUtils, 'clearAllCache').mockResolvedValue();
    const network = createDeferred<object>();
    vi.stubGlobal(
      '$fetch',
      vi.fn((endpoint) =>
        endpoint === '/api/tarkov/cache-meta'
          ? Promise.resolve({ data: { lastPurgeAt: '2026-11-18T13:00:00Z' } })
          : network.promise
      )
    );
    const request = store.fetchEditionsData();
    await vi.waitFor(() => expect(cacheUtils.getCachedData).toHaveBeenCalledOnce());
    await store.checkCachePurge();
    cached.resolve({
      editions: [createEdition('obsolete', 1, 'Obsolete')],
      storyChapters: [createStoryChapter('obsolete', 1, 'Obsolete')],
    });
    await flushPromises();
    expect(store.editions).toEqual([]);
    expect(store.storyChapters).toEqual([]);
    network.resolve({ data: { editions: [current], storyChapters: [] } });
    await request;
    expect(store.editions).toEqual([current]);
    expect(store.hasRevalidatedCatalog('regular-en')).toBe(true);
  });
  it.each(['en', 'de'])(
    'keeps newer IndexedDB editions when the %s language catalog expired in memory',
    async (language) => {
      vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const old = {
        editions: [createEdition('old', 1, 'Old edition')],
        storyChapters: [createStoryChapter('old', 1, 'Old chapter')],
      };
      const current = {
        editions: [createEdition('current', 1, 'Current edition')],
        storyChapters: [createStoryChapter('current', 1, 'Current chapter')],
      };
      vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
      const read = vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
      vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ data: old }));
      const store = useMetadataStore();
      await store.fetchEditionsData(true);
      expect(store.editions[0]?.id).toBe('old');
      vi.mocked(Date.now).mockReturnValue(3_602_000);
      store.languageCode = language;
      read.mockImplementation(
        async (type) =>
          ({
            'tasks-core': { tasks: [{ id: 'task', name: 'Task' }], maps: [], traders: [] },
            hideout: { hideoutStations: [{ id: 'station', name: 'Station', levels: [] }] },
            prestige: { prestige: [] },
            editions: current,
          })[type as 'editions'] as never
      );
      const cached = await store.loadCriticalCacheData();
      expect(read).toHaveBeenCalledWith('tasks-core', 'neutral-v2-regular', 'en');
      for (const type of ['hideout', 'prestige', 'editions'])
        expect(read).toHaveBeenCalledWith(type, 'neutral-v1-regular', 'en');
      expect(cached?.editions.editions?.[0]?.id).toBe('current');
      expect(cached).not.toBeNull();
      store.applyCriticalCachedData(cached!);
      expect(store.editions[0]?.id).toBe('current');
      expect(store.storyChapters[0]?.id).toBe('current');
    }
  );
  it('clears stale Seasonal perks when an edition response omits them', async () => {
    const store = useMetadataStore();
    store.currentGameMode = 'seasonal';
    store.seasonalPerks = [
      {
        id: 'stale',
        type: 'perk',
        name: 'Stale',
        description: '',
        points: 0,
        mutuallyExclusiveSeasonalPerkIds: [],
        effects: [],
      },
    ];
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({ data: { editions: [], storyChapters: [] } })
    );
    await store.fetchEditionsData(true);
    expect(store.editionsError).toBeNull();
    expect(store.seasonalPerks).toEqual([]);
    expect($fetch).toHaveBeenCalledWith(
      '/api/tarkov/editions',
      expect.objectContaining({ query: expect.objectContaining({ gameMode: 'pvp-season' }) })
    );
  });
  it('joins an in-flight editions request for the same scope', async () => {
    const store = useMetadataStore();
    const response = createDeferred<object>();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.stubGlobal('$fetch', vi.fn().mockReturnValue(response.promise));
    const first = store.fetchEditionsData();
    await flushPromises();
    const joined = store.fetchEditionsData();
    response.resolve({ data: { editions: [], storyChapters: [] } });
    await Promise.all([first, joined]);
    expect($fetch).toHaveBeenCalledTimes(1);
    expect(store.editionsLoading).toBe(false);
  });
  it('continues to the network when the editions cache cannot be read', async () => {
    const store = useMetadataStore();
    vi.spyOn(cacheUtils, 'getCachedData').mockRejectedValue(new Error('Cache unavailable'));
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({ data: { editions: [], storyChapters: [] } })
    );
    await store.fetchEditionsData();
    expect($fetch).toHaveBeenCalledTimes(1);
    expect(store.editionsError).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[MetadataStore] Editions cache read failed:',
      expect.any(Error)
    );
  });
  it('keeps the fetched catalog usable when its cache write fails', async () => {
    const store = useMetadataStore();
    const edition = createEdition('standard', 1, 'Standard');
    const error = new Error('Storage quota exceeded');
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockRejectedValue(error);
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({
        data: { editions: [edition], storyChapters: [] },
      })
    );
    await store.fetchEditionsData(true);
    await flushPromises();
    expect(store.editions).toEqual([edition]);
    expect(store.editionsError).toBeNull();
    expect(store.editionsLoading).toBe(false);
    expect(loggerMock.error).toHaveBeenCalledWith('[MetadataStore] Error caching editions:', error);
  });
  it('caches a structured-cloneable editions payload in a persistent mode', async () => {
    const store = useMetadataStore();
    const setCachedDataMock = vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({
        data: { editions: [createEdition('standard', 1, 'Standard')], storyChapters: [] },
      })
    );
    await store.fetchEditionsData(true);
    expect(setCachedDataMock).toHaveBeenCalledTimes(1);
    const payload = setCachedDataMock.mock.calls.at(-1)?.[3];
    expect(payload).toEqual({
      editions: [createEdition('standard', 1, 'Standard')],
      storyChapters: [],
    });
    // IndexedDB stores values with the structured clone algorithm, which throws
    // DataCloneError on a Vue reactive proxy. Reaching the cache with reactive
    // state silently disables the editions cache for every visit. The payload is
    // asserted first because structuredClone(undefined) would pass vacuously.
    expect(() => structuredClone(payload)).not.toThrow();
  });
  it('caches a structured-cloneable editions payload in Seasonal', async () => {
    const store = useMetadataStore();
    store.currentGameMode = 'seasonal';
    const setCachedDataMock = vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({
        data: {
          editions: [createEdition('standard', 1, 'Standard')],
          storyChapters: [],
          seasonalPerks: [createSeasonalPerk('perk-1', 'Perk One')],
        },
      })
    );
    await store.fetchEditionsData(true);
    expect(store.seasonalPerks).toEqual([createSeasonalPerk('perk-1', 'Perk One')]);
    expect(setCachedDataMock).toHaveBeenCalledTimes(1);
    const payload = setCachedDataMock.mock.calls.at(-1)?.[3];
    expect(payload).toEqual({
      editions: [createEdition('standard', 1, 'Standard')],
      storyChapters: [],
      seasonalPerks: [createSeasonalPerk('perk-1', 'Perk One')],
    });
    expect(() => structuredClone(payload)).not.toThrow();
  });
  it('keeps cached editions when story chapters cache is missing and overlay fetch fails', async () => {
    const store = useMetadataStore();
    const cachedEdition = createEdition('cached-edition', 1, 'Cached Edition');
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue({
      editions: [cachedEdition],
    });
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('overlay offline')));
    await store.fetchEditionsData(false);
    expect(store.editions).toEqual([cachedEdition]);
    expect(store.storyChapters).toEqual([]);
    expect(store.editionsError).toBeInstanceOf(Error);
  });
  it('preserves the last-good catalog on malformed edition records', async () => {
    const store = useMetadataStore();
    const existing = createEdition('existing', 1, 'Existing');
    store.editions = [existing];
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({ data: { editions: [{ id: 'broken' }], storyChapters: [] } })
    );
    await store.fetchEditionsData(true);
    expect(store.editions).toEqual([existing]);
    expect(store.editionsError).toBeInstanceOf(Error);
  });
  it('preserves already-loaded editions when overlay fetch fails', async () => {
    const store = useMetadataStore();
    const existingEdition = createEdition('existing-edition', 2, 'Existing Edition');
    store.editions = [existingEdition];
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('overlay offline')));
    await store.fetchEditionsData(false);
    expect(store.editions).toEqual([existingEdition]);
    expect(store.editionsError).toBeInstanceOf(Error);
  });
  it('preserves loaded eligibility when an empty cached fallback and the network fail', async () => {
    const store = useMetadataStore();
    const existing = createEdition('existing', 2, 'Existing');
    store.editions = [existing];
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue({ editions: [] });
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await store.fetchEditionsData();
    expect(store.editions).toEqual([existing]);
    expect(store.editionsError).toBeInstanceOf(Error);
  });
  it('reuses settled editions for readiness after an active core refresh loaded them', async () => {
    const store = useMetadataStore();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({ data: { editions: [], storyChapters: [] } })
    );
    await store.fetchEditionsData();
    await store.ensureEditionsData();
    expect($fetch).toHaveBeenCalledTimes(1);
  });
  it('starts editions for readiness when no route has requested them', async () => {
    const store = useMetadataStore();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({ data: { editions: [], storyChapters: [] } })
    );
    await store.ensureEditionsData();
    expect($fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retry a settled failure for readiness but retains explicit refreshes', async () => {
    const store = useMetadataStore();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await store.fetchEditionsData();
    await store.ensureEditionsData();
    expect($fetch).toHaveBeenCalledTimes(1);
    await store.fetchEditionsData(true);
    expect($fetch).toHaveBeenCalledTimes(2);
  });
  it('keeps loading until the latest forced request settles', async () => {
    const store = useMetadataStore();
    const older = createDeferred<object>();
    const current = createDeferred<object>();
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(current.promise)
    );
    const first = store.fetchEditionsData(true);
    await flushPromises();
    const second = store.fetchEditionsData(true);
    older.resolve({});
    await first;
    expect(store.editionsLoading).toBe(true);
    current.resolve({});
    await second;
    expect(store.editionsLoading).toBe(false);
  });
  it.each(['resolve', 'reject'] as const)(
    'ignores obsolete forced responses (%s)',
    async (outcome) => {
      const store = useMetadataStore();
      const older = createDeferred<object>();
      const current = createDeferred<object>();
      const latestEdition = createEdition('latest', 3, 'Latest');
      const latestChapter = createStoryChapter('latest-chapter', 3, 'Latest Chapter');
      const cacheWrite = vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
      vi.stubGlobal(
        '$fetch',
        vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(current.promise)
      );
      const first = store.fetchEditionsData(true);
      await flushPromises();
      const second = store.fetchEditionsData(true);
      current.resolve({ data: { editions: [latestEdition], storyChapters: [latestChapter] } });
      await second;
      if (outcome === 'resolve') older.resolve({ data: { editions: [], storyChapters: [] } });
      else older.reject(new Error('obsolete failure'));
      await first;
      expect(store.editions).toEqual([latestEdition]);
      expect(store.storyChapters).toEqual([latestChapter]);
      expect(store.editionsError).toBeNull();
      expect(store.editionsLoading).toBe(false);
      expect(cacheWrite).toHaveBeenCalledTimes(1);
    }
  );
  it('ignores a cache read superseded by a forced refresh', async () => {
    const store = useMetadataStore();
    const cache = createDeferred<{ editions: GameEdition[]; storyChapters: StoryChapter[] }>();
    const latest = createEdition('latest', 3, 'Latest');
    vi.spyOn(cacheUtils, 'getCachedData').mockReturnValue(cache.promise);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ data: { editions: [latest], storyChapters: [] } });
    vi.stubGlobal('$fetch', fetchMock);
    const older = store.fetchEditionsData();
    await flushPromises();
    await store.fetchEditionsData(true);
    cache.resolve({
      editions: [createEdition('old', 1, 'Old')],
      storyChapters: [createStoryChapter('old', 1, 'Old')],
    });
    await older;
    expect(store.editions).toEqual([latest]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps cached eligibility when malformed chapters and the network both fail', async () => {
    const store = useMetadataStore();
    const cached = createEdition('cached', 1, 'Cached');
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue({
      editions: [cached],
      storyChapters: [null],
    });
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await store.fetchEditionsData();
    expect(store.editions).toEqual([cached]);
    expect(store.editionsError).toBeInstanceOf(Error);
  });
  it('preserves eligibility and chapters when the response cannot be normalized', async () => {
    const store = useMetadataStore();
    const existing = createEdition('existing', 1, 'Existing');
    const chapter = createStoryChapter('existing', 1, 'Existing');
    store.editions = [existing];
    store.storyChapters = [chapter];
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({
        data: { editions: [createEdition('replacement', 2, 'Replacement')], storyChapters: [null] },
      })
    );
    await store.fetchEditionsData(true);
    expect(store.editions).toEqual([existing]);
    expect(store.storyChapters).toEqual([chapter]);
    expect(store.editionsError).toBeInstanceOf(TypeError);
  });
  it('records synchronous network failures after request registration', async () => {
    const store = useMetadataStore();
    const error = new Error('synchronous failure');
    vi.stubGlobal(
      '$fetch',
      vi.fn(() => {
        throw error;
      })
    );
    await store.fetchEditionsData(true);
    expect(store.editionsError).toBe(error);
    expect(store.editionsLoading).toBe(false);
  });
  it('reuses the in-flight background editions revalidation while serving cached data', async () => {
    const store = useMetadataStore();
    const cachedEdition = createEdition('cached-edition', 1, 'Cached Edition');
    const cachedChapter = createStoryChapter('cached-chapter', 1, 'Cached Chapter');
    const refreshedEdition = createEdition('refreshed-edition', 2, 'Refreshed Edition');
    const refreshedChapter = createStoryChapter('refreshed-chapter', 2, 'Refreshed Chapter');
    const overlayResponse = createDeferred<{
      data: { editions: GameEdition[]; storyChapters: StoryChapter[] };
    }>();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue({
      editions: [cachedEdition],
      storyChapters: [cachedChapter],
    });
    const fetchMock = vi.fn().mockImplementation(() => overlayResponse.promise);
    vi.stubGlobal('$fetch', fetchMock);
    const firstRequest = store.fetchEditionsData(false);
    await firstRequest;
    expect(store.editionsLoading).toBe(true);
    let secondSettled = false;
    const secondRequest = store.ensureEditionsData();
    void secondRequest.then(() => {
      secondSettled = true;
    });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondSettled).toBe(false);
    overlayResponse.resolve({
      data: { editions: [refreshedEdition], storyChapters: [refreshedChapter] },
    });
    await Promise.all([firstRequest, secondRequest]);
    expect(store.editions).toEqual([refreshedEdition]);
    expect(store.storyChapters).toEqual([refreshedChapter]);
  });
  it('shares a fresh neutral catalog across language scopes', async () => {
    const store = useMetadataStore();
    store.currentGameMode = 'pve';
    store.languageCode = 'de';
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue({
      editions: [createEdition('cached-edition', 1, 'Cached Edition')],
      storyChapters: [createStoryChapter('cached-chapter', 1, 'Cached Chapter')],
    });
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const fetchMock = vi.fn().mockResolvedValue({
      data: {
        editions: [createEdition('fresh-edition', 2, 'Fresh Edition')],
        storyChapters: [createStoryChapter('fresh-chapter', 2, 'Fresh Chapter')],
      },
    });
    vi.stubGlobal('$fetch', fetchMock);
    await store.fetchEditionsData();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/tarkov/editions', {
      query: { gameMode: 'pve' },
    });
    await store.ensureEditionsData();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A language change reuses the already verified neutral mode catalog.
    store.languageCode = 'en';
    await store.fetchEditionsData();
    await flushPromises();
    store.languageCode = 'de';
    await store.fetchEditionsData();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/tarkov/editions', {
      query: { gameMode: 'pve' },
    });
    expect(store.editions[0]?.id).toBe('fresh-edition');
    expect(store.storyChapters[0]?.id).toBe('fresh-chapter');
  });
  it('requests and caches the current mode/language catalog', async () => {
    const store = useMetadataStore();
    store.currentGameMode = 'pve';
    store.languageCode = 'de';
    const cacheWrite = vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const chapter = createStoryChapter('mode-only', 1, 'PvE chapter');
    const fetch = vi.fn().mockResolvedValue({ data: { editions: [], storyChapters: [chapter] } });
    vi.stubGlobal('$fetch', fetch);
    await store.fetchEditionsData(true);
    expect(store.storyChapters).toEqual([chapter]);
    expect(fetch).toHaveBeenCalledWith('/api/tarkov/editions', {
      query: { gameMode: 'pve', cacheBust: '1' },
    });
    expect(cacheWrite).toHaveBeenCalledWith(
      'editions',
      'neutral-v1-pve',
      'en',
      expect.any(Object),
      expect.any(Number),
      expect.any(Function)
    );
  });
  it('retries a mode whose obsolete request settled after switching away', async () => {
    const store = useMetadataStore();
    const pending = createDeferred<object>();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ data: { editions: [], storyChapters: [] } });
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.stubGlobal('$fetch', fetch);
    const request = store.fetchEditionsData(true);
    await flushPromises();
    store.currentGameMode = 'pve';
    pending.resolve({ data: { editions: [], storyChapters: [] } });
    await request;
    store.currentGameMode = 'pvp';
    await store.ensureEditionsData();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('reloads A after switching from loaded A to pending B and back to A', async () => {
    const store = useMetadataStore();
    const pending = createDeferred<object>();
    const edition = createEdition('a', 1, 'A');
    const response = { data: { editions: [edition], storyChapters: [] } };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(response);
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.stubGlobal('$fetch', fetch);
    await store.fetchEditionsData(true);
    store.currentGameMode = 'pve';
    const other = store.fetchEditionsData(true);
    await flushPromises();
    store.currentGameMode = 'pvp';
    await store.ensureEditionsData();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(store.editions).toEqual([edition]);
    pending.resolve({ data: { editions: [], storyChapters: [] } });
    await other;
    expect(store.editions).toEqual([edition]);
  });
  it('marks a cached scope revalidated only after a successful live response', async () => {
    const store = useMetadataStore();
    const response = createDeferred<object>();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue({
      editions: [createEdition('cached', 1, 'Cached')],
      storyChapters: [createStoryChapter('cached', 1, 'Cached')],
    });
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.stubGlobal('$fetch', vi.fn().mockReturnValue(response.promise));
    await store.fetchEditionsData();
    expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(false);
    response.resolve({ data: { editions: [], storyChapters: [] } });
    await store.ensureEditionsData();
    expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(true);
  });
  it('retries aborted cached revalidation and preserves a newer successful mark', async () => {
    const store = useMetadataStore();
    const controller = new AbortController();
    const obsolete = createDeferred<object>();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue({
      editions: [createEdition('cached', 1, 'Cached')],
      storyChapters: [createStoryChapter('cached', 1, 'Cached')],
    });
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(obsolete.promise)
      .mockResolvedValue({ data: { editions: [], storyChapters: [] } });
    vi.stubGlobal('$fetch', fetch);
    await store.fetchEditionsData(false, { signal: controller.signal });
    controller.abort();
    store.languageCode = 'de';
    await store.fetchEditionsData();
    await flushPromises();
    store.languageCode = 'en';
    await store.fetchEditionsData();
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(true);
    obsolete.resolve({ data: { editions: [], storyChapters: [] } });
    await flushPromises();
    expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(true);
    await store.fetchEditionsData();
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(store.editionsError).toBeNull();
  });
  it('joins overlapping live revalidations for the same scope', async () => {
    const store = useMetadataStore();
    const response = createDeferred<object>();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const fetch = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal('$fetch', fetch);
    const first = store.fetchEditionsData(false, { revalidate: true });
    let firstSettled = false;
    void first.then(() => {
      firstSettled = true;
    });
    const second = store.fetchEditionsData(false, { revalidate: true });
    await flushPromises();
    expect(firstSettled).toBe(false);
    response.resolve({ data: { editions: [], storyChapters: [] } });
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not record a failed background revalidation as successful', async () => {
    const store = useMetadataStore();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue({
      editions: [createEdition('cached', 1, 'Cached')],
      storyChapters: [createStoryChapter('cached', 1, 'Cached')],
    });
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('$fetch', fetch);
    await store.fetchEditionsData();
    await flushPromises();
    expect(getPromiseStore(store).editionsRevalidatedScopes.has('regular-en')).toBe(false);
    await store.ensureEditionsData();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retries readiness after an aborted request settles in the active scope', async () => {
    const store = useMetadataStore();
    const controller = new AbortController();
    const response = createDeferred<object>();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValue({ data: { editions: [], storyChapters: [] } });
    vi.stubGlobal('$fetch', fetch);
    const request = store.fetchEditionsData(false, { signal: controller.signal });
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await flushPromises();
    controller.abort();
    response.resolve({ data: { editions: [], storyChapters: [] } });
    await rejection;
    await store.ensureEditionsData();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.editionsError).toBeNull();
  });
});
