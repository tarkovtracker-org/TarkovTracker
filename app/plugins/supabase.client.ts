import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { hydrateUserFromSession } from '@/utils/userHydration';
import type { SupabaseClient, User } from '@supabase/supabase-js';
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
export default defineNuxtPlugin(() => {
  const runtimeConfig = useRuntimeConfig();
  const supabaseUrl = String(runtimeConfig.public.supabaseUrl || '').trim();
  const supabaseKey = String(runtimeConfig.public.supabaseAnonKey || '').trim();
  const missingConfigMessage =
    '[Supabase] Missing runtimeConfig.public.supabaseUrl or runtimeConfig.public.supabaseAnonKey';
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
  const buildStub = () => {
    const stubUser = reactive<SupabaseUser>({
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
    const stubClient = {
      from(table: string) {
        logger.debug(`[Supabase Stub] from('${table}') called in offline mode`);
        return buildStubBuilder();
      },
      channel(channelName: string) {
        logger.debug(`[Supabase Stub] channel('${channelName}') called in offline mode`);
        return buildStubChannel();
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
    return {
      client: stubClient,
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
    };
  };
  if (!supabaseUrl || !supabaseKey) {
    if (import.meta.env.PROD) {
      logger.error(
        `${missingConfigMessage}. Set NUXT_PUBLIC_SUPABASE_URL and NUXT_PUBLIC_SUPABASE_ANON_KEY.`
      );
      throw new Error(missingConfigMessage);
    }
    logger.info(
      `${missingConfigMessage}. Running in offline mode for development. ` +
        'See .env.example to enable Supabase features.'
    );
    const stub = buildStub();
    return { provide: { supabase: stub } };
  }
  const user = reactive<SupabaseUser>({
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
  const stub = buildStub();
  let initPromise: Promise<void> | null = null;
  let supabaseClient: SupabaseClient | null = null;
  const hasOAuthHash = () => {
    const hash = window.location.hash || '';
    return hash.includes('access_token') || hash.includes('refresh_token');
  };
  const hasStoredSession = () => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.endsWith('-auth-token')) {
          return true;
        }
      }
    } catch (error) {
      logger.warn('[Supabase] Could not inspect localStorage for session hint', error);
    }
    return false;
  };
  const hydrateFromSession = (session: { user?: User } | null) => {
    hydrateUserFromSession(user, session?.user ?? null);
    if (session && window.location.hash.includes('access_token')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      logger.debug('[Supabase] Cleaned OAuth hash from URL');
    }
  };
  const ensureClientInitialized = async () => {
    if (supabaseClient) return;
    if (!initPromise) {
      initPromise = (async () => {
        const { createClient } = await import('@supabase/supabase-js');
        const client = createClient(supabaseUrl, supabaseKey);
        supabaseClient = client;
        api.client = client;
        const sessionResult = await client.auth.getSession();
        hydrateFromSession(sessionResult.data?.session ?? null);
        client.auth.onAuthStateChange((_event, session) => {
          hydrateFromSession(session);
        });
      })()
        .catch((error) => {
          logger.error('[Supabase] Failed to initialize client', error);
        })
        .finally(() => {
          initPromise = null;
        });
    }
    await initPromise;
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
    if (typeof window !== 'undefined') {
      logger.debug('[Supabase] Clearing game progress localStorage on logout');
      localStorage.removeItem(STORAGE_KEYS.progress);
    }
    await ensureClientInitialized();
    if (!supabaseClient) {
      return;
    }
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  };
  const api = reactive({
    client: stub.client,
    user,
    isOfflineMode: false,
    signInWithOAuth,
    signOut,
  });
  if (hasOAuthHash() || hasStoredSession()) {
    void ensureClientInitialized();
  }
  return {
    provide: {
      supabase: api,
    },
  };
});
