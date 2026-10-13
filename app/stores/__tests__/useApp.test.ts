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
  it('pins and unpins a drawer group without touching the others', () => {
    const store = useAppStore();
    store.toggleDrawerGroupPin('/tasks');
    store.toggleDrawerGroupPin('/hideout');
    expect(store.drawerPinnedGroups).toEqual(['/tasks', '/hideout']);
    store.toggleDrawerGroupPin('/tasks');
    expect(store.drawerPinnedGroups).toEqual(['/hideout']);
  });
  it('keeps device drawer settings when the SSR payload hydrates the store', async () => {
    localStorage.setItem('app_drawerPinnedGroups', JSON.stringify(['/tasks']));
    localStorage.setItem('app_drawerRail', 'true');
    const pinia = createPinia();
    pinia.state.value.app = { drawerPinnedGroups: [], drawerRail: false, drawerShow: true };
    setActivePinia(pinia);
    const store = useAppStore();
    expect(store.drawerPinnedGroups).toEqual(['/tasks']);
    expect(store.drawerRail).toBe(true);
    store.toggleDrawerGroupPin('/tasks');
    await nextTick();
    expect(localStorage.getItem('app_drawerPinnedGroups')).toBe('[]');
  });
});
