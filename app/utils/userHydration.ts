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
 * Helper to safely extract a string value from user metadata
 */
function getMetaString(metadata: Record<string, unknown>, key: string): string | null {
  return typeof metadata[key] === 'string' ? (metadata[key] as string) : null;
}
/**
 * Extracts username from session user based on provider
 */
function extractUsername(
  userMetadata: Record<string, unknown>,
  email: string | null,
  provider: string | null
): string | null {
  if (provider === 'discord') {
    // Discord user objects expose username + global_name (preferred display name).
    const globalName = getMetaString(userMetadata, 'global_name');
    const username = getMetaString(userMetadata, 'username');
    const preferredUsername = getMetaString(userMetadata, 'preferred_username');
    const fullName = getMetaString(userMetadata, 'full_name');
    const legacyName = getMetaString(userMetadata, 'name');
    return (
      globalName ||
      username ||
      preferredUsername ||
      fullName ||
      legacyName?.split('#')[0] ||
      email?.split('@')[0] ||
      null
    );
  }
  if (provider === 'twitch') {
    return (
      getMetaString(userMetadata, 'preferred_username') ||
      getMetaString(userMetadata, 'name') ||
      email?.split('@')[0] ||
      null
    );
  }
  return getMetaString(userMetadata, 'name') || email?.split('@')[0] || null;
}
/**
 * Extracts display name from session user based on provider
 */
function extractDisplayName(
  userMetadata: Record<string, unknown>,
  provider: string | null,
  username: string | null
): string | null {
  const fullName = getMetaString(userMetadata, 'full_name');
  if (provider === 'discord') {
    return username;
  }
  if (provider === 'twitch') {
    return fullName || username;
  }
  return fullName || username;
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
    username = extractUsername(userMetadata, user.email, provider);
    displayName = extractDisplayName(userMetadata, provider, username);
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
