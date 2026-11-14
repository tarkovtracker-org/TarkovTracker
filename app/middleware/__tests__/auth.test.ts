// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import authMiddleware from '@/middleware/auth';
import { SupabaseCallbackPendingError } from '@/utils/supabaseReadiness';
const { abortNavigationMock, loggerMock, navigateToMock, readyMock, state } = vi.hoisted(() => ({
  abortNavigationMock: vi.fn(() => false as const),
  loggerMock: {
    error: vi.fn(),
  },
  navigateToMock: vi.fn((path: string) => path),
  readyMock: vi.fn().mockResolvedValue(undefined),
  state: {
    user: {
      email: null as string | null,
      id: null as string | null,
      loggedIn: false,
    },
  },
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    ready: readyMock,
    user: state.user,
  },
}));
mockNuxtImport('navigateTo', () => navigateToMock);
mockNuxtImport('abortNavigation', () => abortNavigationMock);
mockNuxtImport(
  'defineNuxtRouteMiddleware',
  () => (handler: (...args: unknown[]) => unknown) => handler
);
vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));
describe('auth middleware', () => {
  const runMiddleware = () =>
    Promise.resolve(
      authMiddleware(
        {} as Parameters<typeof authMiddleware>[0],
        {} as Parameters<typeof authMiddleware>[1]
      )
    );
  beforeEach(() => {
    vi.clearAllMocks();
    readyMock.mockReset();
    readyMock.mockResolvedValue(undefined);
    state.user.loggedIn = false;
    state.user.id = null;
    state.user.email = null;
  });
  it('redirects unauthenticated users to /login', async () => {
    const result = await runMiddleware();
    expect(navigateToMock).toHaveBeenCalledWith('/login');
    expect(result).toBe('/login');
  });
  it('allows authenticated users', async () => {
    state.user.loggedIn = true;
    const result = await runMiddleware();
    expect(navigateToMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
  it.each([false, true])(
    'cancels pending-callback navigation with loggedIn=%s',
    async (loggedIn) => {
      state.user.loggedIn = loggedIn;
      state.user.id = loggedIn ? 'user-1' : null;
      state.user.email = loggedIn ? 'user@example.com' : null;
      const previousUser = { ...state.user };
      window.history.replaceState(null, '', '/settings?discord_linked=1&code=pending#account');
      readyMock.mockRejectedValueOnce(new SupabaseCallbackPendingError());
      try {
        expect(await runMiddleware()).toBe(false);
        expect(abortNavigationMock).toHaveBeenCalledTimes(1);
        expect(navigateToMock).not.toHaveBeenCalled();
        expect(state.user).toEqual(previousUser);
        expect(window.location.search).toBe('?discord_linked=1&code=pending');
        expect(window.location.hash).toBe('#account');
      } finally {
        window.history.replaceState(null, '', '/');
      }
    }
  );
  it('redirects to /login when Supabase bootstrap fails', async () => {
    const bootstrapError = new Error('bootstrap failed');
    state.user.loggedIn = true;
    state.user.id = 'user-1';
    state.user.email = 'user@example.com';
    readyMock.mockRejectedValueOnce(bootstrapError);
    const result = await runMiddleware();
    expect(navigateToMock).toHaveBeenCalledWith('/login');
    expect(result).toBe('/login');
    expect(state.user.loggedIn).toBe(false);
    expect(state.user.id).toBeNull();
    expect(state.user.email).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Auth middleware: Supabase bootstrap failed',
      bootstrapError
    );
  });
});
