import { useStorage } from '@vueuse/core';
import { logger } from '@/utils/logger';
import { shouldEnableAnalyticsIntegrations } from '@/utils/runtimeConfig';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type { ComputedRef, Ref } from '#imports';
export type AnalyticsConsentStatus = 'unknown' | 'accepted' | 'declined';
export type AnalyticsConsentState = {
  status: AnalyticsConsentStatus;
  updatedAt: string | null;
};
export type UseAnalyticsConsentReturn = {
  state: Ref<AnalyticsConsentState>;
  hasAnswered: ComputedRef<boolean>;
  isAccepted: ComputedRef<boolean>;
  isDeclined: ComputedRef<boolean>;
  isPromptOpen: ComputedRef<boolean>;
  accept: () => void;
  decline: () => void;
  openPreferences: () => void;
  closePreferences: () => void;
  reset: () => void;
};
const defaultAnalyticsConsentState: AnalyticsConsentState = {
  status: 'unknown',
  updatedAt: null,
};
const analyticsPromptOpen = ref(false);
let analyticsConsentState: ReturnType<typeof useStorage<AnalyticsConsentState>> | null = null;
function normalizeAnalyticsConsentState(value: unknown): AnalyticsConsentState {
  if (!value || typeof value !== 'object') {
    return { ...defaultAnalyticsConsentState };
  }
  const rawValue = value as Partial<AnalyticsConsentState>;
  const status =
    rawValue.status === 'accepted' || rawValue.status === 'declined' ? rawValue.status : 'unknown';
  const updatedAt = typeof rawValue.updatedAt === 'string' ? rawValue.updatedAt : null;
  return {
    status,
    updatedAt,
  };
}
function createNoopConsentApi(): UseAnalyticsConsentReturn {
  const state = ref<AnalyticsConsentState>({ ...defaultAnalyticsConsentState });
  return {
    state,
    hasAnswered: computed(() => false),
    isAccepted: computed(() => false),
    isDeclined: computed(() => false),
    isPromptOpen: computed(() => false),
    accept: () => undefined,
    decline: () => undefined,
    openPreferences: () => undefined,
    closePreferences: () => undefined,
    reset: () => undefined,
  };
}
export function useAnalyticsConsent(): UseAnalyticsConsentReturn {
  if (!import.meta.client) {
    return createNoopConsentApi();
  }
  if (!analyticsConsentState) {
    analyticsConsentState = useStorage<AnalyticsConsentState>(
      STORAGE_KEYS.analyticsConsent,
      { ...defaultAnalyticsConsentState },
      localStorage,
      {
        serializer: {
          read: (value) => {
            try {
              return normalizeAnalyticsConsentState(JSON.parse(value));
            } catch (error) {
              logger.debug(
                '[AnalyticsConsent] Failed to parse stored consent state; using defaults.',
                error,
                value
              );
              return { ...defaultAnalyticsConsentState };
            }
          },
          write: (value) => JSON.stringify(normalizeAnalyticsConsentState(value)),
        },
      }
    );
    analyticsConsentState.value = normalizeAnalyticsConsentState(analyticsConsentState.value);
    analyticsPromptOpen.value = analyticsConsentState.value.status === 'unknown';
  }
  const state = analyticsConsentState;
  const setConsent = (status: AnalyticsConsentStatus) => {
    state.value = {
      status,
      updatedAt: status === 'unknown' ? null : new Date().toISOString(),
    };
    analyticsPromptOpen.value = status === 'unknown';
  };
  const openPreferences = () => {
    analyticsPromptOpen.value = true;
  };
  const closePreferences = () => {
    if (state.value.status === 'unknown') {
      return;
    }
    analyticsPromptOpen.value = false;
  };
  return {
    state,
    hasAnswered: computed(() => state.value.status !== 'unknown'),
    isAccepted: computed(() => state.value.status === 'accepted'),
    isDeclined: computed(() => state.value.status === 'declined'),
    isPromptOpen: computed(() => analyticsPromptOpen.value),
    accept: () => setConsent('accepted'),
    decline: () => setConsent('declined'),
    openPreferences,
    closePreferences,
    reset: () => setConsent('unknown'),
  };
}
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    analyticsConsentState = null;
    analyticsPromptOpen.value = false;
  });
}
export function isAnalyticsConfigured(
  config: ReturnType<typeof useRuntimeConfig>['public']
): boolean {
  return (
    shouldEnableAnalyticsIntegrations({
      appUrl: config.appUrl,
      hostname: import.meta.client ? window.location.hostname : undefined,
      isProduction: import.meta.env.PROD,
    }) &&
    [config.googleAnalyticsMeasurementId, config.microsoftClarityProjectId].some(
      (value) => String(value || '').trim().length > 0
    )
  );
}
