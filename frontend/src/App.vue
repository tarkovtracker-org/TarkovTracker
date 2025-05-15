<template>
  <!-- The main app space. -->
  <v-app color="rgba(0, 0, 0, 1)">
    <!-- Layout will be rendered as part of the router view below -->
    <router-view />
  </v-app>
</template>

<script setup>
  import { onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useAppStore } from '@/stores/app';
  import { fireuser } from '@/plugins/firebase';
  import { markDataMigrated } from '@/plugins/store-initializer';
  import { useTarkovStore } from '@/stores/tarkov';
  const appStore = useAppStore();
  const { locale } = useI18n({ useScope: 'global' });
  onMounted(async () => {
    // Check our locale settings
    if (appStore.localeOverride) {
      locale.value = appStore.localeOverride;
    }
    // Check for migration flag in sessionStorage
    const wasMigrated = sessionStorage.getItem('tarkovDataMigrated') === 'true';
    if (wasMigrated && fireuser.loggedIn) {
      // Re-set the migration flag
      markDataMigrated();
      // Make sure data is properly loaded from Firebase
      try {
        const store = useTarkovStore();
        if (store && typeof store.firebindAll === 'function') {
          store.firebindAll();
        }
      } catch (error) {
        console.error('Error rebinding store in App component:', error);
      }
    }
  });
</script>
<style lang="scss">
  // Set the font family for the application to Share Tech Mono
  .v-application {
    [class*='text-'] {
      font-family: 'Share Tech Mono', sans-serif !important;
      font-display: swap;
    }
    font-family: 'Share Tech Mono', sans-serif !important;
    font-display: swap;
  }
</style>
