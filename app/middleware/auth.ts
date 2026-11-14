import { ensureSupabaseReadyForRoute, handleSupabaseReadinessFailure } from '@/utils/supabaseGuard';
export default defineNuxtRouteMiddleware(async () => {
  const { $supabase } = useNuxtApp();
  const readiness = await ensureSupabaseReadyForRoute($supabase, 'Auth middleware');
  if (readiness !== 'ready') {
    return handleSupabaseReadinessFailure(readiness);
  }
  if (!$supabase.user.loggedIn) {
    return navigateTo('/login');
  }
});
