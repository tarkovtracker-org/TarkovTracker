import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import {
  appendExtractRequirementTags,
  createExtractDetails,
  describeExtractSource,
  getExtractDataSource,
  getExtractRequirements,
  type ExtractRequirements,
} from '@/features/maps/utils/extractRequirements';
import en from '@/locales/en.json';
import fixture from '@/utils/__tests__/fixtures/extractRuleData.json';
import type { MapExtract } from '@/types/tarkov';
import type { ExtractRuleData } from '@/utils/extractRuleData';
const i18n = createI18n<[typeof en], 'en', false>({
  legacy: false,
  locale: 'en',
  messages: { en },
});
const t = (key: string, params: Record<string, string | number> = {}) => i18n.global.t(key, params);
const groundZero = '653e6760052c01c1c805532f';
const vehicle: MapExtract = {
  id: 'e858220a780a95ffbb923225d7649aa134df8836',
  name: 'Police Cordon V-Ex',
  transferItem: { item: '5449016a4bdc2d6f028b456f', count: 20000 },
};
/** A subset of a published overlay's extract sections, covering the extracts tested here. */
const data = fixture as ExtractRuleData;
const inspect = (
  mapId: string,
  extract: MapExtract,
  mode = 'pvp',
  ruleData: ExtractRuleData | null = data
) => getExtractRequirements({ mapId, extract, mode, t, data: ruleData });
/** Every popup row's instruction and qualifier, as one searchable string. */
const copy = (result: ExtractRequirements) =>
  result.details.map((entry) => [entry.text, entry.hint].join(' ')).join(' ');
const amount = (count: number) => new Intl.NumberFormat().format(count);
describe('extract requirements', () => {
  it('uses captured PvE costs instead of copying the PvP transfer price', () => {
    const pvp = inspect(groundZero, vehicle);
    const pve = inspect(groundZero, vehicle, 'pve');
    expect(pvp.tags.map((tag) => tag.key)).toEqual(['money', 'conditional']);
    expect(copy(pvp)).toContain(`Pay ${amount(20000)} roubles`);
    expect(copy(pve)).toContain(amount(5000));
    expect(copy(pve)).not.toContain(amount(20000));
    expect(copy(pve)).toContain('Price varies with reputation');
    expect(copy(inspect(groundZero, vehicle, 'seasonal'))).toContain(amount(20000));
  });
  it('resolves Red Rebel, Paracord, and the exact empty armor slot from reference rules', () => {
    const result = inspect('5704e5fad2720bc05b8b4567', {
      id: 'c22a209b9f46247ff2d5376595377db3908d53fa',
      name: 'Cliff Descent',
    });
    expect(result.tags.map((tag) => tag.key)).toEqual(['gear', 'no_armor']);
    expect(copy(result)).toContain('Paracord');
    expect(copy(result)).toContain('Red Rebel ice pick');
    expect(copy(result)).toContain('No body armor equipped');
    expect(copy(result)).not.toContain('No backpack equipped');
  });
  it('keeps per-extract PvE prices instead of assigning a universal vehicle fee', () => {
    const mapId = '5714dbc024597771384a510d';
    const entry = Object.entries(data.requirements.maps[mapId]!).find(
      ([, value]) => value.name === 'ex_interchange_pmc_auto'
    );
    expect(entry).toBeDefined();
    const result = inspect(mapId, { id: entry![0], name: 'Power Station V-Ex' }, 'pve');
    expect(copy(result)).toContain(amount(20000));
    expect(copy(result)).not.toContain(amount(5000));
  });
  it('supplements backend rules with reviewed door keys and smoke cues on the correct extract', () => {
    const woods = inspect('5704e3c2d2720bac5b8b4567', {
      id: 'c89cb6207811316f70945ed1de3e5e0d9f8cfc96',
      name: 'ZB-014',
    });
    expect(woods.tags.map((tag) => tag.key)).toEqual(['conditional', 'green_smoke', 'key']);
    expect(copy(woods)).toContain('ZB-014 key');
    const scav = inspect('56f40101d2720b2a4d8b45d6', {
      id: 'd2cefbb74bd24ffc53a1a3a148069483c5fae6cb',
      name: 'Old Gas Station',
    });
    expect(scav.tags.map((tag) => tag.key)).not.toContain('green_smoke');
  });
  it('distinguishes no-backpack extracts from unrestricted transfers and other gear', () => {
    const result = inspect('5704e5fad2720bc05b8b4567', {
      id: '78919c46c8d06b4ea7790a701b383e1cc0dda28e',
      name: 'Sewer Manhole',
    });
    expect(result.tags.map((tag) => tag.key)).toEqual(['no_backpack']);
    expect(result.details).toEqual([{ tag: 'no_backpack', text: 'No backpack equipped' }]);
  });
  it('keeps a green-flare requirement when names are translated', () => {
    const result = inspect(groundZero, {
      id: '22f281b913a76b31fe574b792b65c115fd8bb656',
      name: 'Мира',
    });
    expect(result.tags.map((tag) => tag.key)).toEqual(['flare']);
    expect(result.details[0]).toMatchObject({
      tag: 'flare',
      text: 'Fire a green flare in the signal area first',
    });
  });
  it('distinguishes chance and a smoke availability cue from a flare that must be brought', () => {
    const result = inspect('5704e3c2d2720bac5b8b4567', {
      id: '66f71d2b38d7af05a0fa888343dda2d5df97b314',
      name: 'ZB-016',
    });
    expect(result.tags.map((tag) => tag.key)).toEqual(['conditional', 'green_smoke']);
    expect(copy(result)).toContain('66%');
    expect(result.details.map((entry) => entry.tag)).toEqual(['conditional', 'green_smoke']);
    expect(copy(result)).not.toContain('Fire a');
  });
  it('does not interpret an unrelated upstream switch reference as an activation requirement', () => {
    const result = inspect('56f40101d2720b2a4d8b45d6', {
      id: 'ab12c1f902a669fb0c940820e8cc40d7131e3208',
      name: 'Crossroads',
      switches: ['bogus'],
    } as MapExtract);
    expect(result.tags).toEqual([]);
    expect(copy(result)).toContain('not guaranteed');
  });
  it('does not treat the train timer count as an item cost', () => {
    const entry = Object.entries(data.requirements.maps['5704e5fad2720bc05b8b4567']!).find(
      ([, value]) => value.name === 'EXFIL_Train'
    );
    expect(entry).toBeDefined();
    const result = inspect('5704e5fad2720bc05b8b4567', { id: entry![0], name: 'Armored Train' });
    expect(result.tags.map((tag) => tag.key)).toEqual(['train']);
    expect(result.details).toEqual([
      {
        tag: 'train',
        text: 'Board before the train leaves',
        hint: 'Window: 24:10–28:20 into the raid',
      },
    ]);
  });
  it('keeps incomplete sources explicit and safely handles string and embedded item references', () => {
    const unknown = inspect('unknown', { id: 'missing', name: 'Unknown' });
    expect(unknown.tags.map((tag) => tag.key)).toEqual(['unknown']);
    expect(copy(unknown)).not.toContain('always open');
    const embedded = inspect('unknown', {
      id: 'missing',
      name: 'Unknown',
      transferItem: { item: { id: '5449016a4bdc2d6f028b456f' }, count: 8000 },
    });
    expect(copy(embedded)).toContain(`Pay ${amount(8000)} roubles`);
    expect(
      inspect('unknown', {
        id: 'missing',
        name: 'Unknown',
        transferItem: { item: 'x', count: NaN },
      }).tags.map((tag) => tag.key)
    ).toEqual(['unknown']);
  });
  it('reads every extract as unknown, never as unrestricted, before rule data is available', () => {
    const cliff = { id: 'c22a209b9f46247ff2d5376595377db3908d53fa', name: 'Cliff Descent' };
    const missing = inspect('5704e5fad2720bc05b8b4567', cliff, 'pvp', null);
    expect(missing.tags.map((tag) => tag.key)).toEqual(['unknown']);
    expect(missing.details).toEqual([
      { tag: 'unknown', text: 'Requirements unknown. Check in raid.', hint: undefined },
    ]);
    expect(copy(missing)).not.toContain('No requirements listed');
    // Curated cues arrive with the rules, so none show without them.
    const sniper = { id: '22f281b913a76b31fe574b792b65c115fd8bb656', name: 'Mira Avenue' };
    expect(inspect(groundZero, sniper, 'pvp', null).tags.map((tag) => tag.key)).toEqual([
      'unknown',
    ]);
    // The tarkov.dev transfer cost still shows beside the unknown cue.
    const priced = inspect(groundZero, vehicle, 'pvp', null);
    expect(priced.tags.map((tag) => tag.key)).toEqual(['unknown', 'money']);
    expect(copy(priced)).toContain(`Pay ${amount(20000)} roubles`);
    // Without rule data there is no capture to name, so the map omits its source line.
    expect(getExtractDataSource(groundZero, 'pvp', null)).toBeUndefined();
  });
  it('shows requirement icons without hover and creates safe compact details with a live-status note', () => {
    const requirements = inspect(groundZero, vehicle);
    const pin = document.createElement('div');
    pin.setAttribute('aria-label', 'Vehicle');
    appendExtractRequirementTags(pin, requirements);
    const strip = pin.querySelector<HTMLElement>('.map-extract-requirements');
    expect(strip?.dataset.tags).toBe('money conditional');
    expect(strip?.querySelectorAll('svg')).toHaveLength(2);
    expect(strip?.textContent).toBe('');
    expect(strip?.title).toBe('Money, Conditional');
    expect(strip?.className).not.toContain('hidden');
    expect(pin.getAttribute('aria-label')).toBe('Vehicle, Money, Conditional');
    const panel = createExtractDetails('<img src=x onerror=alert(1)>', requirements);
    expect(panel.querySelector('h3')?.textContent).toContain('<img');
    expect(panel.querySelector('img')).toBeNull();
    // One icon row per requirement: the payment and the vehicle condition.
    expect(panel.querySelectorAll('li')).toHaveLength(2);
    expect(panel.querySelectorAll('li svg')).toHaveLength(2);
    expect(panel.textContent).toContain(`Pay ${amount(20000)} roubles`);
    // The source and not-live notice are map-level, so popups do not repeat them.
    expect(panel.textContent).not.toContain('Not live raid status');
    expect(panel.textContent).not.toContain('game data');
  });
  it('names the game capture for each mode and flags maps that use curated cues', () => {
    const regular = getExtractDataSource(groundZero, 'pvp', data);
    expect(regular).toEqual({
      clientVersion: '1.3.0.0',
      clientBuild: fixture.requirements.sources.regular.clientBuild,
      curatedCues: true,
    });
    // PvE reads the regular definitions' PvE fields, so it shares the regular capture.
    expect(getExtractDataSource(groundZero, 'pve', data)).toEqual(regular);
    expect(getExtractDataSource(groundZero, 'seasonal', data)).toEqual({
      clientVersion: '1.3.0.1',
      clientBuild: fixture.requirements.sources['pvp-season'].clientBuild,
      curatedCues: true,
    });
    // Maps without curated cues say so; no capture dates are published.
    const reserve = getExtractDataSource('5704e5fad2720bc05b8b4567', 'pvp', data);
    expect(reserve?.curatedCues).toBe(false);
    expect(describeExtractSource(regular!, t)).toEqual({
      label: 'Requirements: game data, EFT 1.3.0.0, plus curated cues',
      detail:
        "From the EFT 1.3.0.0.48484 client's location and global definitions. Base values only; check the in-raid extraction list. Flare, smoke and key cues the game data does not describe are curated from tarkov.help.",
    });
    expect(describeExtractSource(reserve!, t).label).toBe('Requirements: game data, EFT 1.3.0.0');
    expect(describeExtractSource(reserve!, t).detail).not.toContain('tarkov.help');
    expect(getExtractDataSource('unknown-map', 'pvp', data)).toBeUndefined();
    expect(getExtractDataSource(groundZero, 'arena', data)).toBeUndefined();
    const regularOnly = {
      ...data,
      requirements: {
        ...data.requirements,
        sources: { regular: data.requirements.sources.regular },
      },
    };
    expect(getExtractDataSource(groundZero, 'seasonal', regularOnly)).toBeUndefined();
  });
  it('uses PvE train windows and drops a chance the current mode never applies', () => {
    const lighthouse = '5704e4dad2720bb55b8b4567';
    const entry = Object.entries(data.requirements.maps[lighthouse]!).find(
      ([, value]) => value.name === 'EXFIL_Train'
    );
    expect(entry).toBeDefined();
    const train = { id: entry![0], name: 'Train' };
    expect(inspect(lighthouse, train).details[0]?.hint).toBe('Window: 20:00–25:00 into the raid');
    expect(inspect(lighthouse, train, 'pve').details[0]?.hint).toBe(
      'Window: 21:40–23:40 into the raid'
    );
    const custom = {
      requirements: {
        sources: data.requirements.sources,
        maps: {
          map: {
            closed: { name: 'closed', rules: [{ type: 'chance', percent: 100, percentPve: 0 }] },
          },
        },
      },
      cues: {},
    } as ExtractRuleData;
    const exit = { id: 'closed', name: 'Closed in PvE' };
    expect(inspect('map', exit, 'pvp', custom).tags).toEqual([]);
    expect(inspect('map', exit, 'pve', custom).details).toEqual([
      { tag: 'conditional', text: '0% chance to be open', hint: undefined },
    ]);
  });
  it('adds curated cues after the game rules and keeps cue-only maps cue-only', () => {
    const woods = '5704e3c2d2720bac5b8b4567';
    const zb014 = { id: 'c89cb6207811316f70945ed1de3e5e0d9f8cfc96', name: 'ZB-014' };
    expect(inspect(woods, zb014).tags.map((tag) => tag.key)).toEqual([
      'conditional',
      'green_smoke',
      'key',
    ]);
    const withoutCues = { ...data, cues: {} };
    expect(inspect(woods, zb014, 'pvp', withoutCues).tags.map((tag) => tag.key)).toEqual([
      'conditional',
    ]);
  });
  it('orders pin icons by the legend, skips glyph-redundant ones, and collapses overflow', () => {
    const pin = document.createElement('div');
    pin.setAttribute('aria-label', 'Gate');
    const tag = (key: string) => ({ key, label: key });
    appendExtractRequirementTags(
      pin,
      {
        tags: ['conditional', 'coop', 'flare', 'key', 'money'].map(tag),
        details: [],
      },
      ['coop']
    );
    const strip = pin.querySelector<HTMLElement>('.map-extract-requirements');
    expect(strip?.dataset.tags).toBe('money key flare conditional');
    expect(strip?.querySelectorAll('svg')).toHaveLength(3);
    expect(strip?.textContent).toBe('+1');
    expect(pin.getAttribute('aria-label')).toContain('coop');
    const coopOnly = document.createElement('div');
    appendExtractRequirementTags(coopOnly, { tags: [tag('coop')], details: [] }, ['coop']);
    expect(coopOnly.querySelector('.map-extract-requirements')).toBeNull();
  });
  it('formats costs with the app locale formatter instead of the browser default', () => {
    const result = getExtractRequirements({
      mapId: groundZero,
      extract: vehicle,
      mode: 'pvp',
      t,
      data,
      formatNumber: (count) => count.toLocaleString('de-DE'),
    });
    expect(result.details[0]?.text).toBe('Pay 20.000 roubles');
    // The vehicle row states only the reviewed condition, without an unsourced usage limit.
    expect(result.details[1]).toEqual({ tag: 'conditional', text: 'Vehicle must still be there' });
  });
  it('preserves a supplied transfer item name before consulting optional metadata', () => {
    const item = { id: 'custom-item', name: 'Captured payment item' };
    const options = {
      mapId: 'unknown',
      mode: 'pvp',
      extract: {
        id: 'adapted',
        name: 'Item handover',
        transferItem: { item, count: 2 },
      },
      itemName: () => 'Metadata payment item',
      t,
      data,
    };
    const result = getExtractRequirements(options);
    expect(copy(result)).toContain('2 × Captured payment item');
    expect(copy(result)).not.toContain('Metadata payment item');
    item.name = '   ';
    expect(copy(getExtractRequirements(options))).toContain('Metadata payment item');
  });
  it('ignores malformed external item names without interrupting requirement rendering', () => {
    for (const name of [123, {}, [], true, null]) {
      const result = getExtractRequirements({
        mapId: 'unknown',
        mode: 'pvp',
        t,
        data,
        extract: {
          id: 'malformed-name',
          name: 'Transfer',
          transferItem: { item: { id: 'custom-item', name }, count: 2 },
        } as unknown as MapExtract,
        itemName: () => 'Metadata payment item',
      });
      expect(copy(result)).toContain('2 × Metadata payment item');
    }
  });
  it('rejects invalid external item IDs rather than producing a handover rule', () => {
    for (const id of [123, {}, [], true, null, '   ']) {
      const result = inspect('unknown', {
        id: 'malformed-id',
        name: 'Transfer',
        transferItem: { item: { id, name: 'Payment item' }, count: 2 },
      } as unknown as MapExtract);
      expect(result.tags.map((tag) => tag.key)).toEqual(['unknown']);
    }
  });
});
