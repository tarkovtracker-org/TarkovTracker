import { SEO_ORIGIN } from '@/utils/routeSeo';
// Builds have no private overlay bindings. Use the corrected public catalogs,
// with no player ID, credentials, or incoming request headers.
export async function fetchPublicPvpCatalog<T>(path: string) {
  const response = await $fetch<{ data: T }>(`${SEO_ORIGIN}/api/tarkov/${path}`, {
    query: { gameMode: 'pvp', lang: 'en' },
    timeout: 20000,
    retry: 1,
  });
  return response.data;
}
