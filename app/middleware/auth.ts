export default defineNuxtRouteMiddleware(async () => {
  const { $supabase } = useNuxtApp();
  if (!$supabase.user.loggedIn) {
    return navigateTo('/login');
  }
});
