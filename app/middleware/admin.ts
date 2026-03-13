import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
import { logger } from '@/utils/logger';
import { ensureSupabaseReadyForRoute } from '@/utils/supabaseGuard';
import { hydrateUserFromSession } from '@/utils/userHydration';
/**
 * Gets the admin watch timeout from runtime config with validation
 * Falls back to 5000ms if invalid or not set
 */
function getAdminWatchTimeout(): number {
  const config = useRuntimeConfig();
  const configValue = config.public.adminWatchTimeoutMs;
  const parsed = Number.parseInt(String(configValue), 10);
  // Validate: must be a positive integer
  if (Number.isNaN(parsed) || parsed <= 0) {
    logger.warn(
      `Invalid adminWatchTimeoutMs (ENV: ADMIN_WATCH_TIMEOUT_MS) value: ${configValue}, using default 5000ms`
    );
    return 5000;
  }
  return parsed;
}
/**
 * Admin route middleware
 * Protects admin-only routes by checking user authentication and admin status
 * Only redirects when we're CERTAIN the user is not an admin (data loaded + is_admin false)
 * If data hasn't loaded initially, waits up to 5 seconds for it to load, then redirects to "/"
 * if admin status still cannot be confirmed after the timeout
 */
export default defineNuxtRouteMiddleware(async () => {
  const { $supabase } = useNuxtApp();
  if (!(await ensureSupabaseReadyForRoute($supabase, 'Admin middleware'))) {
    return navigateTo('/login');
  }
  const ensureAuthenticated = async () => {
    if ($supabase.user.loggedIn) return true;
    const { data, error } = await $supabase.client.auth.getSession();
    if (error) {
      logger.error('Admin middleware: Failed to load Supabase session', error);
    }
    const sessionUser = data.session?.user;
    if (!sessionUser) return false;
    try {
      hydrateUserFromSession($supabase.user, sessionUser);
    } catch (hydrateError) {
      logger.error('Admin middleware: Failed to hydrate user from session', {
        error: hydrateError,
        sessionUserId: sessionUser.id,
        sessionUserEmail: sessionUser.email,
      });
      // Fall back to minimal session fields so admin checks can still proceed.
      $supabase.user.loggedIn = true;
      $supabase.user.id = sessionUser.id;
      $supabase.user.email = sessionUser.email ?? null;
    }
    return true;
  };
  // Check if user is logged in (wait for session if needed)
  const isAuthenticated = await ensureAuthenticated();
  if (!isAuthenticated) {
    return navigateTo('/login');
  }
  // Get system store with Supabase listener
  const storeResult = useSystemStoreWithSupabase();
  if (!storeResult || !storeResult.systemStore || !storeResult.hasInitiallyLoaded) {
    logger.error('Admin middleware: System store or loading state unavailable');
    return navigateTo('/');
  }
  const { systemStore, hasInitiallyLoaded } = storeResult;
  // Wait for initial data to load (with timeout)
  if (!hasInitiallyLoaded.value) {
    await new Promise<void>((resolve) => {
      const unwatch = watch(
        hasInitiallyLoaded,
        (loaded) => {
          if (loaded) {
            unwatch();
            resolve();
          }
        },
        { immediate: true }
      );
      // Timeout after configured duration
      setTimeout(() => {
        unwatch();
        resolve();
      }, getAdminWatchTimeout());
    });
  }
  // Strict check: if data loaded, must be explicitly admin
  if (hasInitiallyLoaded.value) {
    if (systemStore.$state.is_admin !== true) {
      return navigateTo('/');
    }
  } else {
    // If data hasn't loaded after timeout, redirect for safety
    // (cannot confirm admin status, so deny access)
    return navigateTo('/');
  }
});
