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
  assertEquals(targets.includes('https://tarkovtracker.org/__edge-cache/tarkov/items-en'), true);
  assertEquals(
    targets.includes(
      'https://www.tarkovtracker.org/__edge-cache/tarkov/tasks-objectives-json-v4-en-pvp-season'
    ),
    true
  );
  assertEquals(new Set(targets).size, targets.length);
});
