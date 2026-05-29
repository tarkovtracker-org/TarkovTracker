// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createDeferred } from '@/utils/test-helpers';
import type { AnalyticsConsentState } from '@/composables/useAnalyticsConsent';
const shouldEnableAnalyticsIntegrations = vi.fn(() => true);
const runtimeConfig = {
  public: {
    appUrl: 'https://tarkovtracker.org',
    googleAnalyticsMeasurementId: 'G-ABCDEF1234',
  },
};
const analyticsConsentState = ref<AnalyticsConsentState>({
  status: 'accepted',
  updatedAt: '2026-03-09T00:00:00.000Z',
});
const createRoute = (fullPath: string): RouterRouteLike => {
  const url = new URL(fullPath, 'https://tarkovtracker.org');
  return {
    fullPath,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  };
};
const removeAfterEach = vi.fn();
type RouterRouteLike = {
  fullPath: string;
  path: string;
  query: Record<string, string | string[]>;
};
const currentRoute = ref<RouterRouteLike>(createRoute('/'));
let afterEachHandler: ((to: RouterRouteLike) => void | Promise<void>) | null = null;
const routerIsReadyMock = vi.fn().mockResolvedValue(undefined);
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
mockNuxtImport('useRouter', () => () => ({
  afterEach: vi.fn((handler: (to: RouterRouteLike) => void | Promise<void>) => {
    afterEachHandler = handler;
    return removeAfterEach;
  }),
  currentRoute,
  isReady: routerIsReadyMock,
}));
vi.mock('@/composables/useAnalyticsConsent', () => ({
  useAnalyticsConsent: () => ({
    state: analyticsConsentState,
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('@/utils/runtimeConfig', () => ({
  shouldEnableAnalyticsIntegrations,
}));
const getNormalizedDataLayer = () => {
  return (window.dataLayer || []).map((entry) => {
    if (Array.isArray(entry) || Object.prototype.toString.call(entry) === '[object Arguments]') {
      return Array.from(entry as ArrayLike<unknown>);
    }
    return entry;
  });
};
const expectAnalyticsInitialized = (
  measurementId: string,
  pagePath = currentRoute.value.fullPath
) => {
  expect(window.gtag).toBeTypeOf('function');
  expect(getNormalizedDataLayer()).toEqual(
    expect.arrayContaining([
      ['js', expect.any(Date)],
      [
        'config',
        measurementId,
        expect.objectContaining({
          allow_ad_personalization_signals: false,
          allow_google_signals: false,
          send_page_view: false,
          transport_type: 'beacon',
        }),
      ],
      [
        'event',
        'page_view',
        expect.objectContaining({
          page_location: `${window.location.origin}${pagePath}`,
          page_path: pagePath,
          page_title: document.title,
        }),
      ],
    ])
  );
};
const flushAnalyticsSync = async () => {
  await flushPromises();
  await flushPromises();
};
describe('google analytics plugin', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('MODE', 'development');
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = false;
    analyticsConsentState.value = {
      status: 'accepted',
      updatedAt: '2026-03-09T00:00:00.000Z',
    };
    currentRoute.value = createRoute('/');
    afterEachHandler = null;
    routerIsReadyMock.mockReset();
    routerIsReadyMock.mockResolvedValue(undefined);
    shouldEnableAnalyticsIntegrations.mockReset();
    shouldEnableAnalyticsIntegrations.mockReturnValue(true);
    runtimeConfig.public.googleAnalyticsMeasurementId = 'G-ABCDEF1234';
    document.head.innerHTML = '';
    delete window.dataLayer;
    delete window.gtag;
    delete window.__ttGoogleAnalyticsReady;
    delete window['ga-disable-G-ABCDEF1234'];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    document.head.innerHTML = '';
    delete window.dataLayer;
    delete window.gtag;
    delete window.__ttGoogleAnalyticsReady;
    delete window['ga-disable-G-ABCDEF1234'];
  });
  it('initial successful load with consent granted', async () => {
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
    const plugin = (await import('@/plugins/05.google-analytics.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushAnalyticsSync();
    const script = document.getElementById('tt-google-analytics') as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    expect(script?.src).toContain(
      `googletagmanager.com/gtag/js?id=${runtimeConfig.public.googleAnalyticsMeasurementId}`
    );
    expect(script?.dataset.loaded).toBe('true');
    expect(window.__ttGoogleAnalyticsReady).toBe(true);
    expectAnalyticsInitialized(runtimeConfig.public.googleAnalyticsMeasurementId);
  });
  it('tracks canonicalized query strings and strips transient retry params', async () => {
    currentRoute.value = createRoute(
      '/tasks?trader=54cb57776803fa99248b456e&view=maps&_tt_retry=123&view=maps'
    );
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
    const plugin = (await import('@/plugins/05.google-analytics.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushAnalyticsSync();
    expectAnalyticsInitialized(
      runtimeConfig.public.googleAnalyticsMeasurementId,
      '/tasks?trader=54cb57776803fa99248b456e&view=maps'
    );
  });
  it('consent denial before script loads', async () => {
    analyticsConsentState.value = {
      status: 'declined',
      updatedAt: '2026-03-09T00:00:00.000Z',
    };
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
    const plugin = (await import('@/plugins/05.google-analytics.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushAnalyticsSync();
    expect(document.getElementById('tt-google-analytics')).toBeNull();
    expect(window.__ttGoogleAnalyticsReady).toBe(false);
    analyticsConsentState.value = {
      status: 'accepted',
      updatedAt: '2026-03-09T00:01:00.000Z',
    };
    await flushAnalyticsSync();
    const script = document.getElementById('tt-google-analytics') as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    expect(script?.src).toContain(
      `googletagmanager.com/gtag/js?id=${runtimeConfig.public.googleAnalyticsMeasurementId}`
    );
    expect(script?.dataset.loaded).toBe('true');
    expect(window.__ttGoogleAnalyticsReady).toBe(true);
    expectAnalyticsInitialized(runtimeConfig.public.googleAnalyticsMeasurementId);
  });
  it('does not initialize analytics for an invalid measurement ID', async () => {
    runtimeConfig.public.googleAnalyticsMeasurementId = '';
    const plugin = (await import('@/plugins/05.google-analytics.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushAnalyticsSync();
    expect(document.getElementById('tt-google-analytics')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    expect(window.gtag).toBeUndefined();
  });
  it('skips initialization when analytics runtime is disabled', async () => {
    shouldEnableAnalyticsIntegrations.mockReturnValueOnce(false);
    const plugin = (await import('@/plugins/05.google-analytics.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushAnalyticsSync();
    expect(document.getElementById('tt-google-analytics')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    expect(window.gtag).toBeUndefined();
  });
  it('removes a failed script and recreates it after consent is re-accepted', async () => {
    const originalScript = document.createElement('script');
    originalScript.id = 'tt-google-analytics';
    document.head.appendChild(originalScript);
    const plugin = (await import('@/plugins/05.google-analytics.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushAnalyticsSync();
    expect(originalScript).toBeTruthy();
    originalScript.dispatchEvent(new Event('error'));
    await flushAnalyticsSync();
    expect(document.getElementById('tt-google-analytics')).toBeNull();
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
    analyticsConsentState.value = {
      status: 'declined',
      updatedAt: '2026-03-09T00:01:00.000Z',
    };
    await flushAnalyticsSync();
    analyticsConsentState.value = {
      status: 'accepted',
      updatedAt: '2026-03-09T00:02:00.000Z',
    };
    await flushAnalyticsSync();
    const replacementScript = document.getElementById(
      'tt-google-analytics'
    ) as HTMLScriptElement | null;
    expect(replacementScript).toBeTruthy();
    expect(replacementScript).not.toBe(originalScript);
    expect(replacementScript?.src).toContain('googletagmanager.com/gtag/js?id=G-ABCDEF1234');
    expect(replacementScript?.dataset.loaded).toBe('true');
  });
  it('tracks route changes with normalized page paths', async () => {
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
    const plugin = (await import('@/plugins/05.google-analytics.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushAnalyticsSync();
    currentRoute.value = createRoute('/needed-items?type=hideout&type=hideout');
    await afterEachHandler?.(currentRoute.value);
    await flushAnalyticsSync();
    expectAnalyticsInitialized(
      runtimeConfig.public.googleAnalyticsMeasurementId,
      '/needed-items?type=hideout'
    );
  });
  it('initializes the queueing gtag stub before router readiness completes', async () => {
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
    const routerReadyDeferred = createDeferred<undefined>();
    routerIsReadyMock.mockReturnValueOnce(routerReadyDeferred.promise);
    const plugin = (await import('@/plugins/05.google-analytics.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushPromises();
    expect(window.gtag).toBeTypeOf('function');
    window.gtag?.('event', 'login_start', { method: 'discord' });
    expect(getNormalizedDataLayer()).toEqual(
      expect.arrayContaining([['event', 'login_start', { method: 'discord' }]])
    );
    routerReadyDeferred.resolve(undefined);
    await flushAnalyticsSync();
  });
});
