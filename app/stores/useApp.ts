import { useStorage } from '@vueuse/core';
import { defineStore, skipHydrate } from 'pinia';
import { SHELL_DRAWER_RAIL_STORAGE_KEY } from '@/utils/shellConfig';
// A setup store: an options store skips `state()` when the SSR payload hydrates it, so its
// `useStorage` refs would never bind to localStorage on the client.
export const useAppStore = defineStore('app', () => {
  const drawerRail = skipHydrate(useStorage<boolean>(SHELL_DRAWER_RAIL_STORAGE_KEY, false));
  const drawerShow = skipHydrate(useStorage<boolean>('app_drawerShow', true));
  const mobileDrawerExpanded = ref(false);
  const toggleDrawerRail = () => {
    drawerRail.value = !drawerRail.value;
  };
  const setMobileDrawerExpanded = (expanded: boolean) => {
    mobileDrawerExpanded.value = expanded;
  };
  const toggleMobileDrawerExpanded = () => {
    mobileDrawerExpanded.value = !mobileDrawerExpanded.value;
  };
  return {
    drawerRail,
    drawerShow,
    mobileDrawerExpanded,
    toggleDrawerRail,
    setMobileDrawerExpanded,
    toggleMobileDrawerExpanded,
  };
});
