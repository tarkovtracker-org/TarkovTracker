import { useHead, useRoute } from '#imports';
import { createRouteSeoHead } from '@/utils/routeSeo';
export const useRouteSeo = () => {
  const route = useRoute();
  return useHead(() => createRouteSeoHead(route.path));
};
