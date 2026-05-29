import { useMetadataStore } from '@/stores/useMetadata';
import { logger } from '@/utils/logger';
/**
 * Plugin to initialize the metadata store
 * This ensures the store is properly initialized and data is fetched
 * when the application starts.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const metadataStore = useMetadataStore();
  if (import.meta.env.MODE === 'test') {
    return {
      provide: {
        metadata: metadataStore,
      },
    };
  }
  const toast = useToast();
  const route = useRoute();
  const SKIP_METADATA_PATH_PREFIXES = [
    '/auth/',
    '/changelog',
    '/credits',
    '/login',
    '/not-found',
    '/oauth/',
    '/privacy',
    '/supporter',
    '/terms-of-service',
  ];
  // Initialize the metadata store and fetch data (non-blocking)
  // This allows the app to render immediately while data loads in the background
  const MAX_ATTEMPTS = 3;
  const INITIAL_DELAY = 1000;
  const shouldInitializeForPath = (path: string): boolean => {
    return !SKIP_METADATA_PATH_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(prefix)
    );
  };
  let initPromise: Promise<void> | null = null;
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
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
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
  const ensureMetadataInitialized = async (path: string): Promise<void> => {
    if (!shouldInitializeForPath(path) || metadataStore.hasInitialized || initPromise) {
      return initPromise ?? Promise.resolve();
    }
    initPromise = initializeWithRetry().finally(() => {
      initPromise = null;
    });
    return initPromise;
  };
  let hasStartedWatchingRoute = false;
  const startWatchingRoute = () => {
    if (hasStartedWatchingRoute) return;
    hasStartedWatchingRoute = true;
    watch(
      () => route.path,
      (path) => {
        void ensureMetadataInitialized(path);
      },
      { immediate: true }
    );
  };
  if (typeof nuxtApp.hook === 'function') {
    nuxtApp.hook('app:mounted', startWatchingRoute);
  } else {
    startWatchingRoute();
  }
  return {
    provide: {
      metadata: metadataStore,
    },
  };
});
