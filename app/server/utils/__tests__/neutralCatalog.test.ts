import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
import { buildCatalogStrings, buildNeutralCatalog } from '@/server/utils/neutralCatalog';
import { bindOverlayLocaleTargets, parseNeutralOverlay } from '@/server/utils/neutralOverlay';
import { fetchTarkovJsonEndpoint } from '@/server/utils/tarkov-json';
import * as tarkovJson from '@/server/utils/tarkov-json';
import {
  collectGameDataStrings,
  localizeGameData,
  overlayOverrideKey,
} from '@/utils/gameDataStrings';
import type { NeutralOverlaySnapshot } from '@/server/utils/neutralOverlay';
import type { TarkovJsonOptions } from '@/server/utils/tarkov-json';
const snapshot: NeutralOverlaySnapshot = {
  overlay: { editions: testOverlayEditions },
  meta: {
    status: 'fresh',
    sourceUrl: 'https://example.com/overlay-neutral.json',
    sha256: 'source',
  },
  strings: { en: { '@tt:overlay:/tasks/added/name': 'Added task' }, de: {} },
  localeTargets: {},
};
const upstream = (responses: Record<string, unknown>): TarkovJsonOptions => ({
  maxRetries: 1,
  deps: {
    fetcher: vi.fn(async (url) => {
      if (!(url in responses)) throw new Error(`Unexpected URL ${url}`);
      return responses[url];
    }) as NonNullable<TarkovJsonOptions['deps']>['fetcher'],
  },
});
describe('neutral catalogs', () => {
  it('publishes localized boss entries without adding ordinary NPC waves or fabricated positions', async () => {
    const position = { x: 1, y: 2, z: 3 };
    const options = upstream({
      'https://json.tarkov.dev/pve/tasks': { data: { tasks: [{ id: 'task', name: 'Task' }] } },
      'https://json.tarkov.dev/pve/traders': { data: [{ id: 'trader', name: 'Trader' }] },
      'https://json.tarkov.dev/pve/maps': {
        data: {
          maps: {
            map: {
              id: 'map',
              name: 'Map',
              bosses: [
                {
                  mob: 'bossBully',
                  spawnChance: 0.6,
                  spawnLocations: [
                    { name: 'stronghold', chance: 0.33, positions: [position, { x: '4' }] },
                    { name: 'dorms', chance: 0.33, positions: [] },
                  ],
                },
                { mob: 'bossPartisan', spawnChance: 0, spawnLocations: [] },
                { mob: 'bossBully', spawnChance: 1.5 },
                { mob: 'PmcBot', spawnChance: 1 },
              ],
            },
          },
          mobs: {
            bossBully: { name: 'reshala' },
            bossPartisan: { name: 'partisan' },
            PmcBot: { name: 'raider' },
          },
        },
        translations: ['$.data.maps.*.bosses[*].spawnLocations[*].name', '$.data.mobs.*.name'],
      },
      'https://json.tarkov.dev/pve/maps_en': {
        data: {
          reshala: 'Reshala',
          partisan: 'Partisan',
          stronghold: 'Stronghold',
          dorms: 'Dorms',
        },
      },
      'https://json.tarkov.dev/pve/maps_de': {
        data: { stronghold: 'Festung', dorms: 'Wohnheim' },
      },
    });
    const core = await buildNeutralCatalog('tasks-core', 'pve', { snapshot, upstream: options });
    const strings = await buildCatalogStrings('de', collectGameDataStrings(core.data), {
      snapshot,
      upstream: options,
    });
    expect(localizeGameData(core, strings.data.strings).data).toMatchObject({
      maps: [
        {
          bossSpawns: [
            {
              name: 'Reshala',
              chance: 0.6,
              locations: [
                { name: 'Festung', chance: 0.33, positions: [position] },
                { name: 'Wohnheim', chance: 0.33, positions: [] },
              ],
            },
            { name: 'Partisan', chance: 0, locations: [] },
          ],
        },
      ],
    });
  });
  it('retains equipment lists and groups in the neutral objective snapshot', async () => {
    const payload = await buildNeutralCatalog('tasks-objectives', 'regular', {
      snapshot,
      upstream: upstream({
        'https://json.tarkov.dev/regular/tasks': {
          data: {
            tasks: [
              {
                id: 'task',
                objectives: [
                  {
                    id: 'elimination',
                    type: 'shoot',
                    usingWeapon: ['weapon-a', 'weapon-b'],
                    usingWeaponMods: [['mod-a', 'mod-b']],
                    wearing: [[{ id: 'gear', name: 'Gear' }], ['helmet']],
                    notWearing: [['excluded']],
                  },
                ],
              },
            ],
          },
        },
        'https://json.tarkov.dev/regular/hideout': { data: {} },
        'https://json.tarkov.dev/regular/traders': { data: {} },
      }),
    });
    expect(payload.data.tasks).toMatchObject([
      {
        id: 'task',
        objectives: [
          {
            id: 'elimination',
            usingWeapon: [{ id: 'weapon-a' }, { id: 'weapon-b' }],
            usingWeaponMods: [[{ id: 'mod-a' }, { id: 'mod-b' }]],
            wearing: [[{ id: 'gear', name: 'Gear' }], [{ id: 'helmet' }]],
            notWearing: [[{ id: 'excluded' }]],
          },
        ],
      },
    ]);
  });
  it('accepts signed name and objective-description targets while preserving both entity IDs', async () => {
    const name = '@tt:overlay:/tasks/task/name';
    const description = '@tt:overlay:/tasks/task/objectives/objective/description';
    const value = {
      schemaVersion: 1,
      editions: testOverlayEditions,
      $meta: { version: 'v1', generated: 'today' },
      $source: { version: 'v1', generated: 'today', sha256: 'source' },
      $strings: { en: { [name]: 'Corrected task', [description]: 'Corrected objective' } },
      $localeTargets: {
        [name]: ['tasks', 'task', 'name'],
        [description]: ['tasks', 'task', 'objectives', 'objective', 'description'],
      },
    };
    const sha256 = createHash('sha256')
      .update(JSON.stringify(value, null, 2))
      .digest('hex');
    const parsed = await parseNeutralOverlay({ ...value, $meta: { ...value.$meta, sha256 } });
    const original = {
      data: {
        tasks: [
          {
            id: 'task',
            name: 'Original task',
            objectives: [{ id: 'objective', description: 'Original objective' }],
          },
        ],
      },
    };
    const bound = bindOverlayLocaleTargets(original, parsed, 'regular');
    const table = await buildCatalogStrings('en', collectGameDataStrings(bound), {
      snapshot: parsed,
    });
    expect(localizeGameData(bound, table.data.strings)).toEqual({
      data: {
        tasks: [
          {
            id: 'task',
            name: 'Corrected task',
            objectives: [{ id: 'objective', description: 'Corrected objective' }],
          },
        ],
      },
    });
  });
  it.each([
    ['tasks', 'task', 'id'],
    ['tasks', 'task', 'type'],
    ['tasks', 'task', 'objectives', 'objective', 'count'],
    ['maps', 'map', 'extractsAdd', 'exit', 'name'],
    ['unknown', 'task', 'name'],
  ])(
    'rejects a signed locale target that rewrites identity or structural fields %j',
    async (...path) => {
      const key = `@tt:overlay:/${path.join('/')}`;
      const value = {
        schemaVersion: 1,
        editions: testOverlayEditions,
        $meta: { version: 'v1', generated: 'today' },
        $source: { version: 'v1', generated: 'today', sha256: 'source' },
        $strings: { en: { [key]: 'Changed' } },
        $localeTargets: { [key]: path },
      };
      const sha256 = createHash('sha256')
        .update(JSON.stringify(value, null, 2))
        .digest('hex');
      await expect(
        parseNeutralOverlay({ ...value, $meta: { ...value.$meta, sha256 } })
      ).rejects.toThrow('Invalid neutral overlay strings');
    }
  );
  it.each([
    ['de', 'Im Raid gefunden abgeben: Item'],
    ['fr', "Remise trouvée lors d'un raid: Item"],
    ['en', 'Hand over the found in raid item: Item'],
    ['tr', 'Hand over the found in raid item: Item'],
    ['hu', 'Hand over the found in raid item: Item'],
    ['__proto__', 'Hand over the found in raid item: Item'],
  ])(
    'localizes generated hand-over descriptions for %s with English fallback',
    async (language, expected) => {
      const token = '@tt:template:hand-over:Item';
      const result = await buildCatalogStrings(language!, new Set([token]), { snapshot });
      expect(result.data.strings[token]).toBe(expected);
    }
  );
  it('reports unsupported neutral translation paths without naming an unrelated endpoint', async () => {
    const options = upstream({
      'https://json.tarkov.dev/pve/tasks': {
        data: { tasks: [] },
        translations: ['$.data.tasks[0].name'],
      },
    });
    await expect(
      fetchTarkovJsonEndpoint('tasks', { ...options, gameMode: 'pve', neutral: true })
    ).rejects.toThrow('Unsupported json.tarkov.dev translation path');
  });
  it('uses English overlay corrections before the previous field when a locale has no override', async () => {
    const key = '@tt:overlay:/tasks/task/name';
    const token = overlayOverrideKey('pve', key, 'Previous upstream text');
    const local = {
      ...snapshot,
      strings: { en: { [key]: 'English correction' }, de: { [key]: 'Deutsche Korrektur' } },
    };
    const englishFallback = await buildCatalogStrings('fr', new Set([token]), { snapshot: local });
    const requested = await buildCatalogStrings('de', new Set([token]), { snapshot: local });
    expect(englishFallback.data.strings[token]).toBe('English correction');
    expect(requested.data.strings[token]).toBe('Deutsche Korrektur');
  });
  it('sanitizes adapted null skill rewards before applying overlay corrections', async () => {
    const factory = vi.spyOn(tarkovJson, 'createTarkovJsonTaskRewardsFetcher').mockReturnValue(
      async () =>
        ({
          data: {
            tasks: [
              {
                id: 'task',
                finishRewards: {
                  skillLevelReward: [
                    { skill: null, level: 1 },
                    { skill: { id: 'Endurance', name: 'Endurance' }, level: 2 },
                  ],
                },
              },
            ],
          },
        }) as Awaited<ReturnType<ReturnType<typeof tarkovJson.createTarkovJsonTaskRewardsFetcher>>>
    );
    try {
      const response = await buildNeutralCatalog('tasks-rewards', 'pve', { snapshot });
      expect(response.data.tasks).toEqual([
        expect.objectContaining({
          finishRewards: expect.objectContaining({
            skillLevelReward: [{ skill: { id: 'Endurance', name: 'Endurance' }, level: 2 }],
          }),
        }),
      ]);
    } finally {
      factory.mockRestore();
    }
  });
  it('keeps objective inference and expanded item descriptions independent of translation references', async () => {
    const description = '@tt:overlay:/tasks/task/objectivesAdd/synthetic/description';
    const first = '@tt:overlay:/items/a/name';
    const second = '@tt:overlay:/items/b/name';
    const corrected = {
      ...snapshot,
      strings: {
        en: {
          [description]: 'Hand over the found in raid items',
          [first]: 'First item',
          [second]: 'Second item',
        },
        de: { [first]: 'Erster Gegenstand', [second]: 'Zweiter Gegenstand' },
      },
      overlay: {
        ...snapshot.overlay,
        tasks: {
          task: {
            objectivesAdd: [
              {
                id: 'synthetic',
                description,
                items: [
                  { id: 'a', name: first },
                  { id: 'b', name: second },
                ],
              },
            ],
          },
        },
      },
    };
    const options = upstream({
      'https://json.tarkov.dev/pve/tasks': { data: { tasks: [{ id: 'task', objectives: [] }] } },
      'https://json.tarkov.dev/pve/hideout': { data: [] },
      'https://json.tarkov.dev/pve/traders': { data: [] },
    });
    const neutral = await buildNeutralCatalog('tasks-objectives', 'pve', {
      snapshot: corrected,
      upstream: options,
    });
    const table = await buildCatalogStrings('de', collectGameDataStrings(neutral.data), {
      snapshot: corrected,
      upstream: options,
    });
    const tasks = localizeGameData(neutral, table.data.strings).data.tasks;
    expect(tasks).toEqual([
      expect.objectContaining({
        objectives: [
          expect.objectContaining({
            id: 'synthetic:a',
            type: 'giveItem',
            foundInRaid: true,
            description: 'Im Raid gefunden abgeben: Erster Gegenstand',
          }),
          expect.objectContaining({
            id: 'synthetic:b',
            type: 'giveItem',
            foundInRaid: true,
            description: 'Im Raid gefunden abgeben: Zweiter Gegenstand',
          }),
        ],
      }),
    ]);
  });
  it('fails publication on a translation transport error and only falls back for an absent table', async () => {
    const refs = new Set(['@tt:pve:tasks:objective']);
    const failing = (status: number): TarkovJsonOptions => ({
      maxRetries: 1,
      deps: {
        fetcher: vi.fn(async (url: string) => {
          if (url.endsWith('_en')) return { data: { objective: 'English' } };
          throw Object.assign(new Error('translation unavailable'), { statusCode: status });
        }) as NonNullable<TarkovJsonOptions['deps']>['fetcher'],
      },
    });
    await expect(
      buildCatalogStrings('de', refs, { snapshot, upstream: failing(500) })
    ).rejects.toThrow('translation unavailable');
    const missing = await buildCatalogStrings('de', refs, { snapshot, upstream: failing(404) });
    expect(missing.data.strings['@tt:pve:tasks:objective']).toBe('English');
  });
  it('keeps a locale-only wiki link in its owning core projection with an empty English fallback', async () => {
    const key = '@tt:overlay:/tasks/task/wikiLink';
    const local = {
      ...snapshot,
      localeTargets: { [key]: ['tasks', 'task', 'wikiLink'] },
      strings: { en: {}, de: { [key]: 'https://escapefromtarkov.fandom.com/wiki/Test' } },
    };
    const options = upstream({
      'https://json.tarkov.dev/regular/tasks': {
        data: { tasks: [{ id: 'task', name: 'Task', objectives: [] }] },
      },
      'https://json.tarkov.dev/regular/maps': { data: { maps: [{ id: 'map', name: 'Map' }] } },
      'https://json.tarkov.dev/regular/traders': { data: [{ id: 'trader', name: 'Trader' }] },
      'https://json.tarkov.dev/regular/hideout': { data: [] },
    });
    const core = await buildNeutralCatalog('tasks-core', 'regular', {
      snapshot: local,
      upstream: options,
    });
    const refs = collectGameDataStrings(core.data);
    const english = await buildCatalogStrings('en', refs, { snapshot: local, upstream: options });
    const german = await buildCatalogStrings('de', refs, { snapshot: local, upstream: options });
    expect(localizeGameData(core, english.data.strings).data.tasks).toEqual([
      expect.objectContaining({ id: 'task', wikiLink: '' }),
    ]);
    expect(localizeGameData(core, german.data.strings).data.tasks).toEqual([
      expect.objectContaining({
        id: 'task',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Test',
      }),
    ]);
    const objectives = await buildNeutralCatalog('tasks-objectives', 'regular', {
      snapshot: local,
      upstream: options,
    });
    expect(objectives.data.tasks).toEqual([
      expect.not.objectContaining({ wikiLink: expect.anything() }),
    ]);
  });
  it('applies hideout corrections before publication and keeps the source identity', async () => {
    const options = upstream({
      'https://json.tarkov.dev/pve/hideout': {
        data: [{ id: 'station', name: 'station-name', levels: [] }],
        translations: ['$.data[*].name'],
      },
      'https://json.tarkov.dev/pve/traders': { data: [] },
    });
    const corrected = {
      ...snapshot,
      overlay: {
        ...snapshot.overlay,
        hideout: { station: { name: '@tt:overlay:/hideout/station/name' } },
      },
    };
    const result = await buildNeutralCatalog('hideout', 'pve', {
      snapshot: corrected,
      upstream: options,
    });
    expect(result.data.hideoutStations).toEqual([
      expect.objectContaining({ id: 'station', name: '@tt:overlay:/hideout/station/name' }),
    ]);
    expect(result.dataOverlay?.sha256).toBe('source');
  });
  it('rejects empty task sources before overlay additions can make them look complete', async () => {
    const options = upstream({
      'https://json.tarkov.dev/pve/tasks': { data: { tasks: [] } },
      'https://json.tarkov.dev/pve/hideout': { data: [] },
      'https://json.tarkov.dev/pve/traders': { data: [] },
    });
    await expect(
      buildNeutralCatalog('tasks-objectives', 'pve', {
        snapshot: {
          ...snapshot,
          overlay: { ...snapshot.overlay, tasksAdd: { added: { name: 'Synthetic' } } },
        },
        upstream: options,
      })
    ).rejects.toThrow('Invalid or empty tasks-objectives');
  });
  it('retains a valid empty seasonal prestige catalog and rejects a missing source field', async () => {
    const responses = {
      'https://json.tarkov.dev/pvp-season/tasks': { data: { tasks: [], prestige: [] } },
      'https://json.tarkov.dev/pvp-season/hideout': { data: [] },
      'https://json.tarkov.dev/pvp-season/traders': { data: [] },
    };
    const valid = await buildNeutralCatalog('prestige', 'pvp-season', {
      snapshot,
      upstream: upstream(responses),
    });
    expect(valid.data.prestige).toEqual([]);
    await expect(
      buildNeutralCatalog('prestige', 'pvp-season', {
        snapshot,
        upstream: upstream({
          ...responses,
          'https://json.tarkov.dev/pvp-season/tasks': { data: { tasks: [] } },
        }),
      })
    ).rejects.toThrow('Invalid prestige source');
  });
  it('rejects seasonal perk corrections that reference an absent upstream perk', async () => {
    const options = upstream({
      'https://json.tarkov.dev/pvp-season/season': {
        data: {
          perks: {
            common: [
              {
                id: 'present',
                name: 'name',
                description: 'description',
                points: null,
                exclusiveToPerks: [],
              },
            ],
          },
        },
        translations: ['$.data.perks.*[*].name', '$.data.perks.*[*].description'],
      },
    });
    await expect(
      buildNeutralCatalog('editions', 'pvp-season', {
        snapshot: {
          ...snapshot,
          overlay: { ...snapshot.overlay, seasonalPerks: { absent: { effects: [] } } },
        },
        upstream: options,
      })
    ).rejects.toThrow('Seasonal perk corrections incompatible');
  });
  it('sanitizes translated links after resolving their table values', async () => {
    const options = upstream({
      'https://json.tarkov.dev/regular/tasks_en': {
        data: { safe: 'https://tarkov.dev/task/test', unsafe: 'javascript:alert(1)' },
      },
    });
    const refs = new Set(['@tt:link:regular:tasks:safe', '@tt:link:regular:tasks:unsafe']);
    const result = await buildCatalogStrings('en', refs, { snapshot, upstream: options });
    expect(result.data.strings).toEqual({
      '@tt:link:regular:tasks:safe': 'https://tarkov.dev/task/test',
      '@tt:link:regular:tasks:unsafe': '',
    });
  });
  it('fetches only base data, scopes description keys and preserves an identical objective ID', async () => {
    const source = {
      data: {
        tasks: [{ id: 'task', objectives: [{ id: 'shared-id', description: 'shared-id' }] }],
      },
      translations: ['$.data.tasks[*].objectives[*].description', '$..description'],
    };
    const options = upstream({ 'https://json.tarkov.dev/pve/tasks': source });
    const payload = await fetchTarkovJsonEndpoint<typeof source.data>('tasks', {
      ...options,
      gameMode: 'pve',
      neutral: true,
    });
    expect(payload.tasks[0]?.objectives).toEqual([
      { id: 'shared-id', description: '@tt:pve:tasks:shared-id' },
    ]);
    expect(options.deps?.fetcher).toHaveBeenCalledTimes(1);
    expect(source.data.tasks[0]?.objectives[0]?.description).toBe('shared-id');
  });
  it('keeps source and mode collisions separate with English fallback and overlay additions', async () => {
    const options = upstream({
      'https://json.tarkov.dev/regular/tasks_en': { data: { shared: 'Prestige 1 dogtag' } },
      'https://json.tarkov.dev/regular/tasks_de': { data: { shared: 'Prestige 1 Marke' } },
      'https://json.tarkov.dev/pve/tasks_en': { data: { shared: 'Level 20 dogtag' } },
      'https://json.tarkov.dev/pve/tasks_de': { data: { shared: 'Level 20 Marke' } },
      'https://json.tarkov.dev/regular/items_en': { data: { shared: 'Hammer' } },
      'https://json.tarkov.dev/regular/items_de': { data: {} },
    });
    const value = {
      id: 'shared',
      regular: '@tt:regular:tasks:shared',
      pve: '@tt:pve:tasks:shared',
      item: '@tt:regular:items:shared',
      addition: '@tt:overlay:/tasks/added/name',
    };
    const result = await buildCatalogStrings('de', collectGameDataStrings(value), {
      snapshot,
      upstream: options,
    });
    expect(localizeGameData(value, result.data.strings)).toEqual({
      id: 'shared',
      regular: 'Prestige 1 Marke',
      pve: 'Level 20 Marke',
      item: 'Hammer',
      addition: 'Added task',
    });
  });
  it('binds locale-only corrections without modifying IDs or the original neutral catalog', async () => {
    const key = '@tt:overlay:/tasks/task/objectives/objective/description';
    const original = {
      data: {
        tasks: [
          { id: 'task', objectives: [{ id: 'objective', description: '@tt:pve:tasks:objective' }] },
        ],
      },
    };
    const localizedSnapshot = {
      ...snapshot,
      localeTargets: { [key]: ['tasks', 'task', 'objectives', 'objective', 'description'] },
      strings: { en: {}, de: { [key]: 'Korrigiert' } },
    };
    const bound = bindOverlayLocaleTargets(original, localizedSnapshot, 'pve');
    const token = overlayOverrideKey('pve', key, '@tt:pve:tasks:objective');
    expect(bound.data.tasks[0]?.objectives[0]?.description).toBe(token);
    expect(original.data.tasks[0]?.objectives[0]?.description).toBe('@tt:pve:tasks:objective');
    const options = upstream({
      'https://json.tarkov.dev/pve/tasks_en': { data: { objective: 'English requirement' } },
      'https://json.tarkov.dev/pve/tasks_fr': { data: {} },
    });
    const german = await buildCatalogStrings('de', new Set([token]), {
      snapshot: localizedSnapshot,
      upstream: options,
    });
    expect(german.data.strings[token]).toBe('Korrigiert');
    const french = await buildCatalogStrings('fr', new Set([token]), {
      snapshot: localizedSnapshot,
      upstream: options,
    });
    expect(french.data.strings[token]).toBe('English requirement');
  });
  it('rejects an unresolved reference instead of publishing a partial language bundle', async () => {
    const options = upstream({ 'https://json.tarkov.dev/pve/tasks_en': { data: {} } });
    await expect(
      buildCatalogStrings('en', new Set(['@tt:pve:tasks:missing']), {
        snapshot,
        upstream: options,
      })
    ).rejects.toThrow('Missing game data string');
  });
  it('rejects a neutral overlay whose content no longer matches its digest', async () => {
    await expect(
      parseNeutralOverlay({
        schemaVersion: 1,
        $source: { version: 'v1', generated: 'today', sha256: 'source' },
        $meta: { version: 'v1', generated: 'today', sha256: 'wrong' },
        $strings: { en: {} },
        $localeTargets: {},
        editions: testOverlayEditions,
      })
    ).rejects.toThrow('digest mismatch');
  });
});
