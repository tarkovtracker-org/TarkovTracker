import { createPinia, defineStore, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/utils/logger';
import { clearStaleState, resetStore, safePatchStore } from '@/utils/storeHelpers';
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
const useFixtureStore = defineStore('helpers-fixture', {
  state: () => ({ name: 'Player', count: 4, enabled: true, details: { level: 20 } }),
});
describe('store synchronization helpers', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('clears absent fields but preserves fields explicitly present with falsy values', () => {
    const store = useFixtureStore();
    clearStaleState(store, { count: 0, enabled: false, details: null });
    expect(store.$state).toEqual({
      name: undefined,
      count: 4,
      enabled: true,
      details: { level: 20 },
    });
    safePatchStore(store, { count: 0, enabled: false });
    expect(store.count).toBe(0);
    expect(store.enabled).toBe(false);
  });
  it('does not patch when the incoming document owns every existing field', () => {
    const store = useFixtureStore();
    const patch = vi.spyOn(store, '$patch');
    clearStaleState(store, { ...store.$state });
    expect(patch).not.toHaveBeenCalled();
  });
  it('does not retain stale fields inherited from the incoming object prototype', () => {
    const store = useFixtureStore();
    clearStaleState(store, Object.create({ name: 'Other' }));
    expect(Object.values(store.$state)).toEqual([undefined, undefined, undefined, undefined]);
  });
  it.each(['missing', 'reset'] as const)(
    'clears the entire state for %s documents',
    (operation) => {
      const store = useFixtureStore();
      if (operation === 'reset') resetStore(store);
      else clearStaleState(store);
      expect(Object.values(store.$state)).toEqual([undefined, undefined, undefined, undefined]);
    }
  );
  it('logs patch failures without interrupting the synchronization caller', () => {
    const store = useFixtureStore();
    const error = new Error('store disposed');
    vi.spyOn(store, '$patch').mockImplementation(() => {
      throw error;
    });
    expect(() => safePatchStore(store, { name: 'Next' })).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith('[StoreHelpers] Error patching store:', error);
    expect(() => clearStaleState(store, {})).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith('[StoreHelpers] Error clearing stale state:', error);
  });
  it.each([null, undefined, false, 'invalid'])('ignores invalid incoming patch %s', (data) => {
    const store = useFixtureStore();
    const patch = vi.spyOn(store, '$patch');
    safePatchStore(store, data as never);
    expect(patch).not.toHaveBeenCalled();
    expect(store.name).toBe('Player');
  });
});
