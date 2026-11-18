import { hasGameDataStrings, localizeGameData } from '@/utils/gameDataStrings';
import { SEO_ORIGIN } from '@/utils/routeSeo';
import type { GameDataStrings } from '@/utils/gameDataStrings';
// Builds have no private overlay bindings. Use the corrected public catalogs,
// with no player ID, credentials, or incoming request headers.
async function fetchCatalog<T>(path: string): Promise<T> {
  const response = await $fetch<{ data: T }>(`${SEO_ORIGIN}/api/tarkov/${path}`, {
    query: path === 'strings' ? { lang: 'en' } : { gameMode: 'regular' },
    timeout: 20000,
    retry: 1,
  });
  return response.data;
}
export async function fetchPublicPvpCatalogs<T extends unknown[]>(paths: {
  [K in keyof T]: string;
}): Promise<T> {
  const catalogs = (await Promise.all(paths.map((path) => fetchCatalog(path)))) as T;
  // Initial prerender builds can still receive the preceding production's localized payloads.
  if (!hasGameDataStrings(catalogs)) return catalogs;
  const { strings } = await fetchCatalog<{ strings: GameDataStrings }>('strings');
  return localizeGameData(catalogs, strings);
}
