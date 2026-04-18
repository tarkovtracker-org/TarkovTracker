import {
  useAnalyticsConsent,
  type AnalyticsConsentStatus,
} from '@/composables/useAnalyticsConsent';
import { getAnalyticsPageLocation, getAnalyticsPagePath } from '@/utils/analytics';
import { logger } from '@/utils/logger';
import { shouldEnableAnalyticsIntegrations } from '@/utils/runtimeConfig';
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    __ttGoogleAnalyticsReady?: boolean;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}
const GTAG_SCRIPT_ID = 'tt-google-analytics';
const GA_ID_PATTERN = /^G-[A-Z0-9]{10}$/;
export default defineNuxtPlugin(() => {
  if (import.meta.env.MODE === 'test') {
    return;
  }
  const runtimeConfig = useRuntimeConfig();
  const analyticsEnabled = shouldEnableAnalyticsIntegrations({
    appUrl: runtimeConfig.public.appUrl,
    hostname: import.meta.client ? window.location.hostname : undefined,
    isProduction: import.meta.env.PROD,
  });
  if (!analyticsEnabled) {
    return;
  }
  const measurementId = String(runtimeConfig.public.googleAnalyticsMeasurementId || '').trim();
  if (!measurementId) {
    return;
  }
  if (!GA_ID_PATTERN.test(measurementId)) {
    logger.error('[Analytics] Invalid Google Analytics measurement ID format');
    return;
  }
  const router = useRouter();
  const { state } = useAnalyticsConsent();
  let hasConfiguredTracker = false;
  let lastTrackedPageLocation: string | null = null;
  let scriptLoadPromise: Promise<void> | null = null;
  let syncRequestId = 0;
  const setDisabled = (value: boolean) => {
    window[`ga-disable-${measurementId}`] = value;
  };
  const setGoogleAnalyticsReady = (value: boolean) => {
    window.__ttGoogleAnalyticsReady = value;
  };
  const loadScript = async () => {
    if (scriptLoadPromise) {
      return scriptLoadPromise;
    }
    const existingScript = document.getElementById(GTAG_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript?.dataset.loaded === 'true') {
      return Promise.resolve();
    }
    scriptLoadPromise = new Promise<void>((resolve, reject) => {
      const handleLoad = () => {
        const script = document.getElementById(GTAG_SCRIPT_ID) as HTMLScriptElement | null;
        if (script) {
          script.dataset.loaded = 'true';
        }
        resolve();
        scriptLoadPromise = null;
      };
      const handleError = () => {
        const script = document.getElementById(GTAG_SCRIPT_ID) as HTMLScriptElement | null;
        if (script?.parentNode) {
          script.parentNode.removeChild(script);
        }
        scriptLoadPromise = null;
        reject(new Error('Failed to load Google Analytics'));
      };
      if (existingScript) {
        existingScript.addEventListener('load', handleLoad, { once: true });
        existingScript.addEventListener('error', handleError, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = GTAG_SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      document.head.appendChild(script);
    });
    return scriptLoadPromise;
  };
  const ensureConfigured = async () => {
    if (hasConfiguredTracker) {
      return;
    }
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function () {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer?.push(arguments);
      };
    await loadScript();
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      allow_ad_personalization_signals: false,
      allow_google_signals: false,
      send_page_view: false,
      transport_type: 'beacon',
    });
    hasConfiguredTracker = true;
    setGoogleAnalyticsReady(true);
  };
  const trackPageView = (route = router.currentRoute.value) => {
    if (!hasConfiguredTracker || state.value.status !== 'accepted') {
      return;
    }
    const pagePath = getAnalyticsPagePath(route);
    const pageLocation = getAnalyticsPageLocation(route);
    if (!pagePath || pageLocation === lastTrackedPageLocation) {
      return;
    }
    window.gtag?.('event', 'page_view', {
      page_location: pageLocation,
      page_path: pagePath,
      page_referrer: lastTrackedPageLocation || document.referrer || undefined,
      page_title: document.title,
    });
    lastTrackedPageLocation = pageLocation;
  };
  const syncAnalytics = async (status: AnalyticsConsentStatus) => {
    const requestId = ++syncRequestId;
    setDisabled(status !== 'accepted');
    if (status !== 'accepted') {
      lastTrackedPageLocation = null;
      setGoogleAnalyticsReady(false);
      return;
    }
    await ensureConfigured();
    if (requestId !== syncRequestId || state.value.status !== 'accepted') {
      return;
    }
    await router.isReady();
    if (requestId !== syncRequestId || state.value.status !== 'accepted') {
      return;
    }
    await nextTick();
    if (requestId !== syncRequestId || state.value.status !== 'accepted') {
      return;
    }
    trackPageView();
  };
  setDisabled(state.value.status !== 'accepted');
  setGoogleAnalyticsReady(false);
  const stopConsentWatch = watch(
    () => state.value.status,
    async (status) => {
      try {
        await syncAnalytics(status);
      } catch (error) {
        logger.error('[Analytics] Failed to update Google Analytics state', error);
      }
    },
    { immediate: true }
  );
  const removeAfterEach = router.afterEach(async (to) => {
    if (state.value.status !== 'accepted') {
      return;
    }
    await nextTick();
    trackPageView(to);
  });
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      hasConfiguredTracker = false;
      lastTrackedPageLocation = null;
      scriptLoadPromise = null;
      setGoogleAnalyticsReady(false);
      stopConsentWatch();
      removeAfterEach();
    });
  }
});
