const EDGE_CACHE_PATH = '/__edge-cache/tarkov';
const TARKOV_CACHE_KEYS = [
  { key: 'bootstrap', includesGameMode: false },
  { key: 'tasks-core', includesGameMode: true },
  { key: 'tasks-objectives', includesGameMode: true },
  { key: 'tasks-core-json-v3', includesGameMode: true },
  { key: 'tasks-objectives-json-v3', includesGameMode: true },
  { key: 'tasks-objectives-json-v4', includesGameMode: true },
  { key: 'tasks-rewards', includesGameMode: true },
  { key: 'tasks-rewards-json-v2', includesGameMode: true },
  { key: 'hideout', includesGameMode: true },
  { key: 'items', includesGameMode: false },
  { key: 'items-lite', includesGameMode: false },
  { key: 'prestige', includesGameMode: false },
];
// Keep in sync with app/utils/constants.ts (API_SUPPORTED_LANGUAGES).
const TARKOV_LANGUAGES = [
  'cs',
  'de',
  'en',
  'es',
  'fr',
  'hu',
  'it',
  'ja',
  'ko',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'tr',
  'zh',
];
const TARKOV_GAME_MODES = ['regular', 'pve', 'pvp-season'];
function buildEntryUrls(
  cacheBase: string,
  entry: { key: string; includesGameMode: boolean }
): string[] {
  const urls: string[] = [];
  for (const lang of TARKOV_LANGUAGES) {
    if (entry.includesGameMode) {
      for (const gameMode of TARKOV_GAME_MODES)
        urls.push(`${cacheBase}/${entry.key}-${lang}-${gameMode}`);
    } else urls.push(`${cacheBase}/${entry.key}-${lang}`);
  }
  return urls;
}
/** Builds the existing operator purge targets without invoking auth, Deno.serve, or Cloudflare. */
export function buildTarkovCacheUrls(origins: string[]): string[] {
  const urls: string[] = [];
  for (const origin of origins) {
    for (const entry of TARKOV_CACHE_KEYS)
      urls.push(...buildEntryUrls(`${origin}${EDGE_CACHE_PATH}`, entry));
  }
  return urls;
}
