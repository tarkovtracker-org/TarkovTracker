// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { useAppStore } from '@/stores/useApp';
describe('useAppStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });
  it('keeps device drawer settings when the SSR payload hydrates the store', async () => {
    localStorage.setItem('app_drawerRail', 'true');
    const pinia = createPinia();
    pinia.state.value.app = { drawerRail: false, drawerShow: true };
    setActivePinia(pinia);
    const store = useAppStore();
    expect(store.drawerRail).toBe(true);
    store.toggleDrawerRail();
    await nextTick();
    expect(localStorage.getItem('app_drawerRail')).toBe('false');
  });
});
