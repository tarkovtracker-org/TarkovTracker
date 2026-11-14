// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthCallbackPage from '@/pages/auth/callback.vue';
import { SupabaseCallbackPendingError } from '@/utils/supabaseReadiness';
import { createDeferred } from '@/utils/test-helpers';
const {
  clearPendingLoginProviderMock,
  navigateToMock,
  readyMock,
  toastAddMock,
  trackLoginSucceededMock,
} = vi.hoisted(() => ({
  clearPendingLoginProviderMock: vi.fn(),
  navigateToMock: vi.fn(() => Promise.resolve()),
  readyMock: vi.fn(() => Promise.resolve()),
  toastAddMock: vi.fn(),
  trackLoginSucceededMock: vi.fn(),
}));
const mockState = reactive({
  isLoggedIn: false,
  redirect: '/dashboard',
});
mockNuxtImport('navigateTo', () => navigateToMock);
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => key,
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    ready: readyMock,
    user: {
      get loggedIn() {
        return mockState.isLoggedIn;
      },
    },
  },
}));
mockNuxtImport('useRoute', () => () => ({
  query: {
    get redirect() {
      return mockState.redirect;
    },
  },
}));
mockNuxtImport('useToast', () => () => ({
  add: toastAddMock,
}));
vi.mock('@/composables/useProductAnalytics', () => ({
  useProductAnalytics: () => ({
    clearPendingLoginProvider: clearPendingLoginProviderMock,
    trackLoginSucceeded: trackLoginSucceededMock,
  }),
}));
describe('auth callback page', () => {
  const mountPage = () =>
    mount(AuthCallbackPage, {
      global: { stubs: { UCard: { template: '<div><slot /></div>' }, UIcon: true } },
    });
  beforeEach(() => {
    mockState.isLoggedIn = false;
    mockState.redirect = '/dashboard';
    clearPendingLoginProviderMock.mockClear();
    navigateToMock.mockClear();
    toastAddMock.mockClear();
    trackLoginSucceededMock.mockClear();
    readyMock.mockReset().mockResolvedValue(undefined);
    vi.useFakeTimers();
    vi.stubGlobal('close', vi.fn());
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: null,
    });
    window.history.replaceState(null, '', '/auth/callback');
  });
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });
  it.each([false, true])(
    'accepts pending callback completion during the grace period with popup=%s',
    async (popup) => {
      const completion = createDeferred<undefined>();
      const postMessage = vi.fn();
      if (popup)
        Object.defineProperty(window, 'opener', {
          configurable: true,
          value: { closed: false, postMessage },
        });
      readyMock
        .mockRejectedValueOnce(new SupabaseCallbackPendingError())
        .mockReturnValueOnce(completion.promise);
      mountPage();
      await vi.advanceTimersByTimeAsync(500);
      await flushPromises();
      expect(readyMock).toHaveBeenCalledTimes(2);
      expect(navigateToMock).not.toHaveBeenCalled();
      expect(postMessage).not.toHaveBeenCalled();
      expect(window.close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1500);
      mockState.isLoggedIn = true;
      completion.resolve(undefined);
      await flushPromises();
      expect(trackLoginSucceededMock).toHaveBeenCalledTimes(1);
      if (popup) {
        expect(postMessage).toHaveBeenCalledWith({ type: 'OAUTH_SUCCESS' }, window.location.origin);
        await vi.advanceTimersByTimeAsync(200);
        expect(window.close).toHaveBeenCalledTimes(1);
      } else {
        expect(navigateToMock).toHaveBeenCalledWith('/dashboard', { replace: true });
      }
    }
  );
  it('does not accept a restored session while callback readiness stays pending', async () => {
    mockState.isLoggedIn = true;
    const completion = createDeferred<undefined>();
    readyMock
      .mockRejectedValueOnce(new SupabaseCallbackPendingError())
      .mockReturnValueOnce(completion.promise);
    mountPage();
    await vi.advanceTimersByTimeAsync(500);
    expect(navigateToMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4999);
    expect(navigateToMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(navigateToMock).toHaveBeenCalledWith(
      { path: '/login', query: { redirect: '/dashboard' } },
      { replace: true }
    );
    expect(trackLoginSucceededMock).not.toHaveBeenCalled();
    expect(clearPendingLoginProviderMock).toHaveBeenCalledTimes(1);
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'OAUTH_SESSION_TIMEOUT · Session was not established after OAuth callback.',
      })
    );
    completion.resolve(undefined);
    await flushPromises();
    expect(navigateToMock).toHaveBeenCalledTimes(1);
    expect(trackLoginSucceededMock).not.toHaveBeenCalled();
  });
  it('reports an actual exchange failure during the pending grace period', async () => {
    const completion = createDeferred<undefined>();
    readyMock
      .mockRejectedValueOnce(new SupabaseCallbackPendingError())
      .mockReturnValueOnce(completion.promise);
    mountPage();
    await vi.advanceTimersByTimeAsync(500);
    expect(toastAddMock).not.toHaveBeenCalled();
    completion.reject(new Error('invalid_grant'));
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'invalid_grant' })
    );
    expect(trackLoginSucceededMock).not.toHaveBeenCalled();
  });
  it('does not track an existing session as a failed callback success', async () => {
    mockState.isLoggedIn = true;
    readyMock.mockRejectedValueOnce(new Error('invalid_grant'));
    mountPage();
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(trackLoginSucceededMock).not.toHaveBeenCalled();
    expect(clearPendingLoginProviderMock).toHaveBeenCalledTimes(1);
  });
  it('does not track login success when no session was established', async () => {
    mount(AuthCallbackPage, {
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UIcon: true,
        },
      },
    });
    await vi.advanceTimersByTimeAsync(5500);
    await flushPromises();
    expect(trackLoginSucceededMock).not.toHaveBeenCalled();
    expect(clearPendingLoginProviderMock).toHaveBeenCalledTimes(1);
    expect(navigateToMock).toHaveBeenCalledWith(
      {
        path: '/login',
        query: { redirect: '/dashboard' },
      },
      { replace: true }
    );
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'page.login.error_title',
      })
    );
  });
  it('tracks login success after Supabase reports the user is logged in', async () => {
    mockState.isLoggedIn = true;
    mockState.redirect = '/tasks?filter=active';
    mount(AuthCallbackPage, {
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UIcon: true,
        },
      },
    });
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(trackLoginSucceededMock).toHaveBeenCalledTimes(1);
    expect(clearPendingLoginProviderMock).not.toHaveBeenCalled();
    expect(navigateToMock).toHaveBeenCalledWith('/tasks?filter=active', { replace: true });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'page.login.success_title',
      })
    );
  });
  it('posts an oauth error to the opener when the popup never gets a session', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: {
        closed: false,
        postMessage,
      },
    });
    mount(AuthCallbackPage, {
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UIcon: true,
        },
      },
    });
    await vi.advanceTimersByTimeAsync(5700);
    await flushPromises();
    expect(trackLoginSucceededMock).not.toHaveBeenCalled();
    expect(clearPendingLoginProviderMock).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'OAUTH_ERROR',
        description: 'OAUTH_SESSION_TIMEOUT · Session was not established after OAuth callback.',
        report: expect.stringContaining('Code: OAUTH_SESSION_TIMEOUT'),
      }),
      window.location.origin
    );
    expect(window.close).toHaveBeenCalledTimes(1);
  });
  it('surfaces callback error params immediately without waiting for a timeout', async () => {
    window.history.replaceState(
      null,
      '',
      '/auth/callback?error=access_denied&error_code=discord_oauth_denied&error_description=User%20denied%20access'
    );
    mount(AuthCallbackPage, {
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UIcon: true,
        },
      },
    });
    await flushPromises();
    expect(trackLoginSucceededMock).not.toHaveBeenCalled();
    expect(clearPendingLoginProviderMock).toHaveBeenCalledTimes(1);
    expect(navigateToMock).toHaveBeenCalledWith(
      {
        path: '/login',
        query: { redirect: '/dashboard' },
      },
      { replace: true }
    );
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'discord_oauth_denied · User denied access',
        title: 'page.login.error_title',
      })
    );
  });
  it('waits for a delayed session before posting popup success', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: {
        closed: false,
        postMessage,
      },
    });
    setTimeout(() => {
      mockState.isLoggedIn = true;
    }, 1200);
    mount(AuthCallbackPage, {
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UIcon: true,
        },
      },
    });
    await vi.advanceTimersByTimeAsync(1700);
    await flushPromises();
    expect(trackLoginSucceededMock).toHaveBeenCalledTimes(1);
    expect(clearPendingLoginProviderMock).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'OAUTH_SUCCESS' }, window.location.origin);
  });
});
