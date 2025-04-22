import { defineStore } from 'pinia';
import { useStorage } from '@vueuse/core';
import type { Ref } from 'vue';

// Define the state structure directly
const state = () => ({
  drawerRail: useStorage<boolean>('app_drawerRail', false),
  drawerShow: null as boolean | null, // Explicitly type null state
  localeOverride: useStorage<string | null>('app_localeOverride', null),
});

// Infer the state type from the state function
// type AppState = ReturnType<typeof state>; // No longer needed for this approach

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
    // Example action structure (if needed):
    // setLocaleOverride(locale: string | null) {
    //   // Access ref value directly when using useStorage ref in actions
    //   this.localeOverride.value = locale;
    // }
  },
});
