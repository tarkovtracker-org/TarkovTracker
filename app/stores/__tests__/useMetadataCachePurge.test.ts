import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import * as cacheUtils from '@/utils/tarkovCache';
describe('useMetadataStore checkCachePurge', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
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
