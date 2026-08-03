import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
const state = () => ({
  drawerRail: useStorage<boolean>('app_drawerRail', false),
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
