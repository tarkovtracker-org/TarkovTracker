import { fetchLocalizedCatalogs } from '@/server/utils/localizedCatalogs';
import { SEO_ORIGIN } from '@/utils/routeSeo';
// Builds have no private overlay bindings. Use the corrected public catalogs,
// with no player ID, credentials, or incoming request headers.
async function fetchCatalog(path: string) {
  let release: string | null = null;
  const response = await $fetch<{ data: unknown }>(`${SEO_ORIGIN}/api/tarkov/${path}`, {
    query: path === 'strings' ? { lang: 'en' } : { gameMode: 'regular' },
    timeout: 20000,
    retry: 1,
    onResponse: ({ response }) => {
      release = response.headers.get('x-catalog-release');
    },
  });
  return { data: response.data, release };
}
export async function fetchPublicPvpCatalogs<T extends unknown[]>(paths: {
  [K in keyof T]: string;
}): Promise<T> {
  return fetchLocalizedCatalogs<T>(paths, fetchCatalog);
}
