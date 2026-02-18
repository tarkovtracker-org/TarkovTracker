// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import * as cacheUtils from '@/utils/tarkovCache';
import type { GameEdition } from '@/types/tarkov';
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
});
