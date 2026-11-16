import { createPinia, setActivePinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import { usePreferencesStore } from '@/stores/usePreferences';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { serializeUserScopedStorage } from '@/utils/userScopedStorage';
const createPersistedStore = () => {
  const pinia = createPinia().use(piniaPluginPersistedstate);
  createApp({ render: () => null }).use(pinia);
  setActivePinia(pinia);
  return usePreferencesStore();
};
describe('Needed Items view preference persistence', () => {
  beforeEach(() => localStorage.clear());
  it('uses By item when the grouping preference has never been saved', () => {
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      serializeUserScopedStorage({ neededItemsViewMode: 'list', neededItemsFirFilter: 'fir' }, null)
    );
    const store = createPersistedStore();
    expect(store.getNeededItemsGroupByItem).toBe(true);
    expect(store.getNeededItemsViewMode).toBe('list');
    expect(store.getNeededItemsFirFilter).toBe('fir');
  });
  it.each([true, false])('restores a saved grouping choice of %s unchanged', (groupByItem) => {
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      serializeUserScopedStorage(
        { neededItemsGroupByItem: groupByItem, neededItemsViewMode: 'grid' },
        null
      )
    );
    const store = createPersistedStore();
    expect(store.getNeededItemsGroupByItem).toBe(groupByItem);
    expect(store.getNeededItemsViewMode).toBe('grid');
    store.$persist();
    expect(createPersistedStore().getNeededItemsGroupByItem).toBe(groupByItem);
  });
  it('retains a By requirement choice after changing layout and reopening', () => {
    const store = createPersistedStore();
    store.setNeededItemsGroupByItem(false);
    store.setNeededItemsViewMode('list');
    store.$persist();
    const restored = createPersistedStore();
    expect(restored.getNeededItemsGroupByItem).toBe(false);
    expect(restored.getNeededItemsViewMode).toBe('list');
  });
});
describe('map tooltip density persistence', () => {
  beforeEach(() => localStorage.clear());
  it.each(['compact', 'default'] as const)('restores %s density in a fresh store', (density) => {
    const store = createPersistedStore();
    store.setMapTooltipDensity(density);
    store.$persist();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.preferences) || '{}');
    expect(saved.data.mapTooltipDensity).toBe(density);
    expect(createPersistedStore().getMapTooltipDensity).toBe(density);
  });
});
