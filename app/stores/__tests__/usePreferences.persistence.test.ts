import { createPinia, setActivePinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import { usePreferencesStore } from '@/stores/usePreferences';
import { STORAGE_KEYS } from '@/utils/storageKeys';
const createPersistedStore = () => {
  const pinia = createPinia().use(piniaPluginPersistedstate);
  createApp({ render: () => null }).use(pinia);
  setActivePinia(pinia);
  return usePreferencesStore();
};
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
