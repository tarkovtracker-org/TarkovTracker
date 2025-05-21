<template>
  <!-- Navigation Drawer -->
  <nav-drawer />

  <!-- Application Bar-->
  <app-bar />

  <!-- Main View -->
  <v-main style="min-height: 100vh; display: flex; flex-direction: column">
    <!-- <div id="tracker-page-background"> -->
    <div id="tracker-page-background" style="flex: 1 1 auto; display: flex; flex-direction: column">
      <div
        id="tracker-page-background-blur"
        class="d-flex flex-column justify-space-between"
        style="flex: 1 1 auto; min-height: 100%"
      >
        <div class="flex-grow-1" style="padding: 8px 8px 0">
          <router-view />
        </div>
        <app-footer style="margin-top: auto; flex-shrink: 0" />
      </div>
    </div>
    <!-- </div> -->
  </v-main>
</template>
<script setup>
  import { computed } from 'vue';
  import { defineAsyncComponent } from 'vue';
  import { useRoute } from 'vue-router';
  const route = useRoute();
  const backgroundImage = computed(() => {
    if (route.meta.background) {
      return `url(/img/background/${route.meta.background}.webp)`;
    } else {
      return '';
    }
  });
  // const backgroundImage = computed(() => {
  //   if (route.meta.background) {
  //     return `/img/background/${route.meta.background}.webp`
  //   } else {
  //     return ''
  //   }
  // })
  const NavDrawer = defineAsyncComponent(() => import('@/components/layout/NavDrawer'));
  const AppFooter = defineAsyncComponent(() => import('@/components/layout/AppFooter'));
  const AppBar = defineAsyncComponent(() => import('@/components/layout/AppBar'));
</script>
<style lang="scss" scoped>
  #tracker-page-background {
    background-image: v-bind(backgroundImage);
    background-size: cover;
    background-repeat: no-repeat;
    background-position: center;
    height: 100%;
  }
  #tracker-page-background-blur {
    background: rgba(255, 255, 255, 0.01); // Make sure this color has an opacity of less than 1
    backdrop-filter: blur(8px) brightness(30%);
    min-height: 100%;
    min-width: 100%;
  }
  .main-content {
    flex: 1;
  }
</style>
