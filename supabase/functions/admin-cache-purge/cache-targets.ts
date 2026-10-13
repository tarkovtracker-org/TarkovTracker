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
  { key: 'bootstrap-json-v2', includesLanguage: false, includesGameMode: true },
  { key: 'hideout-json-v5', includesGameMode: true },
  { key: 'items-json-v2', includesGameMode: true },
  { key: 'items-lite-json-v2', includesGameMode: true },
  { key: 'map-spawns-json-v1', includesGameMode: true },
  { key: 'prestige-json-v3', includesGameMode: true },
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
  entry: { key: string; includesLanguage?: boolean; includesGameMode: boolean }
): string[] {
  const languages = entry.includesLanguage === false ? [''] : TARKOV_LANGUAGES;
  const modes = entry.includesGameMode ? TARKOV_GAME_MODES : [''];
  return languages.flatMap((lang) =>
    modes.map((mode) => `${cacheBase}/${[entry.key, lang, mode].filter(Boolean).join('-')}`)
  );
}
/** Builds current and retired operator purge targets without invoking auth or Cloudflare. */
export function buildTarkovCacheUrls(origins: string[]): string[] {
  const urls: string[] = [];
  for (const origin of origins) {
    for (const entry of TARKOV_CACHE_KEYS)
      urls.push(...buildEntryUrls(`${origin}${EDGE_CACHE_PATH}`, entry));
  }
  return urls;
}
