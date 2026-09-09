import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import type { TarkovPrestigeQueryResult } from '@/types/tarkov';
describe('useMetadataStore fetchPrestigeData', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });
  it('uses the versioned prestige cache key', async () => {
    const store = useMetadataStore();
    const fetchWithCacheSpy = vi.spyOn(store, 'fetchWithCache').mockResolvedValue(undefined);
    await store.fetchPrestigeData();
    expect(fetchWithCacheSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheLanguage: 'en',
        cacheKey: 'json-v3-regular',
        cacheType: 'prestige',
        endpoint: '/api/tarkov/prestige',
        promiseKey: 'prestigePromise',
        promiseRequestKey: 'regular-en',
      })
    );
  });
  it.each(['mode', 'language'] as const)(
    'ignores stale prestige callbacks after the %s changes',
    async (scope) => {
      const store = useMetadataStore();
      store.prestigeLevels = [{ id: 'retained', level: 1 }];
      const fetch = vi.spyOn(store, 'fetchWithCache').mockResolvedValue();
      await store.fetchPrestigeData();
      const config = fetch.mock.calls[0]![0];
      if (scope === 'mode') store.currentGameMode = 'pve';
      else store.languageCode = 'de';
      config.processData({ prestige: [] });
      config.onEmpty?.();
      expect(store.prestigeLevels).toEqual([{ id: 'retained', level: 1 }]);
    }
  );
  it('clears prestige after an empty response in the active scope', async () => {
    const store = useMetadataStore();
    store.prestigeLevels = [{ id: 'old', level: 1 }];
    const fetch = vi.spyOn(store, 'fetchWithCache').mockResolvedValue();
    await store.fetchPrestigeData();
    fetch.mock.calls[0]![0].onEmpty?.();
    expect(store.prestigeLevels).toEqual([]);
  });
  it('hydrates prestige item conditions from cached items', async () => {
    const store = useMetadataStore();
    const fetchWithCacheSpy = vi.spyOn(store, 'fetchWithCache').mockResolvedValue(undefined);
    store.items = [
      {
        id: 'item1',
        name: 'Salewa',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Salewa_first_aid_kit',
      },
    ];
    store.rebuildItemsIndex();
    await store.fetchPrestigeData();
    const config = fetchWithCacheSpy.mock.calls[0]?.[0] as
      | {
          processData?: (data: TarkovPrestigeQueryResult) => void;
        }
      | undefined;
    config?.processData?.({
      prestige: [
        {
          id: 'prestige1',
          level: 1,
          prestigeLevel: 1,
          conditions: [
            {
              type: 'haveItem',
              id: 'objective1',
              items: [{ id: 'item1' }],
            },
          ],
        },
      ],
    });
    expect(store.prestigeLevels[0]?.conditions?.[0]?.items?.[0]).toMatchObject({
      id: 'item1',
      name: 'Salewa',
      wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Salewa_first_aid_kit',
    });
  });
});
