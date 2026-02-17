<template>
  <div class="bg-military-background text-surface-200 flex min-h-screen flex-col">
    <!-- Skip navigation link for accessibility -->
    <a
      href="#main-content"
      class="focus:bg-primary-600 sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-16 focus:z-100 focus:rounded focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
    >
      Skip to main content
    </a>
    <!-- Navigation Drawer (fixed) -->
    <NavDrawer />
    <!-- Application Bar (fixed header) -->
    <AppBar
      class="transition-all duration-300 ease-in-out"
      :style="{
        left: mainMarginLeft,
      }"
    />
    <!-- Main content area -->
    <main
      id="main-content"
      class="relative z-0 flex flex-1 flex-col pt-11 transition-all duration-300 ease-in-out"
      :style="{
        marginLeft: mainMarginLeft,
      }"
    >
      <div :class="contentWrapperClass">
        <slot />
      </div>
    </main>
    <!-- Back to top button -->
    <BackToTop />
    <!-- Footer pinned to bottom when content is short -->
    <AppFooter
      class="shrink-0"
      :style="{
        marginLeft: mainMarginLeft,
        width: `calc(100% - ${mainMarginLeft})`,
      }"
    />
  </div>
</template>
<script setup lang="ts">
  import { useSharedBreakpoints } from '@/composables/useSharedBreakpoints';
  import { useAppStore } from '@/stores/useApp';
  const DRAWER_EXPANDED_WIDTH = '224px';
  const DRAWER_COLLAPSED_WIDTH = '64px';
  const appStore = useAppStore();
  const route = useRoute();
  // Use shared breakpoints to avoid duplicate listeners
  const { belowMd } = useSharedBreakpoints();
  const mainMarginLeft = computed(() => {
    if (belowMd.value) {
      return appStore.mobileDrawerExpanded ? DRAWER_EXPANDED_WIDTH : DRAWER_COLLAPSED_WIDTH;
    }
    return appStore.drawerRail ? DRAWER_COLLAPSED_WIDTH : DRAWER_EXPANDED_WIDTH;
  });
  const usesWindowScroll = computed(() => {
    return Boolean(route.meta?.usesWindowScroll);
  });
  useHead(
    computed(() => ({
      htmlAttrs: {
        class: usesWindowScroll.value ? 'no-smooth-scroll' : undefined,
      },
    }))
  );
  const contentWrapperClass = computed(() => [
    'flex min-h-0 flex-1 flex-col p-0',
    usesWindowScroll.value ? 'overflow-visible' : 'overflow-y-auto',
  ]);
  // Lazy-load shell components
  const NavDrawer = defineAsyncComponent(() => import('@/shell/NavDrawer.vue'));
  const AppFooter = defineAsyncComponent(() => import('@/shell/AppFooter.vue'));
  const AppBar = defineAsyncComponent(() => import('@/shell/AppBar.vue'));
</script>
