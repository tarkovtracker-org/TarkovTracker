import {
  useAnalyticsConsent,
  type AnalyticsConsentStatus,
} from '@/composables/useAnalyticsConsent';
import { logger } from '@/utils/logger';
import { shouldEnableAnalyticsIntegrations } from '@/utils/runtimeConfig';
type Clarity = ((...args: unknown[]) => void) & { q?: unknown[][] };
declare global {
  interface Window {
    clarity?: Clarity;
    __ttMicrosoftClarityReady?: boolean;
  }
}
const CLARITY_SCRIPT_ID = 'tt-microsoft-clarity';
const CLARITY_ID_PATTERN = /^[a-z0-9]{10}$/;
const CLARITY_CONSENT_GRANTED = {
  ad_Storage: 'granted',
  analytics_Storage: 'granted',
} as const;
const CLARITY_CONSENT_DENIED = {
  ad_Storage: 'denied',
  analytics_Storage: 'denied',
} as const;
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
  const projectId = String(runtimeConfig.public.microsoftClarityProjectId || '').trim();
  if (!projectId) {
    return;
  }
  if (!CLARITY_ID_PATTERN.test(projectId)) {
    logger.error('[Analytics] Invalid Microsoft Clarity project ID format');
    return;
  }
  const { state } = useAnalyticsConsent();
  let scriptLoadPromise: Promise<void> | null = null;
  let syncRequestId = 0;
  const setMicrosoftClarityReady = (value: boolean) => {
    window.__ttMicrosoftClarityReady = value;
  };
  const ensureClarityApi = () => {
    if (typeof window.clarity === 'function') {
      return;
    }
    const clarity = ((...args: unknown[]) => {
      clarity.q = clarity.q || [];
      clarity.q.push(args);
    }) as Clarity;
    window.clarity = clarity;
  };
  const loadScript = async () => {
    if (scriptLoadPromise) {
      return scriptLoadPromise;
    }
    const existingScript = document.getElementById(CLARITY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript?.dataset.loaded === 'true') {
      return Promise.resolve();
    }
    scriptLoadPromise = new Promise<void>((resolve, reject) => {
      const handleLoad = () => {
        const script = document.getElementById(CLARITY_SCRIPT_ID) as HTMLScriptElement | null;
        if (script) {
          script.dataset.loaded = 'true';
        }
        resolve();
        scriptLoadPromise = null;
      };
      const handleError = () => {
        const script = document.getElementById(CLARITY_SCRIPT_ID) as HTMLScriptElement | null;
        if (script?.parentNode) {
          script.parentNode.removeChild(script);
        }
        scriptLoadPromise = null;
        reject(new Error('Failed to load Microsoft Clarity'));
      };
      if (existingScript) {
        existingScript.addEventListener('load', handleLoad, { once: true });
        existingScript.addEventListener('error', handleError, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = CLARITY_SCRIPT_ID;
      script.async = true;
      script.src = `https://www.clarity.ms/tag/${projectId}`;
      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      document.head.appendChild(script);
    });
    return scriptLoadPromise;
  };
  const revokeConsent = () => {
    setMicrosoftClarityReady(false);
    if (typeof window.clarity !== 'function') {
      return;
    }
    window.clarity('consentv2', CLARITY_CONSENT_DENIED);
  };
  const syncClarity = async (status: AnalyticsConsentStatus) => {
    const requestId = ++syncRequestId;
    if (status !== 'accepted') {
      revokeConsent();
      return;
    }
    ensureClarityApi();
    await loadScript();
    if (requestId !== syncRequestId || state.value.status !== 'accepted') {
      return;
    }
    window.clarity?.('consentv2', CLARITY_CONSENT_GRANTED);
    setMicrosoftClarityReady(true);
  };
  setMicrosoftClarityReady(false);
  const stopConsentWatch = watch(
    () => state.value.status,
    async (status) => {
      try {
        await syncClarity(status);
      } catch (error) {
        logger.error('[Analytics] Failed to update Microsoft Clarity state', error);
      }
    },
    { immediate: true }
  );
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      syncRequestId = 0;
      scriptLoadPromise = null;
      setMicrosoftClarityReady(false);
      stopConsentWatch();
    });
  }
});
