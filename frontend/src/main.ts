import { createApp } from 'vue';
import type { ComponentPublicInstance } from 'vue'; // Import type for vm
import { DefaultApolloClient } from '@vue/apollo-composable';
import router from './router';
import i18n from './plugins/i18n';
import vuetify from './plugins/vuetify';
import pinia from './plugins/pinia';
import apolloClient from './plugins/apollo';
import { VueFire, VueFireAuth } from 'vuefire';
import { app as fireapp } from './plugins/firebase';
import { markInitialized, forceInitialize } from './plugins/store-initializer';
// Base app component
import App from './App.vue';

// Define custom window property
declare global {
  interface Window {
    __TARKOV_DATA_MIGRATED?: boolean;
  }
}

// Add a global flag to track data migration status - will help with persistence
window.__TARKOV_DATA_MIGRATED = false;

// Create app instance
const app = createApp(App);
// Global error handler for debugging
app.config.errorHandler = (err: unknown, vm: ComponentPublicInstance | null, info: string) => {
  console.error('Vue Error:', err);
  console.error('Component:', vm);
  console.error('Info:', info);
};

// Configure app with plugins in the correct order
app.use(i18n);
// Initialize Pinia first
app.use(pinia);
// Delay to ensure Pinia is fully initialized
setTimeout(() => {
  // Force initialize the store system as a failsafe
  forceInitialize();

  // Continue with the rest of the initialization
  app
    .use(router)
    .use(vuetify)
    .use(VueFire, {
      firebaseApp: fireapp,
      modules: [VueFireAuth()],
    })
    .provide(DefaultApolloClient, apolloClient)
    .mount('#app');
  // Ensure the store system is marked as initialized
  markInitialized();
}, 100);
