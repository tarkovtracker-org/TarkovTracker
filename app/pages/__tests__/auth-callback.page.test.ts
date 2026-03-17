// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthCallbackPage from '@/pages/auth/callback.vue';
const { clearPendingLoginProviderMock, navigateToMock, trackLoginSucceededMock } = vi.hoisted(
  () => ({
    clearPendingLoginProviderMock: vi.fn(),
    navigateToMock: vi.fn(() => Promise.resolve()),
    trackLoginSucceededMock: vi.fn(),
  })
);
const mockState = {
  isLoggedIn: false,
  redirect: '/dashboard',
};
mockNuxtImport('navigateTo', () => navigateToMock);
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    ready: vi.fn(() => Promise.resolve()),
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
vi.mock('@/composables/useProductAnalytics', () => ({
  useProductAnalytics: () => ({
    clearPendingLoginProvider: clearPendingLoginProviderMock,
    trackLoginSucceeded: trackLoginSucceededMock,
  }),
}));
describe('auth callback page', () => {
  beforeEach(() => {
    mockState.isLoggedIn = false;
    mockState.redirect = '/dashboard';
    clearPendingLoginProviderMock.mockClear();
    navigateToMock.mockClear();
    trackLoginSucceededMock.mockClear();
    vi.useFakeTimers();
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: null,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
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
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(trackLoginSucceededMock).not.toHaveBeenCalled();
    expect(clearPendingLoginProviderMock).toHaveBeenCalledTimes(1);
    expect(navigateToMock).toHaveBeenCalledWith('/dashboard', { replace: true });
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
  });
});
