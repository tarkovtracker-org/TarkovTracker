// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import adminMiddleware from '@/middleware/admin';
const {
  getSessionMock,
  hydrateUserFromSessionMock,
  loggerMock,
  navigateToMock,
  readyMock,
  state,
  useSystemStoreWithSupabaseMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hydrateUserFromSessionMock: vi.fn(),
  loggerMock: {
    error: vi.fn(),
    warn: vi.fn(),
  },
  navigateToMock: vi.fn((path: string) => path),
  readyMock: vi.fn().mockResolvedValue(undefined),
  state: {
    hasInitiallyLoaded: { value: true } as { value: boolean },
    isAdmin: true,
    sessionUser: null as {
      email?: string | null;
      id: string;
    } | null,
    user: {
      email: null as string | null,
      id: null as string | null,
      loggedIn: false,
    },
  },
  useSystemStoreWithSupabaseMock: vi.fn(),
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    ready: readyMock,
    user: state.user,
    client: {
      auth: {
        getSession: getSessionMock,
      },
    },
  },
}));
mockNuxtImport('useRuntimeConfig', () => () => ({
  public: {
    adminWatchTimeoutMs: '5',
  },
}));
mockNuxtImport('navigateTo', () => navigateToMock);
mockNuxtImport(
  'defineNuxtRouteMiddleware',
  () => (handler: (...args: unknown[]) => unknown) => handler
);
vi.mock('@/stores/useSystemStore', () => ({
  useSystemStoreWithSupabase: useSystemStoreWithSupabaseMock,
}));
vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));
vi.mock('@/utils/userHydration', () => ({
  hydrateUserFromSession: hydrateUserFromSessionMock,
}));
describe('admin middleware', () => {
  const runMiddleware = () =>
    Promise.resolve(
      adminMiddleware(
        {} as Parameters<typeof adminMiddleware>[0],
        {} as Parameters<typeof adminMiddleware>[1]
      )
    );
  beforeEach(() => {
    vi.clearAllMocks();
    readyMock.mockReset();
    readyMock.mockResolvedValue(undefined);
    state.hasInitiallyLoaded = ref(true);
    state.isAdmin = true;
    state.sessionUser = null;
    state.user.loggedIn = false;
    state.user.id = null;
    state.user.email = null;
    getSessionMock.mockResolvedValue({
      data: {
        session: state.sessionUser ? { user: state.sessionUser } : null,
      },
      error: null,
    });
    hydrateUserFromSessionMock.mockImplementation((user, sessionUser) => {
      user.loggedIn = !!sessionUser;
      user.id = sessionUser?.id ?? null;
      user.email = sessionUser?.email ?? null;
    });
    useSystemStoreWithSupabaseMock.mockImplementation(() => ({
      hasInitiallyLoaded: state.hasInitiallyLoaded,
      systemStore: {
        $state: {
          get is_admin() {
            return state.isAdmin;
          },
        },
      },
    }));
  });
  it('waits for Supabase hydration before authenticating admin routes', async () => {
    state.sessionUser = { id: 'admin-1', email: 'admin@example.com' };
    getSessionMock.mockResolvedValue({
      data: {
        session: { user: state.sessionUser },
      },
      error: null,
    });
    const result = await runMiddleware();
    expect(readyMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(hydrateUserFromSessionMock).toHaveBeenCalledWith(state.user, state.sessionUser);
    expect(navigateToMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
  it('redirects authenticated non-admin users to /', async () => {
    state.isAdmin = false;
    state.sessionUser = { id: 'user-1', email: 'user@example.com' };
    getSessionMock.mockResolvedValue({
      data: {
        session: { user: state.sessionUser },
      },
      error: null,
    });
    const result = await runMiddleware();
    expect(readyMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(hydrateUserFromSessionMock).toHaveBeenCalledWith(state.user, state.sessionUser);
    expect(navigateToMock).toHaveBeenCalledWith('/');
    expect(result).toBe('/');
  });
  it('redirects to / when admin data never loads before timeout', async () => {
    vi.useFakeTimers();
    state.hasInitiallyLoaded.value = false;
    state.sessionUser = { id: 'admin-1', email: 'admin@example.com' };
    getSessionMock.mockResolvedValue({
      data: {
        session: { user: state.sessionUser },
      },
      error: null,
    });
    try {
      const resultPromise = runMiddleware();
      await vi.advanceTimersByTimeAsync(5);
      const result = await resultPromise;
      expect(readyMock).toHaveBeenCalledTimes(1);
      expect(getSessionMock).toHaveBeenCalledTimes(1);
      expect(hydrateUserFromSessionMock).toHaveBeenCalledWith(state.user, state.sessionUser);
      expect(navigateToMock).toHaveBeenCalledWith('/');
      expect(result).toBe('/');
    } finally {
      vi.useRealTimers();
    }
  });
  it('redirects to /login when session retrieval fails', async () => {
    const sessionError = new Error('session failed');
    getSessionMock.mockResolvedValue({
      data: {
        session: null,
      },
      error: sessionError,
    });
    const result = await runMiddleware();
    expect(readyMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(hydrateUserFromSessionMock).not.toHaveBeenCalled();
    expect(navigateToMock).toHaveBeenCalledWith('/login');
    expect(result).toBe('/login');
  });
  it('redirects to /login when Supabase bootstrap fails', async () => {
    const bootstrapError = new Error('bootstrap failed');
    state.user.loggedIn = true;
    state.user.id = 'admin-1';
    state.user.email = 'admin@example.com';
    readyMock.mockRejectedValueOnce(bootstrapError);
    const result = await runMiddleware();
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(navigateToMock).toHaveBeenCalledWith('/login');
    expect(result).toBe('/login');
    expect(state.user.loggedIn).toBe(false);
    expect(state.user.id).toBeNull();
    expect(state.user.email).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Admin middleware: Supabase bootstrap failed',
      bootstrapError
    );
  });
});
