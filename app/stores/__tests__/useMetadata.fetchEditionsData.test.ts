// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import * as cacheUtils from '@/utils/tarkovCache';
import { createDeferred } from '@/utils/test-helpers';
import type { GameEdition, StoryChapter } from '@/types/tarkov';
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
describe('useMetadataStore fetchEditionsData', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ editions: {}, storyChapters: {} }));
    await store.fetchEditionsData();
    await store.ensureEditionsData();
    expect($fetch).toHaveBeenCalledTimes(1);
  });
  it('starts editions for readiness when no route has requested them', async () => {
    const store = useMetadataStore();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ editions: {}, storyChapters: {} }));
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
      current.resolve({
        editions: { latest: latestEdition },
        storyChapters: { latest: latestChapter },
      });
      await second;
      if (outcome === 'resolve') older.resolve({ editions: {}, storyChapters: {} });
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
    const fetchMock = vi.fn().mockResolvedValue({ editions: { latest } });
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
        editions: { replacement: createEdition('replacement', 2, 'Replacement') },
        storyChapters: { invalid: null },
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
      editions: Record<string, GameEdition>;
      storyChapters: Record<string, StoryChapter>;
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
      editions: {
        [refreshedEdition.id]: refreshedEdition,
      },
      storyChapters: {
        [refreshedChapter.id]: refreshedChapter,
      },
    });
    await Promise.all([firstRequest, secondRequest]);
    expect(store.editions).toEqual([refreshedEdition]);
    expect(store.storyChapters).toEqual([refreshedChapter]);
  });
});
