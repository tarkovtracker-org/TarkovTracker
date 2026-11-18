import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import * as cacheUtils from '@/utils/tarkovCache';
const loggerMock = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('@/utils/logger', () => loggerMock);
describe('useMetadataStore checkCachePurge', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  it('clears local cache when server purge is newer', async () => {
    const store = useMetadataStore();
    const clearSpy = vi.spyOn(cacheUtils, 'clearAllCache').mockResolvedValue();
    const lastPurgeAt = new Date('2025-01-01T00:00:00Z').toISOString();
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, '2024-12-31T00:00:00Z');
    const fetchMock = vi.fn().mockResolvedValue({ data: { lastPurgeAt } });
    vi.stubGlobal('$fetch', fetchMock);
    await store.checkCachePurge();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEYS.cachePurgeAt)).toBe(lastPurgeAt);
  });
  it('waits for an observed purge before reusing hydrated objectives', async () => {
    const store = useMetadataStore();
    store.tasksObjectivesHydrated = true;
    vi.spyOn(cacheUtils, 'clearAllCache').mockResolvedValue();
    vi.spyOn(store, 'fetchObjectiveModeCountDifferences').mockResolvedValue(undefined);
    const catalogFetch = vi.spyOn(store, 'fetchWithCache').mockResolvedValue();
    const response = Promise.withResolvers<{ data: { lastPurgeAt: string } }>();
    const fetchMock = vi.fn().mockReturnValueOnce(response.promise);
    vi.stubGlobal('$fetch', fetchMock);
    const check = store.checkCachePurge();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const loadingObjectives = store.fetchTaskObjectivesData();
    expect(catalogFetch).not.toHaveBeenCalled();
    const lastPurgeAt = '2025-01-03T00:00:00Z';
    response.resolve({ data: { lastPurgeAt } });
    await Promise.all([check, loadingObjectives]);
    expect(store.tasksObjectivesHydrated).toBe(false);
    expect(catalogFetch).toHaveBeenCalledWith(
      expect.objectContaining({ cacheKey: `json-v5-regular-${Date.parse(lastPurgeAt)}` })
    );
  });
  it('invalidates hydrated objectives even if writing the purge marker fails', async () => {
    const store = useMetadataStore();
    store.tasksObjectivesHydrated = true;
    store.objectiveModeCountDifferencesHydrated = true;
    const clear = vi.spyOn(cacheUtils, 'clearAllCache').mockResolvedValue();
    const catalogFetch = vi.spyOn(store, 'fetchWithCache').mockResolvedValue();
    const lastPurgeAt = '2025-01-03T00:00:00Z';
    const storage = localStorage;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.getItem(key),
      setItem: (key: string, value: string) => {
        if (key === STORAGE_KEYS.cachePurgeAt)
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        storage.setItem(key, value);
      },
    });
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ data: { lastPurgeAt } }));
    await store.checkCachePurge();
    expect(clear).toHaveBeenCalledOnce();
    expect(store.tasksObjectivesHydrated).toBe(false);
    expect(store.objectiveModeCountDifferencesHydrated).toBe(false);
    expect(storage.getItem(STORAGE_KEYS.cachePurgeAt)).toBeNull();
    await store.fetchTaskObjectivesData();
    expect(catalogFetch).toHaveBeenCalledWith(
      expect.objectContaining({ cacheKey: `json-v5-regular-${Date.parse(lastPurgeAt)}` })
    );
  });
  it('does not clear cache when server purge is older than local', async () => {
    const store = useMetadataStore();
    const clearSpy = vi.spyOn(cacheUtils, 'clearAllCache').mockResolvedValue();
    const localValue = '2025-01-02T00:00:00Z';
    const lastPurgeAt = '2025-01-01T00:00:00Z';
    localStorage.setItem(STORAGE_KEYS.cachePurgeAt, localValue);
    const fetchMock = vi.fn().mockResolvedValue({ data: { lastPurgeAt } });
    vi.stubGlobal('$fetch', fetchMock);
    await store.checkCachePurge();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.cachePurgeAt)).toBe(localValue);
  });
  it('sets local cache purge marker when missing', async () => {
    const store = useMetadataStore();
    const clearSpy = vi.spyOn(cacheUtils, 'clearAllCache').mockResolvedValue();
    const lastPurgeAt = '2025-01-03T00:00:00Z';
    const fetchMock = vi.fn().mockResolvedValue({ data: { lastPurgeAt } });
    vi.stubGlobal('$fetch', fetchMock);
    await store.checkCachePurge();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEYS.cachePurgeAt)).toBe(lastPurgeAt);
  });
  it('handles fetch errors without mutating local storage', async () => {
    const store = useMetadataStore();
    const clearSpy = vi.spyOn(cacheUtils, 'clearAllCache').mockResolvedValue();
    const fetchMock = vi.fn().mockRejectedValue(new Error('network failure'));
    vi.stubGlobal('$fetch', fetchMock);
    await expect(store.checkCachePurge()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(loggerMock.logger.warn).toHaveBeenCalledWith(
      '[MetadataStore] Failed to check cache purge status:',
      expect.any(Error)
    );
    expect(localStorage.getItem(STORAGE_KEYS.cachePurgeAt)).toBeNull();
  });
  it('skips repeated cache-meta requests within the TTL', async () => {
    const store = useMetadataStore();
    const fetchMock = vi.fn().mockResolvedValue({ data: { lastPurgeAt: null } });
    vi.stubGlobal('$fetch', fetchMock);
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await store.checkCachePurge();
    await store.checkCachePurge();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
