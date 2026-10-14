import { resolveLegacyTaskViewRedirect } from '@/utils/taskRouteView';
export default defineNuxtRouteMiddleware((to) => {
  const redirect = resolveLegacyTaskViewRedirect(to.path, to.query);
  if (redirect) return navigateTo(redirect, { replace: true });
});
