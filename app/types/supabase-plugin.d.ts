import type { Session, SupabaseClient } from '@supabase/supabase-js';
export interface SupabaseUser {
  id: string | null;
  email: string | null;
  loggedIn: boolean;
  provider?: string | null;
  providers?: string[] | null;
  app_metadata?: {
    provider?: string;
    providers?: string[];
    [key: string]: unknown;
  };
  user_metadata?: {
    [key: string]: unknown;
  };
  last_sign_in_at?: string;
  created_at?: string;
  uid?: string;
  displayName?: string | null;
  username?: string | null;
  emailVerified?: boolean;
  photoURL?: string | null;
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string | null;
}
export interface SupabasePlugin {
  client: SupabaseClient;
  user: SupabaseUser;
  isOfflineMode: boolean;
  signInWithOAuth: (
    provider: 'twitch' | 'discord' | 'google' | 'github',
    options?: { skipBrowserRedirect?: boolean; redirectTo?: string }
  ) => Promise<{ url?: string }>;
  /**
   * Resolves `signed_out_locally` when this browser's session ended but the server did not
   * confirm revocation. Rejects with `SupabaseSessionChangedError` if another account's session
   * is current, and with the SDK error when the session could not be ended at all.
   */
  signOut: (
    expectedUserId?: string,
    scope?: 'global' | 'local'
  ) => Promise<'signed_out' | 'signed_out_locally'>;
  /** Removes only this browser's copy of the owner's session, without contacting the server. */
  signOutThisDevice: (expectedUserId: string) => Promise<void>;
  ready: () => Promise<Session | null>;
}
declare module '#app' {
  interface NuxtApp {
    $supabase: SupabasePlugin;
  }
}
declare module 'vue' {
  interface ComponentCustomProperties {
    $supabase: SupabasePlugin;
  }
}
