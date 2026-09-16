// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import * as cacheUtils from '@/utils/tarkovCache';
import { createDeferred } from '@/utils/test-helpers';
import type { GameEdition, StoryChapter } from '@/types/tarkov';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const edition = (id: string): GameEdition => ({
  id,
  value: 1,
  title: id,
  defaultStashLevel: 1,
  defaultCultistCircleLevel: 0,
  traderRepBonus: {},
});
const chapter = (id: string): StoryChapter => ({
  id,
  name: id,
  normalizedName: id,
  objectives: {},
  order: 1,
  wikiLink: `https://example.com/${id}`,
});
const catalogResponse = (chapterId: string) => ({
  data: { editions: [edition('standard')], storyChapters: [chapter(chapterId)] },
});
const chapterIds = (store: ReturnType<typeof useMetadataStore>): string[] =>
  store.storyChapters.map((loaded) => loaded.id);
/**
 * `storyChaptersGameMode` records the mode each loaded chapter catalog was fetched for.
 * `currentGameMode` flips when a mode switch *starts*, before the new catalog replaces the old
 * one, so deriving the label from it would attribute the previous mode's chapters to the new mode
 * and reconcile saved progress against the wrong definitions. Only the metadata store establishes
 * this label, so without these tests a regression to `currentGameMode` passes the whole suite:
 * every consumer test supplies `storyChaptersGameMode` as a fixture.
 */
describe('useMetadataStore story chapter catalog ownership', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue(null);
    vi.spyOn(cacheUtils, 'setCachedData').mockResolvedValue();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('labels a fetched catalog with the mode it was requested for', async () => {
    const store = useMetadataStore();
    store.currentGameMode = 'pve';
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(catalogResponse('pve-chapter')));
    await store.fetchEditionsData(true);
    expect(chapterIds(store)).toEqual(['pve-chapter']);
    expect(store.storyChaptersGameMode).toBe('pve');
  });
  it('labels a Seasonal catalog seasonal even though upstream names it pvp-season', async () => {
    const store = useMetadataStore();
    store.currentGameMode = 'seasonal';
    const fetch = vi.fn().mockResolvedValue(catalogResponse('seasonal-chapter'));
    vi.stubGlobal('$fetch', fetch);
    await store.fetchEditionsData(true);
    expect(fetch).toHaveBeenCalledWith(
      '/api/tarkov/editions',
      expect.objectContaining({ query: expect.objectContaining({ gameMode: 'pvp-season' }) })
    );
    // The internal mode stays `seasonal`; the upstream name never leaks into stored state.
    expect(store.storyChaptersGameMode).toBe('seasonal');
  });
  it('keeps the previous mode on a loaded catalog when a mode switch begins', async () => {
    const store = useMetadataStore();
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(catalogResponse('pvp-chapter')));
    await store.fetchEditionsData(true);
    expect(store.storyChaptersGameMode).toBe('pvp');
    // The switch begins: currentGameMode changes while the PvP chapters are still loaded.
    store.currentGameMode = 'pve';
    expect(chapterIds(store)).toEqual(['pvp-chapter']);
    expect(store.storyChaptersGameMode).toBe('pvp');
  });
  it('never attributes a still-loaded catalog to the mode being switched to', async () => {
    const store = useMetadataStore();
    const pending = createDeferred<ReturnType<typeof catalogResponse>>();
    vi.stubGlobal(
      '$fetch',
      vi
        .fn()
        .mockResolvedValueOnce(catalogResponse('pvp-chapter'))
        .mockReturnValueOnce(pending.promise)
    );
    await store.fetchEditionsData(true);
    store.currentGameMode = 'pve';
    const switching = store.fetchEditionsData(true);
    await flushPromises();
    // Mid-switch the label is either the mode that produced the loaded chapters or cleared,
    // but it must never claim PvE while PvE chapters have not arrived.
    expect(store.storyChaptersGameMode).not.toBe('pve');
    if (store.storyChaptersGameMode !== null) {
      expect(chapterIds(store)).toEqual(['pvp-chapter']);
    }
    pending.resolve(catalogResponse('pve-chapter'));
    await switching;
    expect(chapterIds(store)).toEqual(['pve-chapter']);
    expect(store.storyChaptersGameMode).toBe('pve');
  });
  it('labels a catalog restored from cache with that cache entry mode', async () => {
    const store = useMetadataStore();
    store.currentGameMode = 'pve';
    vi.spyOn(cacheUtils, 'getCachedData').mockResolvedValue({
      editions: [edition('standard')],
      storyChapters: [chapter('cached-pve-chapter')],
    });
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('overlay offline')));
    await store.fetchEditionsData(false);
    expect(chapterIds(store)).toEqual(['cached-pve-chapter']);
    expect(store.storyChaptersGameMode).toBe('pve');
  });
  it('drops the label with the catalog when no chapters are loaded', async () => {
    const store = useMetadataStore();
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(catalogResponse('pvp-chapter')));
    await store.fetchEditionsData(true);
    expect(store.storyChaptersGameMode).toBe('pvp');
    store.$reset();
    expect(store.storyChapters).toEqual([]);
    expect(store.storyChaptersGameMode).toBeNull();
  });
});
