type AnalyticsPrimitive = boolean | number | string;
type AnalyticsParams = Record<string, AnalyticsPrimitive | null | undefined>;
type Clarity = ((...args: unknown[]) => void) & { q?: unknown[][] };
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    __ttGoogleAnalyticsReady?: boolean;
    __ttMicrosoftClarityReady?: boolean;
    clarity?: Clarity;
    gtag?: Gtag;
  }
}
const sanitizeAnalyticsParams = (params: AnalyticsParams): Record<string, AnalyticsPrimitive> => {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, AnalyticsPrimitive] => entry[1] !== null && entry[1] !== undefined
    )
  );
};
export function useAnalyticsEvents(): {
  trackEvent: (eventName: string, params?: AnalyticsParams) => void;
} {
  const trackEvent = (eventName: string, params: AnalyticsParams = {}) => {
    if (!import.meta.client) return;
    const sanitizedParams = sanitizeAnalyticsParams(params);
    const hasExplicitGoogleAnalyticsState = typeof window.__ttGoogleAnalyticsReady === 'boolean';
    const hasExplicitMicrosoftClarityState = typeof window.__ttMicrosoftClarityReady === 'boolean';
    const shouldTrackWithGoogleAnalytics =
      window.__ttGoogleAnalyticsReady === true ||
      (!hasExplicitGoogleAnalyticsState && typeof window.gtag === 'function');
    const shouldTrackWithMicrosoftClarity =
      window.__ttMicrosoftClarityReady === true ||
      (!hasExplicitMicrosoftClarityState && typeof window.clarity === 'function');
    if (!shouldTrackWithGoogleAnalytics && !shouldTrackWithMicrosoftClarity) {
      return;
    }
    if (shouldTrackWithGoogleAnalytics) {
      window.gtag?.('event', eventName, sanitizedParams);
    }
    if (shouldTrackWithMicrosoftClarity) {
      window.clarity?.('event', eventName);
    }
  };
  return {
    trackEvent,
  };
}
