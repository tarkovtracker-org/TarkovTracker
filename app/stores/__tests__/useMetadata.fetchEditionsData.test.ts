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
    const secondRequest = store.fetchEditionsData(false);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
