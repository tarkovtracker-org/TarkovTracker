import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { SHELL_DRAWER_RAIL_STORAGE_KEY } from '@/utils/shellConfig';
const state = () => ({
  drawerRail: useStorage<boolean>(SHELL_DRAWER_RAIL_STORAGE_KEY, false),
  drawerShow: useStorage<boolean>('app_drawerShow', true),
  mobileDrawerExpanded: false,
});
export const useAppStore = defineStore('app', {
  state,
  actions: {
    toggleDrawerRail() {
      this.drawerRail = !this.drawerRail;
    },
    setMobileDrawerExpanded(expanded: boolean) {
      this.mobileDrawerExpanded = expanded;
    },
    toggleMobileDrawerExpanded() {
      this.mobileDrawerExpanded = !this.mobileDrawerExpanded;
    },
  },
});
