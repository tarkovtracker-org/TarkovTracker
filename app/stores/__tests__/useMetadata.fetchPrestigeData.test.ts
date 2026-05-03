import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
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
        cacheKey: 'all-json-v2',
        cacheType: 'prestige',
        endpoint: '/api/tarkov/prestige',
        promiseKey: 'prestigePromise',
        promiseRequestKey: 'en',
      })
    );
  });
});
