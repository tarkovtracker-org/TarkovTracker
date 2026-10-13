import { assertEquals } from 'jsr:@std/assert';
import { buildTarkovCacheUrls } from './cache-targets.ts';
const languages = [
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
const modes = ['regular', 'pve', 'pvp-season'];
const origins = ['https://tarkovtracker.org', 'https://www.tarkovtracker.org'];
Deno.test('current non-task purge targets match live handler key scopes', async () => {
  const urls = buildTarkovCacheUrls(origins);
  const targets = new Set(urls);
  assertEquals(targets.size, urls.length);
  for (const route of ['bootstrap', 'hideout', 'items', 'items-lite', 'map-spawns', 'prestige']) {
    const source = await Deno.readTextFile(
      new URL(`../../../app/server/api/tarkov/${route}.get.ts`, import.meta.url)
    );
    const version = source.match(/const \w+_CACHE_VERSION = '([^']+)'/)?.[1];
    const template = source.match(
      /`((?:bootstrap|hideout|items|items-lite|map-spawns|prestige)-[^`]+)`/
    )?.[1];
    assertEquals(typeof template, 'string', `Missing cache key in ${route} handler`);
    for (const origin of origins)
      for (const mode of modes)
        for (const lang of languages) {
          const key = template!
            .replace(/\$\{\w+_CACHE_VERSION\}/, version ?? '')
            .replace('${lang}', lang)
            .replace('${gameMode}', mode);
          assertEquals(targets.has(`${origin}/__edge-cache/tarkov/${key}`), true, key);
        }
  }
  for (const origin of origins) {
    const bootstrap = urls.filter((url) =>
      url.startsWith(`${origin}/__edge-cache/tarkov/bootstrap-json-v2-`)
    );
    assertEquals(bootstrap.length, modes.length);
  }
});
Deno.test('purges current and retired objective catalogs for every language and mode', () => {
  const targets = new Set(buildTarkovCacheUrls(['https://tarkovtracker.org']));
  for (const lang of languages)
    for (const mode of modes) {
      for (const key of [
        'tasks-core-json-v3',
        'tasks-objectives-json-v3',
        'tasks-objectives-json-v4',
      ]) {
        assertEquals(
          targets.has(`https://tarkovtracker.org/__edge-cache/tarkov/${key}-${lang}-${mode}`),
          true
        );
      }
    }
});
Deno.test('retains existing non-task targets and covers both authorized cache origins', () => {
  const targets = buildTarkovCacheUrls([
    'https://tarkovtracker.org',
    'https://www.tarkovtracker.org',
  ]);
  const uniqueTargets = new Set(targets);
  assertEquals(uniqueTargets.has('https://tarkovtracker.org/__edge-cache/tarkov/items-en'), true);
  assertEquals(
    uniqueTargets.has(
      'https://www.tarkovtracker.org/__edge-cache/tarkov/tasks-objectives-json-v4-en-pvp-season'
    ),
    true
  );
  assertEquals(uniqueTargets.size, targets.length);
});
