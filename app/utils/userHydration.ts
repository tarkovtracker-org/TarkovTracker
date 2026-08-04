import { extractUserMetadataDisplayName, extractUserMetadataUsername } from '@/utils/userMetadata';
import type { User } from '@supabase/supabase-js';
/**
 * User object structure for hydration.
 * Properties are optional to support reactive objects and partial hydration.
 * avatarUrl is canonical; photoURL mirrors it for legacy clients and can be removed
 * once all consumers read avatarUrl.
 */
export interface HydratableUser {
  id?: string | null;
  loggedIn: boolean;
  email?: string | null;
  displayName?: string | null;
  username?: string | null;
  /** Canonical profile image URL. */
  avatarUrl?: string | null;
  /** Legacy alias for avatarUrl; remove after all clients migrate. */
  photoURL?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  provider?: string | null;
  /** All linked OAuth providers for this account */
  providers?: string[] | null;
}
/**
 * Hydrates a user object from a Supabase session user
 * This is the single source of truth for user hydration logic
 */
export function hydrateUserFromSession(user: HydratableUser, sessionUser: User | null): void {
  if (!sessionUser || typeof sessionUser !== 'object') {
    user.id = null;
    user.loggedIn = false;
    user.email = null;
    user.displayName = null;
    user.username = null;
    user.avatarUrl = null;
    user.photoURL = null;
    user.lastLoginAt = null;
    user.createdAt = null;
    if ('provider' in user) {
      user.provider = null;
    }
    return;
  }
  const appMetadata =
    sessionUser.app_metadata && typeof sessionUser.app_metadata === 'object'
      ? (sessionUser.app_metadata as Record<string, unknown>)
      : {};
  const userMetadata =
    sessionUser.user_metadata && typeof sessionUser.user_metadata === 'object'
      ? (sessionUser.user_metadata as Record<string, unknown>)
      : {};
  const provider = typeof appMetadata.provider === 'string' ? appMetadata.provider : null;
  user.id = typeof sessionUser.id === 'string' ? sessionUser.id : null;
  user.loggedIn = true;
  user.email = typeof sessionUser.email === 'string' ? sessionUser.email : null;
  if ('provider' in user) {
    user.provider = provider;
  }
  // Extract providers array (all linked OAuth providers)
  if ('providers' in user) {
    const providersArray = appMetadata.providers;
    if (Array.isArray(providersArray)) {
      user.providers = providersArray.filter((p): p is string => typeof p === 'string');
    } else if (provider) {
      // Fallback to single provider if providers array not available
      user.providers = [provider];
    } else {
      user.providers = null;
    }
  }
  let username: string | null;
  let displayName: string | null;
  try {
    username = extractUserMetadataUsername(userMetadata, user.email, provider);
    displayName = extractUserMetadataDisplayName(userMetadata, provider, username);
  } catch {
    username = null;
    displayName = null;
  }
  user.username = username;
  user.displayName = displayName;
  const avatarUrl =
    (typeof userMetadata.avatar_url === 'string' && userMetadata.avatar_url) ||
    (typeof userMetadata.picture === 'string' && userMetadata.picture) ||
    null;
  // avatarUrl is canonical; photoURL mirrors it for legacy clients.
  user.avatarUrl = avatarUrl;
  user.photoURL = avatarUrl;
  user.lastLoginAt =
    typeof sessionUser.last_sign_in_at === 'string' ? sessionUser.last_sign_in_at : null;
  user.createdAt = typeof sessionUser.created_at === 'string' ? sessionUser.created_at : null;
}
