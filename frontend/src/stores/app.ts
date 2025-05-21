import { defineStore } from 'pinia';
import { useStorage } from '@vueuse/core';
const state = () => ({
  drawerRail: useStorage<boolean>('app_drawerRail', false),
  drawerShow: useStorage<boolean>('app_drawerShow', true),
  localeOverride: useStorage<string | null>('app_localeOverride', null),
});
export const useAppStore = defineStore('app', {
  state,
  getters: {
    isDrawerRailMode(): boolean {
      return this.drawerRail;
    },
  },
  actions: {
    setDrawerShow(show: boolean) {
      this.drawerShow = show;
    },
    toggleDrawerShow() {
      this.drawerShow = !this.drawerShow;
    },
    setDrawerRail(val: boolean) {
      this.drawerRail = val;
    },
    toggleDrawerRail() {
      this.drawerRail = !this.drawerRail;
    },
  },
});
