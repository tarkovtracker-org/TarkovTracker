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
const { loggerMock, mockCreateClient, offlineFallbackMock } = vi.hoisted(() => ({
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  mockCreateClient: vi.fn(),
  offlineFallbackMock: vi.fn(() => true),
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));
vi.mock('@/utils/runtimeConfig', () => ({
  shouldUseOfflineSupabaseFallback: offlineFallbackMock,
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
const stubAuthSubscription = () => ({
  data: {
    subscription: {
      unsubscribe: vi.fn(),
    },
  },
});
const mockAuthClient = (auth: Record<string, unknown>) => {
  mockCreateClient.mockReturnValue({
    auth: {
      onAuthStateChange: vi.fn(() => stubAuthSubscription()),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      ...auth,
    },
  });
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
  const removeAllChannels = vi.fn().mockResolvedValue([]);
  mockCreateClient.mockReturnValue({
    removeAllChannels,
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: createSession(initialUserId),
        },
      }),
      onAuthStateChange: vi.fn((callback: MockAuthStateChangeCallback) => {
        authStateChangeCallback = callback;
        return stubAuthSubscription();
      }),
      signInWithOAuth,
      signOut,
    },
  });
  return {
    getAuthStateChangeCallback: () => authStateChangeCallback,
    removeAllChannels,
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
    offlineFallbackMock.mockReturnValue(true);
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
    mockAuthClient({
      getSession: vi.fn(() => sessionDeferred.promise),
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
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({
        auth: {
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    );
  });
  it('bounds readiness and auth actions when the initial session read never settles', async () => {
    vi.useFakeTimers();
    try {
      const getSession = vi.fn(
        () => new Promise<{ data: { session: ReturnType<typeof createSession> } }>(() => {})
      );
      const signInWithOAuth = vi.fn().mockResolvedValue({
        data: { provider: 'github', url: null },
        error: null,
      });
      mockAuthClient({ getSession, signInWithOAuth });
      const plugin = (await import('@/plugins/supabase.client')).default;
      const setupPromise = plugin.setup?.(
        {} as Parameters<NonNullable<typeof plugin.setup>>[0]
      ) as Promise<SupabasePluginProvide | undefined>;
      await flushPlugin();
      await vi.advanceTimersByTimeAsync(8000);
      const result = await setupPromise;
      const readyPromise = result?.provide.supabase.ready();
      const signInPromise = result?.provide.supabase.signInWithOAuth('github', {
        skipBrowserRedirect: true,
      });
      await vi.advanceTimersByTimeAsync(8000);
      await expect(readyPromise).resolves.toBeNull();
      await expect(signInPromise).resolves.toEqual({ provider: 'github', url: null });
      expect(getSession).toHaveBeenCalledTimes(2);
      expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not re-hydrate the signed-out session when a slow initial read resolves late', async () => {
    vi.useFakeTimers();
    try {
      const sessionDeferred = createDeferred<{
        data: { session: ReturnType<typeof createSession> };
        error: null;
      }>();
      const authStateChangeCallbacks: MockAuthStateChangeCallback[] = [];
      const captureAuthStateChange = (callback: MockAuthStateChangeCallback) => {
        authStateChangeCallbacks.push(callback);
        return stubAuthSubscription();
      };
      const signOut = vi.fn().mockResolvedValue({ error: null });
      const removeAllChannels = vi.fn().mockResolvedValue([]);
      mockCreateClient.mockReturnValue({
        removeAllChannels,
        auth: {
          getSession: vi.fn(() => sessionDeferred.promise),
          onAuthStateChange: vi.fn(captureAuthStateChange),
          signInWithOAuth: vi.fn(),
          signOut,
        },
      });
      const plugin = (await import('@/plugins/supabase.client')).default;
      const setupPromise = plugin.setup?.(
        {} as Parameters<NonNullable<typeof plugin.setup>>[0]
      ) as Promise<SupabasePluginProvide | undefined>;
      await flushPlugin();
      // The stored-session path awaits readiness; let the boot budget elapse so
      // setup resolves while the initial getSession() is still in flight.
      await vi.advanceTimersByTimeAsync(8000);
      const result = await setupPromise;
      const supabase = result?.provide.supabase;
      expect(supabase?.user.loggedIn).toBe(false);
      // Sign out while the initial read is still pending. signOut awaits client
      // init, which is still bounded by the boot budget, so advance past it.
      const signOutPromise = supabase?.signOut();
      await vi.advanceTimersByTimeAsync(8000);
      await signOutPromise;
      expect(signOut).toHaveBeenCalledTimes(1);
      authStateChangeCallbacks.forEach((callback) => callback('SIGNED_OUT', null));
      // The slow read now resolves with the pre-sign-out session.
      sessionDeferred.resolve({ data: { session: createSession('user-1') }, error: null });
      await flushPlugin();
      expect(supabase?.user.loggedIn).toBe(false);
      expect(supabase?.user.id).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('discards a late read after an externally delivered SIGNED_OUT event', async () => {
    vi.useFakeTimers();
    try {
      const sessionDeferred = createDeferred<{
        data: { session: ReturnType<typeof createSession> };
        error: null;
      }>();
      const authStateChangeCallbacks: MockAuthStateChangeCallback[] = [];
      const captureAuthStateChange = (callback: MockAuthStateChangeCallback) => {
        authStateChangeCallbacks.push(callback);
        return stubAuthSubscription();
      };
      const removeAllChannels = vi.fn().mockResolvedValue([]);
      mockCreateClient.mockReturnValue({
        removeAllChannels,
        auth: {
          getSession: vi.fn(() => sessionDeferred.promise),
          onAuthStateChange: vi.fn(captureAuthStateChange),
          signInWithOAuth: vi.fn(),
          signOut: vi.fn().mockResolvedValue({ error: null }),
        },
      });
      const plugin = (await import('@/plugins/supabase.client')).default;
      const setupPromise = plugin.setup?.(
        {} as Parameters<NonNullable<typeof plugin.setup>>[0]
      ) as Promise<SupabasePluginProvide | undefined>;
      await flushPlugin();
      await vi.advanceTimersByTimeAsync(8000);
      const result = await setupPromise;
      const supabase = result?.provide.supabase;
      expect(supabase?.user.loggedIn).toBe(false);
      // An externally delivered sign-out (expiry, another tab, revocation)
      // arrives while the initial read is still pending. signOut() is not called.
      authStateChangeCallbacks.forEach((callback) => callback('SIGNED_OUT', null));
      sessionDeferred.resolve({ data: { session: createSession('user-1') }, error: null });
      await flushPlugin();
      expect(supabase?.user.loggedIn).toBe(false);
      expect(supabase?.user.id).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('exchanges an oauth callback code when ready is called', async () => {
    localStorage.removeItem('sb-test-auth-token');
    window.history.replaceState(null, '', '/');
    try {
      window.history.replaceState(
        null,
        '',
        '/auth/callback?code=oauth-code&sb_flow_id=flow-id&redirect=%2Ftasks'
      );
      const exchangeCodeForSession = vi.fn().mockResolvedValue({
        data: { session: createSession('user-code') },
        error: null,
      });
      const getSession = vi
        .fn()
        .mockResolvedValueOnce({
          data: { session: null },
          error: null,
        })
        .mockResolvedValue({
          data: { session: createSession('user-refreshed') },
          error: null,
        });
      mockAuthClient({
        exchangeCodeForSession,
        getSession,
      });
      const plugin = (await import('@/plugins/supabase.client')).default;
      const result = (await plugin.setup?.(
        {} as Parameters<NonNullable<typeof plugin.setup>>[0]
      )) as SupabasePluginProvide | undefined;
      await flushPlugin();
      expect(result?.provide.supabase.user.loggedIn).toBe(false);
      await result?.provide.supabase.ready();
      expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
      expect(exchangeCodeForSession).toHaveBeenCalledWith('oauth-code', { flowId: 'flow-id' });
      expect(result?.provide.supabase.user.id).toBe('user-code');
      expect(result?.provide.supabase.user.loggedIn).toBe(true);
      expect(window.location.pathname).toBe('/auth/callback');
      expect(window.location.search).toBe('?redirect=%2Ftasks');
      await result?.provide.supabase.ready();
      expect(getSession).toHaveBeenCalledTimes(2);
      expect(result?.provide.supabase.user.id).toBe('user-refreshed');
      vi.resetModules();
      const reloadedPlugin = (await import('@/plugins/supabase.client')).default;
      const reloadedResult = (await reloadedPlugin.setup?.(
        {} as Parameters<NonNullable<typeof reloadedPlugin.setup>>[0]
      )) as SupabasePluginProvide | undefined;
      await flushPlugin();
      expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
      expect(reloadedResult?.provide.supabase.user.id).toBe('user-refreshed');
      expect(mockCreateClient).toHaveBeenCalledTimes(2);
      expect(mockCreateClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key',
        expect.objectContaining({
          auth: {
            detectSessionInUrl: false,
            flowType: 'pkce',
          },
        })
      );
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
  it('surfaces the exchange error through ready without aborting setup', async () => {
    localStorage.removeItem('sb-test-auth-token');
    window.history.replaceState(null, '', '/');
    try {
      window.history.replaceState(null, '', '/auth/callback?code=expired-code');
      const exchangeError = new Error('invalid_grant');
      const exchangeCodeForSession = vi.fn().mockResolvedValue({
        data: { session: null },
        error: exchangeError,
      });
      const getSession = vi
        .fn()
        .mockResolvedValueOnce({ data: { session: null }, error: null })
        .mockResolvedValue({
          data: { session: createSession('user-after-retry') },
          error: null,
        });
      mockAuthClient({
        exchangeCodeForSession,
        getSession,
      });
      const plugin = (await import('@/plugins/supabase.client')).default;
      const result = (await plugin.setup?.(
        {} as Parameters<NonNullable<typeof plugin.setup>>[0]
      )) as SupabasePluginProvide | undefined;
      await flushPlugin();
      await expect(result?.provide.supabase.ready()).rejects.toThrow('invalid_grant');
      expect(window.location.search).toBe('?code=expired-code');
      expect(result?.provide.supabase.user.loggedIn).toBe(false);
      await expect(result?.provide.supabase.ready()).resolves.toMatchObject({
        user: { id: 'user-after-retry' },
      });
      expect(getSession).toHaveBeenCalledTimes(2);
      expect(result?.provide.supabase.user.id).toBe('user-after-retry');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
  it('ignores a team invite code outside the auth callback route', async () => {
    localStorage.removeItem('sb-test-auth-token');
    window.history.replaceState(null, '', '/');
    try {
      window.history.replaceState(null, '', '/team?team=team-1&code=invite-code');
      const exchangeCodeForSession = vi.fn();
      const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
      mockAuthClient({
        exchangeCodeForSession,
        getSession,
      });
      const plugin = (await import('@/plugins/supabase.client')).default;
      const result = (await plugin.setup?.(
        {} as Parameters<NonNullable<typeof plugin.setup>>[0]
      )) as SupabasePluginProvide | undefined;
      await flushPlugin();
      await result?.provide.supabase.ready();
      expect(exchangeCodeForSession).not.toHaveBeenCalled();
      expect(mockCreateClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key',
        expect.objectContaining({
          auth: {
            detectSessionInUrl: false,
            flowType: 'pkce',
          },
        })
      );
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
  it('initializes auth listeners in background without a stored session', async () => {
    localStorage.removeItem('sb-test-auth-token');
    const sessionDeferred = createDeferred<{
      data: { session: ReturnType<typeof createSession> };
    }>();
    let authStateChangeCallback: MockAuthStateChangeCallback | null = null;
    mockAuthClient({
      getSession: vi.fn(() => sessionDeferred.promise),
      onAuthStateChange: vi.fn((callback: MockAuthStateChangeCallback) => {
        authStateChangeCallback = callback;
        return stubAuthSubscription();
      }),
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
      SupabasePluginProvide | undefined;
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
  it('rehydrates the user when ready is called after a later session write', async () => {
    localStorage.removeItem('sb-test-auth-token');
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          session: createSession(null),
        },
      })
      .mockResolvedValueOnce({
        data: {
          session: createSession('user-3'),
        },
      });
    mockAuthClient({ getSession });
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      SupabasePluginProvide | undefined;
    await flushPlugin();
    expect(result?.provide.supabase.user.loggedIn).toBe(false);
    const session = await result?.provide.supabase.ready();
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(session?.user.id).toBe('user-3');
    expect(result?.provide.supabase.user.id).toBe('user-3');
    expect(result?.provide.supabase.user.loggedIn).toBe(true);
  });
  it('deduplicates concurrent ready session reads and logs failures', async () => {
    localStorage.removeItem('sb-test-auth-token');
    const sessionDeferred = createDeferred<{
      data: { session: ReturnType<typeof createSession> };
    }>();
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          session: createSession('user-1'),
        },
      })
      .mockReturnValue(sessionDeferred.promise);
    mockCreateClient.mockReturnValue({
      auth: {
        getSession,
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
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      SupabasePluginProvide | undefined;
    await flushPlugin();
    const firstReady = result?.provide.supabase.ready();
    const secondReady = result?.provide.supabase.ready();
    await flushPlugin();
    expect(getSession).toHaveBeenCalledTimes(2);
    sessionDeferred.resolve({
      data: {
        session: createSession('user-1'),
      },
    });
    await Promise.all([firstReady, secondReady]);
    expect(result?.provide.supabase.user.id).toBe('user-1');
    const readyError = new Error('ready session failed');
    getSession.mockRejectedValueOnce(readyError);
    await expect(result?.provide.supabase.ready()).rejects.toBe(readyError);
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[Supabase] Failed to read ready session',
      readyError
    );
  });
  it('preserves scoped local state after signOut', async () => {
    const { getAuthStateChangeCallback, removeAllChannels, signOut } = createClientMock('user-1');
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      SupabasePluginProvide | undefined;
    await flushPlugin();
    await result?.provide.supabase.ready();
    await result?.provide.supabase.signOut();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(removeAllChannels).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEYS.progress)).toBe('progress-state');
    expect(localStorage.getItem(STORAGE_KEYS.preferences)).toBe('preferences-state');
    getAuthStateChangeCallback()?.('SIGNED_OUT', null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(removeAllChannels).toHaveBeenCalledTimes(2);
  });
  it('logs realtime cleanup failures after signOut without rejecting', async () => {
    const cleanupError = new Error('realtime cleanup failed');
    const { removeAllChannels, signOut } = createClientMock('user-1');
    removeAllChannels.mockRejectedValue(cleanupError);
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      SupabasePluginProvide | undefined;
    await flushPlugin();
    await expect(result?.provide.supabase.signOut()).resolves.toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[Supabase] Failed to remove realtime channels after sign-out',
      cleanupError
    );
    expect(removeAllChannels).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
  it('shares client initialization between concurrent ready and oauth calls', async () => {
    localStorage.removeItem('sb-test-auth-token');
    const sessionDeferred = createDeferred<{
      data: { session: ReturnType<typeof createSession> };
    }>();
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { provider: 'github', url: null },
      error: null,
    });
    mockAuthClient({
      getSession: vi.fn(() => sessionDeferred.promise),
      signInWithOAuth,
    });
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      SupabasePluginProvide | undefined;
    const readyPromise = result?.provide.supabase.ready();
    const signInPromise = result?.provide.supabase.signInWithOAuth('github', {
      skipBrowserRedirect: true,
    });
    await flushPlugin();
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    sessionDeferred.resolve({ data: { session: null } });
    await expect(readyPromise).resolves.toBeNull();
    await expect(signInPromise).resolves.toEqual({ provider: 'github', url: null });
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
  });
  it('provides an offline stub when supabase config is missing', async () => {
    localStorage.removeItem('sb-test-auth-token');
    runtimeConfig.public.supabaseUrl = '';
    runtimeConfig.public.supabaseAnonKey = '';
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      SupabasePluginProvide | undefined;
    const supabase = result?.provide.supabase;
    expect(supabase?.isOfflineMode).toBe(true);
    expect(supabase?.user.loggedIn).toBe(false);
    expect(mockCreateClient).not.toHaveBeenCalled();
    const stubClient = supabase?.client as unknown as {
      from: (table: string) => { select?: () => unknown };
      channel: (name: string) => { subscribe: () => unknown; unsubscribe: () => Promise<string> };
      rpc: (fn: string) => Promise<{ data: null; error: null }>;
      auth: {
        getSession: () => Promise<{ data: { session: null }; error: null }>;
        exchangeCodeForSession: () => Promise<{ error: Error }>;
      };
    };
    expect(typeof stubClient.from('teams').select).toBe('function');
    const channel = stubClient.channel('team:1');
    expect(channel.subscribe()).toBe(channel);
    await expect(channel.unsubscribe()).resolves.toBe('ok');
    await expect(stubClient.rpc('noop')).resolves.toEqual({ data: null, error: null });
    await expect(stubClient.auth.getSession()).resolves.toEqual({
      data: { session: null },
      error: null,
    });
    const exchangeResult = await stubClient.auth.exchangeCodeForSession();
    expect(exchangeResult.error).toBeInstanceOf(Error);
    const fullClient = stubClient as unknown as {
      removeChannel: () => void;
      removeAllChannels: () => void;
      functions: { invoke: (fn: string) => Promise<{ data: null; error: null }> };
      auth: { signOut: () => Promise<{ error: null }>; onAuthStateChange: () => unknown };
    };
    expect(() => fullClient.removeChannel()).not.toThrow();
    expect(() => fullClient.removeAllChannels()).not.toThrow();
    await expect(fullClient.functions.invoke('noop')).resolves.toEqual({ data: null, error: null });
    await expect(fullClient.auth.signOut()).resolves.toEqual({ error: null });
    expect(fullClient.auth.onAuthStateChange()).toBeDefined();
    await expect(supabase?.ready()).resolves.toBeNull();
    await expect(supabase?.signOut()).resolves.toBeUndefined();
    await expect(supabase?.signInWithOAuth('github')).rejects.toThrow(
      'Supabase not configured - login unavailable in offline mode'
    );
  });
  it('shares a single exchange across concurrent ready callers', async () => {
    localStorage.removeItem('sb-test-auth-token');
    window.history.replaceState(null, '', '/');
    try {
      window.history.replaceState(null, '', '/auth/callback?code=oauth-code');
      const exchangeDeferred = createDeferred<{
        data: { session: ReturnType<typeof createSession> };
        error: null;
      }>();
      const exchangeCodeForSession = vi.fn(() => exchangeDeferred.promise);
      const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
      mockAuthClient({
        exchangeCodeForSession,
        getSession,
      });
      const plugin = (await import('@/plugins/supabase.client')).default;
      const result = (await plugin.setup?.(
        {} as Parameters<NonNullable<typeof plugin.setup>>[0]
      )) as SupabasePluginProvide | undefined;
      await flushPlugin();
      const first = result?.provide.supabase.ready();
      const second = result?.provide.supabase.ready();
      exchangeDeferred.resolve({
        data: { session: createSession('user-code') },
        error: null,
      });
      await Promise.all([first, second]);
      expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
      expect(result?.provide.supabase.user.id).toBe('user-code');
      expect(result?.provide.supabase.user.loggedIn).toBe(true);
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
  it('throws when config is missing and offline fallback is disallowed', async () => {
    runtimeConfig.public.supabaseUrl = '';
    runtimeConfig.public.supabaseAnonKey = '';
    offlineFallbackMock.mockReturnValue(false);
    const plugin = (await import('@/plugins/supabase.client')).default;
    await expect(
      plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])
    ).rejects.toThrow('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
  it('hydrates from a hash-token callback and cleans the OAuth hash', async () => {
    localStorage.removeItem('sb-test-auth-token');
    window.history.replaceState(null, '', '/');
    try {
      window.history.replaceState(null, '', '/#access_token=abc&refresh_token=def');
      mockAuthClient({
        getSession: vi.fn().mockResolvedValue({
          data: { session: createSession('user-hash') },
          error: null,
        }),
      });
      const plugin = (await import('@/plugins/supabase.client')).default;
      const result = (await plugin.setup?.(
        {} as Parameters<NonNullable<typeof plugin.setup>>[0]
      )) as SupabasePluginProvide | undefined;
      await flushPlugin();
      expect(result?.provide.supabase.user.id).toBe('user-hash');
      expect(result?.provide.supabase.user.loggedIn).toBe(true);
      expect(window.location.hash).toBe('');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
  it('rejects signInWithOAuth when the client returns an error', async () => {
    const oauthError = new Error('oauth_denied');
    mockAuthClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: null, error: oauthError }),
    });
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      SupabasePluginProvide | undefined;
    await flushPlugin();
    await expect(result?.provide.supabase.signInWithOAuth('github')).rejects.toThrow(
      'oauth_denied'
    );
  });
  it('rejects signOut when the client returns an error', async () => {
    const signOutError = new Error('signout_failed');
    mockAuthClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: signOutError }),
    });
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      SupabasePluginProvide | undefined;
    await flushPlugin();
    await result?.provide.supabase.ready();
    await expect(result?.provide.supabase.signOut()).rejects.toThrow('signout_failed');
  });
  it('rejects ready when client initialization fails', async () => {
    const initError = new Error('create client failed');
    localStorage.removeItem('sb-test-auth-token');
    mockCreateClient.mockImplementation(() => {
      throw initError;
    });
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      SupabasePluginProvide | undefined;
    await expect(result?.provide.supabase.ready()).rejects.toThrow('create client failed');
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[Supabase] Failed to initialize client',
      initError
    );
  });
  it('logs and rejects initial session read failures', async () => {
    const sessionError = new Error('initial session read failed');
    localStorage.removeItem('sb-test-auth-token');
    mockAuthClient({
      getSession: vi.fn().mockRejectedValue(sessionError),
    });
    const plugin = (await import('@/plugins/supabase.client')).default;
    const result = (await plugin.setup?.({} as Parameters<NonNullable<typeof plugin.setup>>[0])) as
      SupabasePluginProvide | undefined;
    await expect(result?.provide.supabase.ready()).rejects.toBe(sessionError);
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[Supabase] Failed to read initial session',
      sessionError
    );
  });
});
