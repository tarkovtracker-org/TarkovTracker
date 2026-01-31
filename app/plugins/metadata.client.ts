import { useMetadataStore } from '@/stores/useMetadata';
import { logger } from '@/utils/logger';
/**
 * Plugin to initialize the metadata store
 * This ensures the store is properly initialized and data is fetched
 * when the application starts.
 */
export default defineNuxtPlugin(() => {
  const metadataStore = useMetadataStore();
  const toast = useToast();
  // Initialize the metadata store and fetch data (non-blocking)
  // This allows the app to render immediately while data loads in the background
  const MAX_ATTEMPTS = 3;
  const INITIAL_DELAY = 1000;
  async function initializeWithRetry(attempt = 1): Promise<void> {
    try {
      await metadataStore.initialize();
    } catch (err) {
      // Safety catch for any unhandled rejections; internal errors are already handled/logged
      if (attempt < MAX_ATTEMPTS) {
        const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
        logger.warn(
          `[MetadataPlugin] Background initialization failed (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying in ${delay}ms...`,
          err
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return initializeWithRetry(attempt + 1);
      }
      // Final failure handling after all retries
      logger.error('[MetadataPlugin] Critical error during background initialization:', err);
      // Surface a user-visible state (e.g., set an application-level flag)
      // The store handles its own error state, but we can also use a toast
      toast.add({
        title: 'Application Data Error',
        description: 'Failed to load critical game data. Some features may be disabled.',
        color: 'error',
        duration: 0, // Keep visible until closed
      });
    }
  }
  initializeWithRetry();
  return {
    provide: {
      metadata: metadataStore,
    },
  };
});
