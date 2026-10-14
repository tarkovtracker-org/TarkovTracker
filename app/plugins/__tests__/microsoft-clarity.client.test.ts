// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createMemoryHistory, createRouter, type NavigationGuard } from 'vue-router';
import type { AnalyticsConsentState } from '@/composables/useAnalyticsConsent';
type ClarityApi = ((...args: unknown[]) => void) & { q?: unknown[][] };
const { beforeEachGuard, externalNavigate, routerOverride } = vi.hoisted(() => ({
  beforeEachGuard: vi.fn(),
  routerOverride: { current: null as import('vue-router').Router | null },
  externalNavigate: vi.fn(() => Promise.resolve()),
}));
mockNuxtImport('useRouter', () => () => routerOverride.current ?? { beforeEach: beforeEachGuard });
mockNuxtImport('navigateTo', () => externalNavigate);
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
    routerOverride.current = null;
    vi.stubEnv('MODE', 'development');
    window.happyDOM.setURL('https://tarkovtracker.org/tasks');
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
    vi.spyOn(window.location, 'assign').mockImplementation(() => {});
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
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    delete window.clarity;
  });
  it.each([
    '/oauth',
    '/oauth/authorize?client_id=private-sentinel',
    '/%6Fauth/callback',
    '/OAUTH/callback',
    '/auth/callback?code=private-sentinel',
    '/%61uth/%63allback',
    '/AUTH/CALLBACK',
    '/settings?discord_linked=1&code=private-sentinel#account',
    '/tasks?state=private-sentinel',
    '/settings?discord_linked=1&error=access_denied&state=private-sentinel',
    '/settings?%63ode=private-sentinel',
    '/tasks#access_token=private-sentinel&refresh_token=private-sentinel',
  ])('skips Clarity entirely on initial OAuth URL %s', async (path) => {
    window.happyDOM.setURL(`https://tarkovtracker.org${path}`);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    expect(document.getElementById('tt-microsoft-clarity')).toBeNull();
    expect(window.clarity).toBeUndefined();
  });
  it.each([
    '/oauth/authorize?client_id=private-sentinel',
    '/auth/callback?code=private-sentinel',
    '/settings?discord_linked=1&code=private-sentinel#account',
    '/tasks#access_token=private-sentinel',
  ])('allows Nuxt forced initial router replacement on skipped document %s', async (fullPath) => {
    window.happyDOM.setURL(`https://tarkovtracker.org${fullPath}`);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    });
    routerOverride.current = router;
    const resolvedInitialRoute = router.resolve(fullPath);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    // Nuxt's app:created hook forces this replace after client plugins have run.
    const failure = await router.replace({ ...resolvedInitialRoute, force: true });
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(failure).toBeUndefined();
    expect(router.currentRoute.value.fullPath).toBe(fullPath);
    expect(document.getElementById('tt-microsoft-clarity')).toBeNull();
    expect(window.clarity).toBeUndefined();
  });
  it('skips Clarity when the initial pathname has malformed percent encoding', async () => {
    window.happyDOM.setURL('https://tarkovtracker.org/%E0%A4%A?client_id=private-sentinel');
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    expect(document.getElementById('tt-microsoft-clarity')).toBeNull();
    expect(window.clarity).toBeUndefined();
  });
  it('skips Clarity when the document referrer cannot be parsed', async () => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://[private-sentinel');
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    expect(document.getElementById('tt-microsoft-clarity')).toBeNull();
    expect(window.clarity).toBeUndefined();
  });
  it.each([
    '/oauth/authorize?client_id=private-sentinel',
    '/auth/callback?code=private-sentinel',
    '/%61uth/%63allback',
    '/AUTH/CALLBACK',
    '/settings?discord_linked=1&code=private-sentinel',
    '/tasks?state=private-sentinel',
    '/settings?discord_linked=1&error=access_denied&state=private-sentinel',
  ])('skips Clarity when the same-origin referrer contains sensitive URL %s', async (path) => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(`https://tarkovtracker.org${path}`);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    expect(document.getElementById('tt-microsoft-clarity')).toBeNull();
    expect(window.clarity).toBeUndefined();
  });
  it.each([
    '/oauth/authorize?client_id=private-sentinel',
    '/%6Fauth/callback',
    '/OAUTH/callback',
    '/auth/callback?code=private-sentinel',
    '/%61uth/%63allback',
    '/AUTH/CALLBACK',
    '/settings?discord_linked=1&code=private-sentinel#account',
    '/tasks?state=private-sentinel',
    '/settings?discord_linked=1&error=access_denied&state=private-sentinel',
  ])('leaves the recorded URL unchanged while externally navigating to %s', async (fullPath) => {
    const script = document.createElement('script');
    script.id = 'tt-microsoft-clarity';
    document.head.appendChild(script);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    const guard = beforeEachGuard.mock.calls[0]?.[0] as NavigationGuard;
    expect(guard).toBeTypeOf('function');
    const oldUrl = window.location.href;
    const result = await guard(
      { path: fullPath.split('?')[0], fullPath } as Parameters<NavigationGuard>[0],
      {} as Parameters<NavigationGuard>[1],
      vi.fn()
    );
    expect(window.location.assign).toHaveBeenCalledWith(fullPath);
    expect(externalNavigate).not.toHaveBeenCalled();
    expect(result).toBe(false);
    expect(window.location.href).toBe(oldUrl);
  });
  it('forces a new document for credential fragment navigation on the current path', async () => {
    const script = document.createElement('script');
    script.id = 'tt-microsoft-clarity';
    document.head.appendChild(script);
    const assign = vi.mocked(window.location.assign);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    const guard = beforeEachGuard.mock.calls[0]?.[0] as NavigationGuard;
    const oldUrl = window.location.href;
    const result = await guard(
      {
        path: '/tasks',
        fullPath: '/tasks#access_token=private-sentinel',
      } as Parameters<NavigationGuard>[0],
      {} as Parameters<NavigationGuard>[1],
      vi.fn()
    );
    expect(result).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);
    const destination = new URL(assign.mock.calls[0]![0], window.location.origin);
    expect(destination.pathname).toBe('/tasks');
    expect(destination.searchParams.has('_tt_retry')).toBe(true);
    expect(destination.search).not.toBe(window.location.search);
    expect(destination.hash).toBe('#access_token=private-sentinel');
    expect(window.location.href).toBe(oldUrl);
  });
  it.each([
    'https://other.example/oauth/authorize',
    'https://tarkovtracker.org/tasks',
    'https://tarkovtracker.org/oauth-guide',
  ])('allows Clarity for a benign referrer %s', async (referrer) => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(referrer);
    const script = document.createElement('script');
    script.id = 'tt-microsoft-clarity';
    document.head.appendChild(script);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushClaritySync();
    expect(window.clarity).toBeTypeOf('function');
  });
  it.each([
    '/tasks?view=maps&trader=prapor',
    '/settings?discord_linked=1#account',
    '/auth/callback-guide',
  ])('preserves SPA navigation for ordinary route %s', async (fullPath) => {
    const script = document.createElement('script');
    script.id = 'tt-microsoft-clarity';
    document.head.appendChild(script);
    const plugin = (await import('@/plugins/06.microsoft-clarity.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    const guard = beforeEachGuard.mock.calls[0]?.[0] as NavigationGuard;
    expect(guard).toBeTypeOf('function');
    expect(
      await guard(
        { path: fullPath.split('?')[0], fullPath } as Parameters<NavigationGuard>[0],
        {} as Parameters<NavigationGuard>[1],
        vi.fn()
      )
    ).toBeUndefined();
    expect(externalNavigate).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
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
