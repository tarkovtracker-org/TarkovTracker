import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { LOCALE_TO_API_MAPPING } from '../../../app/utils/constants.ts';
import { SUPPORTED_LOCALES } from '../../../app/utils/locales.ts';
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
Deno.test('purges the public extract requirements URL once for each cache origin', () => {
  const targets = buildTarkovCacheUrls(origins);
  const extractTargets = targets.filter((url) => url.includes('extract-requirements'));
  assertEquals(
    extractTargets.sort(),
    origins.map((origin) => `${origin}/api/tarkov/extract-requirements`).sort()
  );
  assertEquals(buildTarkovCacheUrls([]), []);
});
Deno.test(
  'purges all neutral catalog scopes for both origins and selectable languages',
  async () => {
    const routeDirectory = new URL('../../../app/server/api/tarkov/', import.meta.url);
    const datasets: string[] = [];
    for await (const entry of Deno.readDir(routeDirectory)) {
      if (!entry.name.endsWith('.get.ts')) continue;
      const source = await Deno.readTextFile(new URL(entry.name, routeDirectory));
      const dataset = source.match(/catalogHandler\('([^']+)'\)/)?.[1];
      if (dataset && dataset !== 'strings') datasets.push(dataset);
    }
    const catalogLanguages = [
      ...new Set(SUPPORTED_LOCALES.map((locale) => LOCALE_TO_API_MAPPING[locale] ?? locale)),
    ];
    assertEquals(datasets.length, 10);
    assertEquals(catalogLanguages.length, 13);
    const expected = origins.flatMap((origin) => [
      ...datasets.flatMap((dataset) =>
        modes.map((mode) => `${origin}/__neutral-catalog-v1/${dataset}/${mode}`)
      ),
      ...modes.map((mode) => `${origin}/__neutral-catalog-v1/tasks-objectives/${mode}/counts`),
      ...catalogLanguages.map((lang) => `${origin}/__neutral-catalog-v1/strings/${lang}`),
    ]);
    const urls = buildTarkovCacheUrls(origins);
    const neutral = urls.filter((url) =>
      new URL(url).pathname.startsWith('/__neutral-catalog-v1/')
    );
    assertEquals(neutral.sort(), expected.sort());
    assertEquals(neutral.length, 92);
    assertEquals(new Set(urls).size, urls.length);
  }
);
Deno.test('retains historical objective catalogs for every language and mode', () => {
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
Deno.test('preserves every retired versioned non-task purge target and its old scope', () => {
  const all = buildTarkovCacheUrls(origins);
  const keys = [
    'bootstrap-json-v2',
    'hideout-json-v5',
    'items-json-v2',
    'items-lite-json-v2',
    'map-spawns-json-v1',
    'prestige-json-v3',
  ];
  for (const key of keys) {
    const prefixes = origins.map((origin) => `${origin}/__edge-cache/tarkov/${key}-`);
    const expected = prefixes.flatMap((prefix) =>
      modes.flatMap((mode) =>
        key === 'bootstrap-json-v2'
          ? [prefix + mode]
          : languages.map((lang) => `${prefix}${lang}-${mode}`)
      )
    );
    const found = all.filter((url) => prefixes.some((prefix) => url.startsWith(prefix)));
    assertEquals(found.sort(), expected.sort(), key);
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
Deno.test('retains the exact historical task-rewards scopes', () => {
  const origins = ['https://tarkovtracker.org', 'https://www.tarkovtracker.org'];
  const targets = buildTarkovCacheUrls(origins);
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
