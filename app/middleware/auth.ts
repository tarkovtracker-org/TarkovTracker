import { ensureSupabaseReadyForRoute } from '@/utils/supabaseGuard';
export default defineNuxtRouteMiddleware(async () => {
  const { $supabase } = useNuxtApp();
  if (!(await ensureSupabaseReadyForRoute($supabase, 'Auth middleware'))) {
    return navigateTo('/login');
  }
  if (!$supabase.user.loggedIn) {
    return navigateTo('/login');
  }
});
