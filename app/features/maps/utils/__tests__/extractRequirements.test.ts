import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import snapshot from '@/data/extractRules.json';
import {
  appendExtractRequirementTags,
  createExtractDetails,
  getExtractRequirements,
} from '@/features/maps/utils/extractRequirements';
import en from '@/locales/en.json';
import type { MapExtract } from '@/types/tarkov';
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
const inspect = (mapId: string, extract: MapExtract, mode = 'pvp') =>
  getExtractRequirements({ mapId, extract, mode, t });
describe('extract requirements', () => {
  it('uses captured PvE costs instead of copying the PvP transfer price', () => {
    const pvp = inspect(groundZero, vehicle);
    const pve = inspect(groundZero, vehicle, 'pve');
    expect(pvp.tags.map((tag) => tag.key)).toEqual(['money', 'conditional']);
    expect(pvp.details.join(' ')).toContain('20000');
    expect(pve.details.join(' ')).toContain('5000');
    expect(pve.details.join(' ')).not.toContain('20000');
    expect(pve.details.join(' ')).toContain('price may vary with reputation');
    expect(inspect(groundZero, vehicle, 'seasonal').details.join(' ')).toContain('20000');
  });
  it('resolves Red Rebel, Paracord, and the exact empty armor slot from reference rules', () => {
    const result = inspect('5704e5fad2720bc05b8b4567', {
      id: 'c22a209b9f46247ff2d5376595377db3908d53fa',
      name: 'Cliff Descent',
    });
    expect(result.tags.map((tag) => tag.key)).toEqual(['gear', 'no_armor']);
    expect(result.details.join(' ')).toContain('Paracord');
    expect(result.details.join(' ')).toContain('Red Rebel ice pick');
    expect(result.details.join(' ')).toContain('body armor / armor vest slot empty');
    expect(result.details.join(' ')).not.toContain('backpack slot empty');
  });
  it('keeps per-extract PvE prices instead of assigning a universal vehicle fee', () => {
    const mapId = '5714dbc024597771384a510d';
    const entry = Object.entries(snapshot.maps[mapId]).find(
      ([, value]) => value.name === 'ex_interchange_pmc_auto'
    );
    expect(entry).toBeDefined();
    const result = inspect(mapId, { id: entry![0], name: 'Power Station V-Ex' }, 'pve');
    expect(result.details.join(' ')).toContain('20000');
    expect(result.details.join(' ')).not.toContain('5000');
  });
  it('supplements backend rules with reviewed door keys and smoke cues on the correct extract', () => {
    const woods = inspect('5704e3c2d2720bac5b8b4567', {
      id: 'c89cb6207811316f70945ed1de3e5e0d9f8cfc96',
      name: 'ZB-014',
    });
    expect(woods.tags.map((tag) => tag.key)).toEqual(['conditional', 'green_smoke', 'key']);
    expect(woods.details.join(' ')).toContain('ZB-014 key');
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
    expect(result.details).toEqual(['Keep the backpack slot empty.']);
  });
  it('keeps a green-flare requirement when names are translated', () => {
    const result = inspect(groundZero, {
      id: '22f281b913a76b31fe574b792b65c115fd8bb656',
      name: 'Мира',
    });
    expect(result.tags.map((tag) => tag.key)).toEqual(['flare']);
    expect(result.details.join(' ')).toContain('green signal flare');
    expect(result.details.join(' ')).toContain('designated signal area');
  });
  it('distinguishes chance and a smoke availability cue from a flare that must be brought', () => {
    const result = inspect('5704e3c2d2720bac5b8b4567', {
      id: '66f71d2b38d7af05a0fa888343dda2d5df97b314',
      name: 'ZB-016',
    });
    expect(result.tags.map((tag) => tag.key)).toEqual(['conditional', 'green_smoke']);
    expect(result.details.join(' ')).toContain('66%');
    expect(result.details.join(' ')).toContain('not the current raid status');
    expect(result.details.join(' ')).not.toContain('Fire a');
  });
  it('does not interpret an unrelated upstream switch reference as an activation requirement', () => {
    const result = inspect('56f40101d2720b2a4d8b45d6', {
      id: 'ab12c1f902a669fb0c940820e8cc40d7131e3208',
      name: 'Crossroads',
      switches: ['bogus'],
    } as MapExtract);
    expect(result.tags).toEqual([]);
    expect(result.details.join(' ')).toContain('does not guarantee');
  });
  it('does not treat the train timer count as an item cost', () => {
    const entry = Object.entries(snapshot.maps['5704e5fad2720bc05b8b4567']).find(
      ([, value]) => value.name === 'EXFIL_Train'
    );
    expect(entry).toBeDefined();
    const result = inspect('5704e5fad2720bc05b8b4567', { id: entry![0], name: 'Armored Train' });
    expect(result.tags.map((tag) => tag.key)).toEqual(['train']);
    expect(result.details.join(' ')).toContain('1450–1700 seconds');
    expect(result.details.join(' ')).not.toContain('Base cost');
  });
  it('keeps incomplete sources explicit and safely handles string and embedded item references', () => {
    const unknown = inspect('unknown', { id: 'missing', name: 'Unknown' });
    expect(unknown.tags.map((tag) => tag.key)).toEqual(['unknown']);
    expect(unknown.details.join(' ')).not.toContain('always open');
    const embedded = inspect('unknown', {
      id: 'missing',
      name: 'Unknown',
      transferItem: { item: { id: '5449016a4bdc2d6f028b456f' }, count: 8000 },
    });
    expect(embedded.details.join(' ')).toContain('8000 × roubles');
    expect(
      inspect('unknown', {
        id: 'missing',
        name: 'Unknown',
        transferItem: { item: 'x', count: NaN },
      }).tags.map((tag) => tag.key)
    ).toEqual(['unknown']);
  });
  it('shows badges without hover and creates safe click-through details with a live-status warning', () => {
    const requirements = inspect(groundZero, vehicle);
    const pin = document.createElement('div');
    pin.setAttribute('aria-label', 'Vehicle');
    appendExtractRequirementTags(pin, requirements);
    expect(pin.querySelector('.map-extract-requirements')?.textContent).toBe('MoneyConditional');
    expect(pin.querySelector('.map-extract-requirements')?.className).not.toContain('hidden');
    const panel = createExtractDetails('<img src=x onerror=alert(1)>', requirements, t);
    expect(panel.querySelector('h3')?.textContent).toContain('<img');
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.textContent).toContain('does not show live extract availability');
    expect(panel.textContent).toContain('20000');
    expect(panel.textContent).toContain('2026-11-06');
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
    };
    const result = getExtractRequirements(options);
    expect(result.details.join(' ')).toContain('2 × Captured payment item');
    expect(result.details.join(' ')).not.toContain('Metadata payment item');
    item.name = '   ';
    expect(getExtractRequirements(options).details.join(' ')).toContain('Metadata payment item');
  });
  it('ignores malformed external item names without interrupting requirement rendering', () => {
    for (const name of [123, {}, [], true, null]) {
      const result = getExtractRequirements({
        mapId: 'unknown',
        mode: 'pvp',
        t,
        extract: {
          id: 'malformed-name',
          name: 'Transfer',
          transferItem: { item: { id: 'custom-item', name }, count: 2 },
        } as unknown as MapExtract,
        itemName: () => 'Metadata payment item',
      });
      expect(result.details.join(' ')).toContain('2 × Metadata payment item');
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
