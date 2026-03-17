// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { OAuthProvider } from '@/composables/useOAuthLogin';
const { loggerMock, mockSignInWithOAuth } = vi.hoisted(() => ({
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  mockSignInWithOAuth: vi.fn(),
}));
const { trackLoginFailedMock, trackLoginStartedMock } = vi.hoisted(() => ({
  trackLoginFailedMock: vi.fn(),
  trackLoginStartedMock: vi.fn(),
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    signInWithOAuth: mockSignInWithOAuth,
  },
}));
vi.mock('@/composables/useProductAnalytics', () => ({
  useProductAnalytics: () => ({
    trackLoginFailed: trackLoginFailedMock,
    trackLoginStarted: trackLoginStartedMock,
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));
const createLoadingState = () =>
  ref<Record<OAuthProvider, boolean>>({
    twitch: false,
    discord: false,
    google: false,
    github: false,
  });
const buildCallbackUrl = () => 'https://tarkovtracker.test/auth/callback';
describe('useOAuthLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('keeps loading active when popup lifecycle is managed externally', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({ url: 'https://oauth.test/login' });
    const openPopupOrRedirect = vi.fn(() => true);
    const loading = createLoadingState();
    const { useOAuthLogin } = await import('@/composables/useOAuthLogin');
    const { signInWithProvider } = useOAuthLogin({
      buildCallbackUrl,
      loading,
      openPopupOrRedirect,
    });
    await signInWithProvider('discord');
    expect(mockSignInWithOAuth).toHaveBeenCalledWith('discord', {
      skipBrowserRedirect: true,
      redirectTo: 'https://tarkovtracker.test/auth/callback',
    });
    expect(trackLoginStartedMock).toHaveBeenCalledWith('discord');
    expect(openPopupOrRedirect).toHaveBeenCalledWith('https://oauth.test/login', 'discord');
    expect(loading.value.discord).toBe(true);
  });
  it('clears loading on success when no OAuth URL is returned', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({});
    const openPopupOrRedirect = vi.fn(() => true);
    const loading = createLoadingState();
    const { useOAuthLogin } = await import('@/composables/useOAuthLogin');
    const { signInWithProvider } = useOAuthLogin({
      buildCallbackUrl,
      loading,
      openPopupOrRedirect,
    });
    await signInWithProvider('google');
    expect(openPopupOrRedirect).not.toHaveBeenCalled();
    expect(loading.value.google).toBe(false);
  });
  it('clears loading when popup flow is cancelled', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({ url: 'https://oauth.test/login' });
    const openPopupOrRedirect = vi.fn(() => false);
    const loading = createLoadingState();
    const { useOAuthLogin } = await import('@/composables/useOAuthLogin');
    const { signInWithProvider } = useOAuthLogin({
      buildCallbackUrl,
      loading,
      openPopupOrRedirect,
    });
    await signInWithProvider('github');
    expect(openPopupOrRedirect).toHaveBeenCalledWith('https://oauth.test/login', 'github');
    expect(loading.value.github).toBe(false);
  });
  it('clears loading and logs when OAuth request fails', async () => {
    const oauthError = new Error('oauth failed');
    mockSignInWithOAuth.mockRejectedValueOnce(oauthError);
    const openPopupOrRedirect = vi.fn(() => true);
    const loading = createLoadingState();
    const { useOAuthLogin } = await import('@/composables/useOAuthLogin');
    const { signInWithProvider } = useOAuthLogin({
      buildCallbackUrl,
      loading,
      openPopupOrRedirect,
    });
    await signInWithProvider('twitch');
    expect(openPopupOrRedirect).not.toHaveBeenCalled();
    expect(loading.value.twitch).toBe(false);
    expect(trackLoginFailedMock).toHaveBeenCalledWith('twitch', oauthError);
    expect(loggerMock.error).toHaveBeenCalledWith('[Login] Twitch sign in error:', oauthError);
  });
});
