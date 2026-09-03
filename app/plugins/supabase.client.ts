// eslint-disable-next-line import-x/order
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { hasSupabaseAuthSessionHint } from '@/utils/clientStorage';
import { logger } from '@/utils/logger';
import { shouldUseOfflineSupabaseFallback } from '@/utils/runtimeConfig';
import { hydrateUserFromSession } from '@/utils/userHydration';
type OAuthProvider = 'twitch' | 'discord' | 'google' | 'github';
type SupabaseUser = {
  id: string | null;
  loggedIn: boolean;
  email: string | null;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  photoURL: string | null; // Alias for avatarUrl (backward compatibility)
  lastLoginAt: string | null;
  createdAt: string | null;
  provider: string | null; // 'discord', 'twitch', etc.
  providers: string[] | null; // All linked OAuth providers
};
type OAuthCallbackCode = { code: string; flowId?: string };
/**
 * How long app start-up waits for the initial session read before continuing.
 * The read is not cancelled; it hydrates the session whenever it completes.
 */
const SESSION_BOOT_BUDGET_MS = 8000;
/**
 * Waits for the initial session read without letting it block app start-up.
 *
 * `ready()` resolves only after `getSession()` returns, so a hung request would
 * otherwise stall the whole SPA inside the plugin's `setup()`. The read keeps
 * running past the budget and still hydrates the session when it completes, so a
 * slow network delays sign-in state instead of preventing the app from mounting.
 */
const sessionFromResult = (result: {
  data?: { session?: Session | null } | null;
}): Session | null => result.data?.session ?? null;
const supportsChannelRemoval = (
  client: SupabaseClient | null
): client is SupabaseClient & { removeAllChannels: () => Promise<unknown> } =>
  client !== null && typeof client.removeAllChannels === 'function';
const awaitSessionWithinBudget = async (read: () => Promise<Session | null>): Promise<void> => {
  const sessionRead = read().then(
    () => undefined,
    (error: unknown) => {
      logger.error('[Supabase] Initial session read failed', error);
    }
  );
  let budgetTimeout: ReturnType<typeof setTimeout> | undefined;
  const budgetElapsed = new Promise<void>((resolve) => {
    budgetTimeout = setTimeout(() => {
      logger.warn('[Supabase] Initial session read exceeded the start-up budget; continuing');
      resolve();
    }, SESSION_BOOT_BUDGET_MS);
  });
  try {
    await Promise.race([sessionRead, budgetElapsed]);
  } finally {
    if (budgetTimeout !== undefined) clearTimeout(budgetTimeout);
  }
};
const createSupabaseUserState = () =>
  reactive<SupabaseUser>({
    id: null,
    loggedIn: false,
    email: null,
    displayName: null,
    username: null,
    avatarUrl: null,
    photoURL: null,
    lastLoginAt: null,
    createdAt: null,
    provider: null,
    providers: null,
  });
const OAUTH_CALLBACK_PATH = '/auth/callback';
const OAUTH_HASH_TOKEN_KEYS = ['access_token', 'refresh_token', 'error'] as const;
const currentSearchParams = () => new URLSearchParams(window.location.search || '');
const readOAuthCallbackCode = (): OAuthCallbackCode | null => {
  if (window.location.pathname !== OAUTH_CALLBACK_PATH) {
    return null;
  }
  const searchParams = currentSearchParams();
  const code = searchParams.get('code');
  return code ? { code, flowId: searchParams.get('sb_flow_id') || undefined } : null;
};
const clearOAuthCallbackCode = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('sb_flow_id');
  window.history.replaceState(window.history.state, '', url.toString());
};
const currentHashParams = (): URLSearchParams => {
  const rawHash = window.location.hash.replace(/^#/, '').replace(/^\?/, '');
  return new URLSearchParams(rawHash);
};
const hasHashCallbackTokens = (): boolean => {
  const hashParams = currentHashParams();
  return OAUTH_HASH_TOKEN_KEYS.some((key) => hashParams.has(key));
};
const hasOAuthCallbackParams = (): boolean => {
  return (
    Boolean(readOAuthCallbackCode()) ||
    currentSearchParams().has('error') ||
    hasHashCallbackTokens()
  );
};
const buildStubBuilder = () => {
  const result = Promise.resolve({ data: null, error: null });
  const proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return result.then.bind(result);
        }
        if (prop === 'catch') {
          return result.catch.bind(result);
        }
        if (prop === 'finally') {
          return result.finally.bind(result);
        }
        return () => proxy;
      },
    }
  );
  return proxy;
};
const buildStubChannel = () => {
  return {
    on() {
      return this;
    },
    subscribe(_callback?: (status: string) => void) {
      return this;
    },
    async unsubscribe() {
      return 'ok';
    },
  };
};
const buildStubClient = (): SupabaseClient => {
  return {
    from(table: string) {
      logger.debug(`[Supabase Stub] from('${table}') called in offline mode`);
      return buildStubBuilder();
    },
    channel(channelName: string) {
      logger.debug(`[Supabase Stub] channel('${channelName}') called in offline mode`);
      return buildStubChannel();
    },
    async rpc(fnName: string) {
      logger.debug(`[Supabase Stub] rpc('${fnName}') called in offline mode`);
      return { data: null, error: null };
    },
    removeChannel() {
      logger.debug('[Supabase Stub] removeChannel called in offline mode');
    },
    removeAllChannels() {
      logger.debug('[Supabase Stub] removeAllChannels called in offline mode');
    },
    functions: {
      async invoke(fnName: string) {
        logger.debug(`[Supabase Stub] functions.invoke('${fnName}') called in offline mode`);
        return { data: null, error: null };
      },
    },
    auth: {
      async getSession() {
        logger.debug('[Supabase Stub] auth.getSession called in offline mode');
        return { data: { session: null }, error: null };
      },
      async exchangeCodeForSession() {
        logger.debug('[Supabase Stub] auth.exchangeCodeForSession called in offline mode');
        return {
          data: { session: null },
          error: new Error('OAuth not available in offline mode'),
        };
      },
      onAuthStateChange() {
        logger.debug('[Supabase Stub] auth.onAuthStateChange called in offline mode');
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithOAuth() {
        logger.debug('[Supabase Stub] auth.signInWithOAuth called in offline mode');
        return {
          data: { provider: '', url: null },
          error: new Error('OAuth not available in offline mode'),
        };
      },
      async signOut() {
        logger.debug('[Supabase Stub] auth.signOut called in offline mode');
        return { error: null };
      },
    },
  } as unknown as SupabaseClient;
};
const buildStub = () => {
  const stubUser = createSupabaseUserState();
  return {
    client: buildStubClient(),
    user: stubUser,
    isOfflineMode: true,
    signInWithOAuth: async (
      _provider: OAuthProvider,
      _options?: { skipBrowserRedirect?: boolean; redirectTo?: string }
    ) => {
      logger.error('[Supabase] Offline OAuth sign-in attempted', {
        provider: _provider,
        options: _options,
      });
      throw new Error('Supabase not configured - login unavailable in offline mode');
    },
    signOut: async () => {},
    ready: async (): Promise<Session | null> => null,
  };
};
export default defineNuxtPlugin({
  name: 'supabase',
  async setup() {
    const runtimeConfig = useRuntimeConfig();
    const supabaseUrl = String(runtimeConfig.public.supabaseUrl || '').trim();
    const supabaseKey = String(runtimeConfig.public.supabaseAnonKey || '').trim();
    const missingConfigMessage = '[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY';
    if (!supabaseUrl || !supabaseKey) {
      const allowOfflineFallback = shouldUseOfflineSupabaseFallback({
        hostname: import.meta.client ? window.location.hostname : undefined,
        isProduction: import.meta.env.PROD,
      });
      if (!allowOfflineFallback) {
        logger.error(missingConfigMessage);
        throw new Error(missingConfigMessage);
      }
      logger.warn(
        `${missingConfigMessage}. Running in offline mode${
          import.meta.env.PROD ? ' for this preview deployment' : ' for development'
        }. Set SUPABASE_URL and SUPABASE_ANON_KEY to enable auth and sync.`
      );
      const stub = buildStub();
      return { provide: { supabase: stub } };
    }
    const user = createSupabaseUserState();
    const stub = buildStub();
    let initPromise: Promise<void> | null = null;
    let readySessionPromise: Promise<Session | null> | null = null;
    let supabaseClient: SupabaseClient | null = null;
    let currentSession: Session | null = null;
    let oauthCallbackCode = readOAuthCallbackCode();
    const hasCodeQueryParam = currentSearchParams().has('code');
    const hasStoredSession = () => {
      try {
        return hasSupabaseAuthSessionHint();
      } catch (error) {
        logger.warn('[Supabase] Could not inspect localStorage for session hint', error);
      }
      return false;
    };
    const hydrateFromSession = (session: { user?: User } | null) => {
      currentSession = session as Session | null;
      hydrateUserFromSession(user, session?.user ?? null);
      if (session && window.location.hash.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        logger.debug('[Supabase] Cleaned OAuth hash from URL');
      }
    };
    let removeChannelsPromise: Promise<void> | null = null;
    /** Set while `signOut()` is responsible for removing channels. */
    let signOutOwnsChannelTeardown = false;
    /**
     * Removes every Realtime channel, coalescing concurrent callers.
     *
     * Explicit `signOut()` and the `SIGNED_OUT` auth event both reach this, so
     * without coalescing a single sign-out tears channels down twice.
     */
    const removeAllRealtimeChannels = async () => {
      const client = supabaseClient;
      if (!supportsChannelRemoval(client)) return;
      removeChannelsPromise ??= (async () => {
        try {
          await client.removeAllChannels();
        } catch (error) {
          logger.warn('[Supabase] Failed to remove realtime channels after sign-out', error);
        }
      })();
      const pendingRemoval = removeChannelsPromise;
      try {
        await pendingRemoval;
      } finally {
        if (removeChannelsPromise === pendingRemoval) removeChannelsPromise = null;
      }
    };
    const handleAuthStateChange = (event: string, session: Session | null) => {
      hydrateFromSession(session);
      if (event !== 'SIGNED_OUT') return;
      // `signOut()` tears channels down itself. Scheduling a second removal here
      // could tear down channels recreated right after sign-out, so skip it.
      if (signOutOwnsChannelTeardown) return;
      setTimeout(() => {
        void removeAllRealtimeChannels();
      }, 0);
    };
    const createSupabaseClient = async (): Promise<SupabaseClient> => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const client = createClient(supabaseUrl, supabaseKey, {
          auth: {
            detectSessionInUrl: !hasCodeQueryParam,
            flowType: 'pkce',
          },
        });
        supabaseClient = client;
        api.client = client;
        client.auth.onAuthStateChange(handleAuthStateChange);
        return client;
      } catch (error) {
        logger.error('[Supabase] Failed to initialize client', error);
        throw error;
      }
    };
    const hydrateInitialSession = async (client: SupabaseClient): Promise<void> => {
      try {
        const sessionResult = await client.auth.getSession();
        if (sessionResult.error) {
          // A failed read is not the same as "signed out"; hydrating null here
          // would sign a valid user out of the UI.
          logger.warn('[Supabase] Initial session read returned an error', sessionResult.error);
          return;
        }
        hydrateFromSession(sessionFromResult(sessionResult));
      } catch (error) {
        logger.error('[Supabase] Failed to read initial session', error);
        throw error;
      }
    };
    const ensureClientInitialized = async (): Promise<'created' | 'waited' | 'existing'> => {
      if (initPromise) {
        await initPromise;
        return 'waited';
      }
      if (supabaseClient) return 'existing';
      initPromise = (async () => {
        const client = await createSupabaseClient();
        await hydrateInitialSession(client);
      })().finally(() => {
        initPromise = null;
      });
      await initPromise;
      return 'created';
    };
    const initializeClientInBackground = () => {
      void ensureClientInitialized().catch(() => {});
    };
    const readReadySession = async (client: SupabaseClient): Promise<Session | null> => {
      readySessionPromise ??= (async () => {
        try {
          const sessionResult = await client.auth.getSession();
          if (sessionResult.error) {
            // A failed read is not the same as "signed out". Keep the last known
            // session instead of hydrating null and signing the user out.
            logger.warn('[Supabase] Ready session read returned an error', sessionResult.error);
            return currentSession;
          }
          const session = sessionFromResult(sessionResult);
          hydrateFromSession(session);
          return session;
        } catch (error) {
          logger.error('[Supabase] Failed to read ready session', error);
          throw error;
        }
      })();
      const sessionPromise = readySessionPromise;
      try {
        await sessionPromise;
      } finally {
        if (readySessionPromise === sessionPromise) readySessionPromise = null;
      }
      return currentSession;
    };
    let oauthExchangePromise: Promise<void> | null = null;
    const exchangeOAuthCode = async ({ code, flowId }: OAuthCallbackCode) => {
      if (!supabaseClient) {
        throw new Error('Supabase client unavailable');
      }
      const result = await supabaseClient.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined
      );
      if (result.error) {
        throw result.error;
      }
      hydrateFromSession(result.data.session);
      clearOAuthCallbackCode();
    };
    const refreshFromStoredSession = async (): Promise<Session | null> => {
      if (!supabaseClient) {
        return null;
      }
      return readReadySession(supabaseClient);
    };
    const consumeOAuthCallbackCode = async (): Promise<boolean> => {
      if (!oauthCallbackCode) {
        return false;
      }
      oauthExchangePromise ??= exchangeOAuthCode(oauthCallbackCode).finally(() => {
        oauthCallbackCode = null;
      });
      await oauthExchangePromise;
      return true;
    };
    const ready = async (): Promise<Session | null> => {
      await ensureClientInitialized();
      if (await consumeOAuthCallbackCode()) {
        return currentSession;
      }
      return refreshFromStoredSession();
    };
    const signInWithOAuth = async (
      provider: OAuthProvider,
      options?: { skipBrowserRedirect?: boolean; redirectTo?: string }
    ) => {
      await ensureClientInitialized();
      if (!supabaseClient) {
        throw new Error('Supabase client unavailable');
      }
      const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
          skipBrowserRedirect: options?.skipBrowserRedirect,
          redirectTo: options?.redirectTo || window.location.origin,
        },
      });
      if (error) throw error;
      return data;
    };
    const signOut = async () => {
      await ensureClientInitialized();
      if (!supabaseClient) {
        logger.debug('[Supabase] signOut skipped because client is not initialized');
        return;
      }
      signOutOwnsChannelTeardown = true;
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        await removeAllRealtimeChannels();
      } finally {
        signOutOwnsChannelTeardown = false;
      }
    };
    const api = reactive({
      client: stub.client,
      user,
      isOfflineMode: false,
      signInWithOAuth,
      signOut,
      ready,
    });
    if (oauthCallbackCode) {
      initializeClientInBackground();
    } else if (hasOAuthCallbackParams() || hasStoredSession()) {
      await awaitSessionWithinBudget(ready);
    } else {
      initializeClientInBackground();
    }
    return {
      provide: {
        supabase: api,
      },
    };
  },
});
