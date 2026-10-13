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
Deno.test('purges the exact current task-rewards scope and retains retired targets', () => {
  const origins = ['https://tarkovtracker.org', 'https://www.tarkovtracker.org'];
  const targets = buildTarkovCacheUrls(origins);
  // Matches tasks-rewards.get.ts: TASK_REWARDS_CACHE_VERSION = 'json-v2', lang and gameMode.
  const expected = origins.flatMap((origin) =>
    languages.flatMap((lang) =>
      modes.map((mode) => `${origin}/__edge-cache/tarkov/tasks-rewards-json-v2-${lang}-${mode}`)
    )
  );
  const current = targets.filter((url) =>
    new URL(url).pathname.startsWith('/__edge-cache/tarkov/tasks-rewards-json-v2-')
  );
  assertEquals(current.sort(), expected.sort());
  assertEquals(new Set(targets).size, targets.length);
  assertEquals(
    expected.every((url) =>
      targets.includes(url.replace('tasks-rewards-json-v2-', 'tasks-rewards-'))
    ),
    true
  );
});
