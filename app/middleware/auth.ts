export default defineNuxtRouteMiddleware(() => {
  const { $supabase } = useNuxtApp();
  if (!$supabase.user.loggedIn) {
    return navigateTo('/login');
  }
});
