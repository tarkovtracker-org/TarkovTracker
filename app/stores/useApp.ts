import { useStorage } from '@vueuse/core';
import { defineStore, skipHydrate } from 'pinia';
import { SHELL_DRAWER_RAIL_STORAGE_KEY } from '@/utils/shellConfig';
// A setup store: an options store skips `state()` when the SSR payload hydrates it, so its
// `useStorage` refs would never bind to localStorage on the client.
export const useAppStore = defineStore('app', () => {
  const drawerRail = skipHydrate(useStorage<boolean>(SHELL_DRAWER_RAIL_STORAGE_KEY, false));
  const drawerShow = skipHydrate(useStorage<boolean>('app_drawerShow', true));
  const mobileDrawerExpanded = ref(false);
  /** Drawer groups pinned open, by their route; the rest stay compact and open on hover. */
  const drawerPinnedGroups = skipHydrate(useStorage<string[]>('app_drawerPinnedGroups', []));
  const toggleDrawerRail = () => {
    drawerRail.value = !drawerRail.value;
  };
  const setMobileDrawerExpanded = (expanded: boolean) => {
    mobileDrawerExpanded.value = expanded;
  };
  const toggleDrawerGroupPin = (group: string) => {
    const pinned = drawerPinnedGroups.value.filter((entry) => entry !== group);
    if (pinned.length === drawerPinnedGroups.value.length) pinned.push(group);
    drawerPinnedGroups.value = pinned;
  };
  const toggleMobileDrawerExpanded = () => {
    mobileDrawerExpanded.value = !mobileDrawerExpanded.value;
  };
  return {
    drawerRail,
    drawerShow,
    mobileDrawerExpanded,
    drawerPinnedGroups,
    toggleDrawerRail,
    setMobileDrawerExpanded,
    toggleDrawerGroupPin,
    toggleMobileDrawerExpanded,
  };
});
