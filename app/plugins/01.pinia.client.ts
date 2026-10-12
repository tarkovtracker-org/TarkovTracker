import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import {
  configureProgressSession,
  initializeProgressAuthority,
  observeProgressAuthority,
} from '@/stores/tarkov/progressAuthority';
import { recordLocalSave } from '@/stores/tarkov/progressSaveStatus';
import { logger } from '@/utils/logger';
import type { Pinia } from 'pinia';
let pinia: Pinia | undefined;
function installPiniaPlugins(target: Pinia): void {
  // Install persistedstate plugin for automatic localStorage persistence
  target.use(piniaPluginPersistedstate);
}
export default defineNuxtPlugin({
  name: 'progress-persistence',
  dependsOn: ['supabase'],
  async setup(nuxtApp) {
    const supabase = nuxtApp.$supabase;
    configureProgressSession(() => supabase.user.id || null);
    // Refreshes no-op until a session is hydrated, so a later activation retry stays current.
    try {
      const stop = observeProgressAuthority((error) => {
        logger.error('[PiniaPlugin] Progress refresh failed', error);
      });
      nuxtApp.vueApp.onUnmount(stop);
    } catch (error) {
      logger.error('[PiniaPlugin] Progress observer unavailable', error);
    }
    try {
      await supabase.ready();
      await initializeProgressAuthority(supabase.user.id || null);
    } catch (error) {
      logger.error('[PiniaPlugin] Progress authority unavailable', error);
      recordLocalSave(false, 'unknown');
    }
    // Get pinia instance from @pinia/nuxt module
    pinia = nuxtApp.$pinia as Pinia | undefined;
    if (!pinia) {
      logger.error('[PiniaPlugin] $pinia is undefined – persist plugin not installed');
      return;
    }
    installPiniaPlugins(pinia);
    // Don't provide $pinia again - it's already provided by @pinia/nuxt
  },
});
