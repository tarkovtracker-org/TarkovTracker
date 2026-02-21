// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import authMiddleware from '@/middleware/auth';
const { mockState, navigateToMock } = vi.hoisted(() => ({
  mockState: {
    isLoggedIn: false,
  },
  navigateToMock: vi.fn((path: string) => path),
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: {
      get loggedIn() {
        return mockState.isLoggedIn;
      },
    },
  },
}));
mockNuxtImport('navigateTo', () => navigateToMock);
mockNuxtImport(
  'defineNuxtRouteMiddleware',
  () => (handler: (...args: unknown[]) => unknown) => handler
);
describe('auth middleware', () => {
  const runMiddleware = () =>
    authMiddleware(
      {} as Parameters<typeof authMiddleware>[0],
      {} as Parameters<typeof authMiddleware>[1]
    );
  beforeEach(() => {
    mockState.isLoggedIn = false;
    navigateToMock.mockClear();
  });
  it('redirects unauthenticated users to /login', () => {
    const result = runMiddleware();
    expect(navigateToMock).toHaveBeenCalledWith('/login');
    expect(result).toBe('/login');
  });
  it('allows authenticated users', () => {
    mockState.isLoggedIn = true;
    const result = runMiddleware();
    expect(navigateToMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});
