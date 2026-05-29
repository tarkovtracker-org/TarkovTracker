// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { AnalyticsConsentState } from '@/composables/useAnalyticsConsent';
type ClarityApi = ((...args: unknown[]) => void) & { q?: unknown[][] };
const shouldEnableAnalyticsIntegrations = vi.fn(() => true);
const clarityAcceptedConsent = [
  'consentv2',
  {
    ad_Storage: 'granted',
    analytics_Storage: 'granted',
  },
] as const;
const clarityDeclinedConsent = [
  'consentv2',
  {
    ad_Storage: 'denied',
    analytics_Storage: 'denied',
  },
] as const;
const runtimeConfig = {
  public: {
    appUrl: 'https://tarkovtracker.org',
    microsoftClarityProjectId: 'abcdef1234',
  },
};
const analyticsConsentState = ref<AnalyticsConsentState>({
  status: 'accepted',
  updatedAt: '2026-03-09T00:00:00.000Z',
});
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
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
const flushClaritySync = async () => {
  await flushPromises();
};
describe('microsoft clarity plugin', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('MODE', 'development');
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = false;
    analyticsConsentState.value = {
      status: 'accepted',
      updatedAt: '2026-03-09T00:00:00.000Z',
    };
    shouldEnableAnalyticsIntegrations.mockReset();
    shouldEnableAnalyticsIntegrations.mockReturnValue(true);
    runtimeConfig.public.microsoftClarityProjectId = 'abcdef1234';
    document.head.innerHTML = '';
    delete window.clarity;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    document.head.innerHTML = '';
    delete window.clarity;
  });
  it('sends consent after the first accepted load completes', async () => {
    const script = document.createElement('script');
    script.id = 'tt-microsoft-clarity';
    document.head.appendChild(script);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    expect(script).toBeTruthy();
    expect(window.clarity).toBeTypeOf('function');
    expect((window.clarity as ClarityApi | undefined)?.q).toBeUndefined();
    script?.dispatchEvent(new Event('load'));
    await flushClaritySync();
    expect((window.clarity as ClarityApi).q).toContainEqual(clarityAcceptedConsent);
  });
  it('revokes an active session immediately and restores it after a later re-accept', async () => {
    const clarity = vi.fn();
    const script = document.createElement('script');
    script.id = 'tt-microsoft-clarity';
    document.head.appendChild(script);
    window.clarity = clarity;
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    expect(script).toBeTruthy();
    expect(clarity).not.toHaveBeenCalled();
    analyticsConsentState.value = {
      status: 'declined',
      updatedAt: '2026-03-09T00:01:00.000Z',
    };
    await flushClaritySync();
    expect(clarity).toHaveBeenCalledWith(...clarityDeclinedConsent);
    script?.dispatchEvent(new Event('load'));
    await flushClaritySync();
    expect(clarity.mock.calls).not.toContainEqual(clarityAcceptedConsent);
    analyticsConsentState.value = {
      status: 'accepted',
      updatedAt: '2026-03-09T00:02:00.000Z',
    };
    await flushClaritySync();
    expect(clarity).toHaveBeenLastCalledWith(...clarityAcceptedConsent);
  });
  it('removes a failed script node and retries with a fresh element on the next accepted sync', async () => {
    const originalScript = document.createElement('script');
    originalScript.id = 'tt-microsoft-clarity';
    document.head.appendChild(originalScript);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    originalScript.dispatchEvent(new Event('error'));
    await flushClaritySync();
    expect(document.getElementById('tt-microsoft-clarity')).toBeNull();
    analyticsConsentState.value = {
      status: 'declined',
      updatedAt: '2026-03-09T00:01:00.000Z',
    };
    await flushClaritySync();
    const replacementScript = document.createElement('script');
    replacementScript.id = 'tt-microsoft-clarity';
    document.head.appendChild(replacementScript);
    analyticsConsentState.value = {
      status: 'accepted',
      updatedAt: '2026-03-09T00:02:00.000Z',
    };
    await flushClaritySync();
    expect(replacementScript).toBeTruthy();
    replacementScript.dispatchEvent(new Event('load'));
    await flushClaritySync();
    expect(replacementScript.dataset.loaded).toBe('true');
    expect((window.clarity as ClarityApi).q).toContainEqual(clarityAcceptedConsent);
  });
  it('creates a new script after a failed load when no replacement script already exists', async () => {
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
    const originalScript = document.createElement('script');
    originalScript.id = 'tt-microsoft-clarity';
    document.head.appendChild(originalScript);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    originalScript.dispatchEvent(new Event('error'));
    await flushClaritySync();
    expect(document.getElementById('tt-microsoft-clarity')).toBeNull();
    analyticsConsentState.value = {
      status: 'declined',
      updatedAt: '2026-03-09T00:01:00.000Z',
    };
    await flushClaritySync();
    analyticsConsentState.value = {
      status: 'accepted',
      updatedAt: '2026-03-09T00:02:00.000Z',
    };
    await flushClaritySync();
    const replacementScript = document.getElementById(
      'tt-microsoft-clarity'
    ) as HTMLScriptElement | null;
    expect(replacementScript).toBeTruthy();
    expect(replacementScript?.src).toContain('clarity.ms/tag/abcdef1234');
  });
  it('does not initialize when project ID format is invalid', async () => {
    runtimeConfig.public.microsoftClarityProjectId = 'invalid-id-format';
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    expect(document.getElementById('tt-microsoft-clarity')).toBeNull();
    expect(window.clarity).toBeUndefined();
  });
  it('skips initialization when analytics runtime is disabled', async () => {
    shouldEnableAnalyticsIntegrations.mockReturnValueOnce(false);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    expect(document.getElementById('tt-microsoft-clarity')).toBeNull();
    expect(window.clarity).toBeUndefined();
  });
});
