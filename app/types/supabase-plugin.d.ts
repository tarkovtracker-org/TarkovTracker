import type { SupabaseClient } from '@supabase/supabase-js';
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
  signOut: () => Promise<void>;
  ready: () => Promise<void>;
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
