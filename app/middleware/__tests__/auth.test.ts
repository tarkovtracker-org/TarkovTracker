// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import authMiddleware from '@/middleware/auth';
const { loggerMock, navigateToMock, readyMock, state } = vi.hoisted(() => ({
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
