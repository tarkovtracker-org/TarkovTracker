// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { createDeferred } from '@/utils/test-helpers';
import type { SupabasePlugin } from '@/types/supabase-plugin';
const runtimeConfig = {
  public: {
    supabaseAnonKey: 'test-anon-key',
    supabaseUrl: 'https://test.supabase.co',
  },
};
const { loggerMock, mockCreateClient } = vi.hoisted(() => ({
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  mockCreateClient: vi.fn(),
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));
vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));
type MockAuthStateChangeCallback = (
  event: string,
  session: { user?: { id?: string } } | null
) => void;
type SupabasePluginProvide = {
  provide: {
    supabase: SupabasePlugin;
  };
};
// flushPlugin calls flushPromises twice to drain nested microtasks/promises from plugin lifecycle work.
const flushPlugin = async () => {
  await flushPromises();
  await flushPromises();
};
const createSession = (userId: string | null) => {
  if (!userId) {
    return null;
  }
  return {
    user: {
      app_metadata: {},
      id: userId,
      user_metadata: {},
    },
  };
};
const createClientMock = (initialUserId: string) => {
  let authStateChangeCallback: MockAuthStateChangeCallback | null = null;
  const signInWithOAuth = vi.fn().mockResolvedValue({
    data: {
      provider: 'github',
      url: null,
    },
    error: null,
  });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  mockCreateClient.mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: createSession(initialUserId),
        },
      }),
      onAuthStateChange: vi.fn((callback: MockAuthStateChangeCallback) => {
        authStateChangeCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        };
      }),
      signInWithOAuth,
      signOut,
    },
  });
  return {
    getAuthStateChangeCallback: () => authStateChangeCallback,
    signInWithOAuth,
    signOut,
  };
};
describe('supabase plugin', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    runtimeConfig.public.supabaseAnonKey = 'test-anon-key';
    runtimeConfig.public.supabaseUrl = 'https://test.supabase.co';
    localStorage.setItem('sb-test-auth-token', 'token');
    localStorage.setItem(STORAGE_KEYS.progress, 'progress-state');
    localStorage.setItem(STORAGE_KEYS.preferences, 'preferences-state');
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  it('waits for stored-session hydration before setup resolves', async () => {
    const sessionDeferred = createDeferred<{
      data: { session: ReturnType<typeof createSession> };
    }>();
    mockCreateClient.mockReturnValue({
      auth: {
        getSession: vi.fn(() => sessionDeferred.promise),
        onAuthStateChange: vi.fn(() => ({
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        })),
        signInWithOAuth: vi.fn(),
        signOut: vi.fn(),
      },
    });
    const plugin = (await import('@/plugins/supabase.client')).default;
    let resolved = false;
    const setupPromise = Promise.resolve(
      plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])
    ).then((value) => {
      resolved = true;
      return value;
    });
    await flushPlugin();
    expect(resolved).toBe(false);
    sessionDeferred.resolve({
      data: {
        session: createSession('user-1'),
      },
    });
    const result = (await setupPromise) as SupabasePluginProvide | undefined;
    expect(result?.provide.supabase.user.id).toBe('user-1');
    expect(result?.provide.supabase.user.loggedIn).toBe(true);
  });
  it('initializes auth listeners in background without a stored session', async () => {
    localStorage.removeItem('sb-test-auth-token');
    const sessionDeferred = createDeferred<{
      data: { session: ReturnType<typeof createSession> };
    }>();
    let authStateChangeCallback: MockAuthStateChangeCallback | null = null;
    mockCreateClient.mockReturnValue({
      auth: {
        getSession: vi.fn(() => sessionDeferred.promise),
        onAuthStateChange: vi.fn((callback: MockAuthStateChangeCallback) => {
          authStateChangeCallback = callback;
          return {
            data: {
              subscription: {
                unsubscribe: vi.fn(),
              },
            },
          };
        }),
        signInWithOAuth: vi.fn(),
        signOut: vi.fn(),
      },
    });
    const plugin = (await import('@/plugins/supabase.client')).default;
    let resolved = false;
    const setupPromise = Promise.resolve(
      plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])
    ).then((value) => {
      resolved = true;
      return value;
    });
    await flushPlugin();
    expect(resolved).toBe(true);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const result = (await setupPromise) as SupabasePluginProvide | undefined;
    expect(result?.provide.supabase.user.loggedIn).toBe(false);
    sessionDeferred.resolve({
      data: {
        session: createSession(null),
      },
    });
    await flushPlugin();
    const callback = authStateChangeCallback as MockAuthStateChangeCallback | null;
    expect(typeof callback).toBe('function');
    if (typeof callback !== 'function') {
      throw new Error('Expected auth state change callback');
    }
    callback('SIGNED_IN', createSession('user-2'));
    await flushPlugin();
    expect(result?.provide.supabase.user.id).toBe('user-2');
    expect(result?.provide.supabase.user.loggedIn).toBe(true);
  });
  it('preserves scoped local state during auth user switches', async () => {
    const { getAuthStateChangeCallback, signInWithOAuth } = createClientMock('user-1');
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      | SupabasePluginProvide
      | undefined;
    await flushPlugin();
    await result?.provide.supabase.ready();
    await result?.provide.supabase.signInWithOAuth('github', {
      skipBrowserRedirect: true,
    });
    const authStateChangeCallback =
      getAuthStateChangeCallback() as MockAuthStateChangeCallback | null;
    expect(typeof authStateChangeCallback).toBe('function');
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    if (typeof authStateChangeCallback !== 'function') {
      throw new Error('Expected auth state change callback');
    }
    authStateChangeCallback('SIGNED_IN', createSession('user-2'));
    await flushPlugin();
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe('progress-state');
    expect(localStorage.getItem(STORAGE_KEYS.preferences)).toBe('preferences-state');
  });
  it('preserves scoped local state after signOut', async () => {
    const { signOut } = createClientMock('user-1');
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      | SupabasePluginProvide
      | undefined;
    await flushPlugin();
    await result?.provide.supabase.ready();
    await result?.provide.supabase.signOut();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe('progress-state');
    expect(localStorage.getItem(STORAGE_KEYS.preferences)).toBe('preferences-state');
  });
  it('rejects ready when client initialization fails', async () => {
    const initError = new Error('create client failed');
    localStorage.removeItem('sb-test-auth-token');
    mockCreateClient.mockImplementation(() => {
      throw initError;
    });
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      | SupabasePluginProvide
      | undefined;
    await expect(result?.provide.supabase.ready()).rejects.toThrow('create client failed');
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[Supabase] Failed to initialize client',
      initError
    );
  });
});
