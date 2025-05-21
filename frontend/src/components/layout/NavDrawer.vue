<template>
  <v-navigation-drawer
    v-model="appStore.drawerShow"
    theme="dark"
    image="/img/background/sidebar-background.webp"
    :rail="isRailActive"
    :width="isRailActive ? 56 : 200"
    class="compact-nav-drawer"
  >
    <tracker-logo :is-collapsed="isRailActive" />
    <v-divider class="mx-3 my-1" />
    <drawer-account :is-collapsed="isRailActive" />
    <v-divider class="mx-3 my-1" />
    <drawer-level :is-collapsed="isRailActive" />
    <v-divider class="mx-3 my-1" />
    <drawer-links :is-collapsed="isRailActive" />
    <v-divider class="mx-3 my-1" />
    <drawer-external-links :is-collapsed="isRailActive" />
  </v-navigation-drawer>
</template>
<script setup>
  import { defineAsyncComponent, computed } from 'vue';
  import { useAppStore } from '@/stores/app';
  import { useDisplay } from 'vuetify';
  const { mdAndDown } = useDisplay();
  const appStore = useAppStore();

  // Calculate the effective rail state
  const isRailActive = computed(() => !mdAndDown.value && appStore.drawerRail);

  // Set up component loading
  const TrackerLogo = defineAsyncComponent(() => import('@/components/drawer/TrackerLogo'));
  const DrawerLinks = defineAsyncComponent(() => import('@/components/drawer/DrawerLinks'));
  const DrawerAccount = defineAsyncComponent(() => import('@/components/drawer/DrawerAccount'));
  const DrawerLevel = defineAsyncComponent(() => import('@/components/drawer/DrawerLevel'));
  const DrawerExternalLinks = defineAsyncComponent(
    () => import('@/components/drawer/DrawerExternalLinks')
  );
</script>
<style lang="scss" scoped>
  :deep(.v-list-group__items .v-list-item) {
    padding-inline-start: 0 !important;
    padding-left: 8px !important;
  }
  .compact-nav-drawer {
    /* Remove width: auto, use fixed width for proper collapse */
    box-sizing: border-box !important;
  }
</style>
