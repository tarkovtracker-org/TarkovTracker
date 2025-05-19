import { defineStore } from 'pinia';
import { useStorage } from '@vueuse/core';
import type { Ref } from 'vue';

// Define the state structure directly
const state = () => ({
  drawerRail: useStorage<boolean>('app_drawerRail', false),
  drawerShow: useStorage<boolean>('app_drawerShow', true),
  localeOverride: useStorage<string | null>('app_localeOverride', null),
});

// The 'app' Pinia Store. Used to keep global app state
export const useAppStore = defineStore('app', {
  state,
  getters: {
    // Access state via 'this' in options API getters. Pinia unwraps refs.
    isDrawerRailMode(): boolean {
      // The logic depending on screen size (mdAndDown) should be handled in the component.
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
