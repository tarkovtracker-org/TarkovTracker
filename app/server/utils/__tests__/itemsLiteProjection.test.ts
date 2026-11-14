import { describe, expect, it, vi } from 'vitest';
import {
  adaptItemsResponse,
  createTarkovJsonItemsFetcher,
  fetchTarkovJsonEndpoint,
} from '@/server/utils/tarkov-json';
const discardedPaths = [
  ['description', '$.data.items.*.description'],
  ['fleaMarket', '$.data.fleaMarket.*.name'],
  ['armorMaterial', '$.data.armorMaterial.*.name'],
  ['skills', '$.data.skills.*.name'],
  ['itemCategories', '$.data.itemCategories.*.name'],
  ['handbookCategories', '$.data.handbookCategories.*.name'],
] as const;
function fixture() {
  return {
    data: {
      items: {
        item: {
          id: 'item',
          name: 'NAME',
          shortName: 'SHORT',
          description: 'description',
          categories: ['category'],
          containsItems: [{ item: 'preset', count: 2 }],
          properties: { defaultPreset: 'preset', armorType: 'ARMOR', zones: ['ZONE'] },
          link: 'https://tarkov.dev/item/item',
          wikiLink: 'javascript:alert(1)',
        },
        preset: { id: 'preset', name: 'PRESET', properties: { fireModes: ['FIRE'] } },
      },
      fleaMarket: { value: { name: 'fleaMarket' } },
      armorMaterial: { value: { name: 'armorMaterial' } },
      skills: { value: { name: 'skills' } },
      itemCategories: { category: { id: 'category', name: 'itemCategories' } },
      handbookCategories: { value: { name: 'handbookCategories' } },
    },
    translations: [
      '$.data.items.*.name',
      '$.data.items.*.shortName',
      '$.data.items.*.properties.armorType',
      '$.data.items.*.properties.zones[*]',
      '$.data.items.*.properties.fireModes[*]',
      ...discardedPaths.map(([, path]) => path),
    ],
  };
}
function options(
  base: unknown,
  en: Record<string, unknown>,
  fr: Record<string, unknown> = {},
  gameMode: 'regular' | 'pve' | 'pvp-season' = 'regular',
  lang = 'en'
) {
  const responses: Record<string, unknown> = {
    [`https://json.tarkov.dev/${gameMode}/items`]: base,
    [`https://json.tarkov.dev/${gameMode}/items_en`]: { data: en },
    [`https://json.tarkov.dev/${gameMode}/items_fr`]: { data: fr },
  };
  const requests: string[] = [];
  const fetcher = async <T>(url: string): Promise<T> => {
    requests.push(url);
    return responses[url] as T;
  };
  return {
    gameMode,
    lang,
    maxRetries: 1,
    requests,
    deps: { fetcher, logger: { warn: vi.fn(), error: vi.fn() } },
  };
}
describe('items-lite avoids work discarded by its final projection', () => {
  it('does not expand categories or contained items in lite mode', () => {
    const categories = vi.fn(() => []);
    const containsItems = vi.fn(() => []);
    const item = Object.defineProperties(
      { id: 'item', name: 'Name' },
      { categories: { get: categories }, containsItems: { get: containsItems } }
    );
    expect(adaptItemsResponse({ items: [item] }, { lite: true }).data.items).toEqual([
      { id: 'item', name: 'Name' },
    ]);
    expect(categories).not.toHaveBeenCalled();
    expect(containsItems).not.toHaveBeenCalled();
    adaptItemsResponse({ items: [item] });
    expect(categories).toHaveBeenCalled();
    expect(containsItems).toHaveBeenCalled();
  });
  it.each(discardedPaths)('does not translate discarded %s data (%s)', async (field) => {
    const read = vi.fn(() => 'Discarded translation');
    const dictionary = Object.defineProperty({ NAME: 'Name' }, field, { get: read });
    const config = options(fixture(), dictionary);
    const result = await createTarkovJsonItemsFetcher(config, { lite: true })();
    expect(result.data.items[0]?.name).toBe('Name');
    expect(read).not.toHaveBeenCalled();
    await createTarkovJsonItemsFetcher(config)();
    expect(read).toHaveBeenCalled();
  });
  it.each(['regular', 'pve', 'pvp-season'] as const)(
    'preserves localized lite fields, presets, URL checks and English fallback in %s',
    async (mode) => {
      const base = fixture();
      const snapshot = JSON.stringify(base);
      const en = {
        NAME: 'Name',
        SHORT: 'Short',
        PRESET: 'Preset',
        ARMOR: 'Armor',
        ZONE: 'Zone',
        FIRE: 'Fire',
      };
      const fr = { NAME: 'Équipement', ARMOR: 'Armure' };
      for (const lang of ['en', 'fr']) {
        const config = options(base, en, fr, mode, lang);
        const expected = adaptItemsResponse(
          await fetchTarkovJsonEndpoint<typeof base.data>('items', config),
          {
            lite: true,
          }
        );
        expect(await createTarkovJsonItemsFetcher(config, { lite: true })()).toEqual(expected);
        expect(expected.data.items[0]).toMatchObject({
          name: lang === 'en' ? 'Name' : 'Équipement',
          shortName: 'Short',
          properties: {
            defaultPreset: { name: 'Preset', properties: { fireModes: ['Fire'] } },
            zones: ['Zone'],
          },
          link: 'https://tarkov.dev/item/item',
        });
        expect(expected.data.items[0]).not.toHaveProperty('wikiLink');
        expect(expected.data.items[0]).not.toHaveProperty('description');
      }
      expect(JSON.stringify(base)).toBe(snapshot);
    }
  );
  it('retains unfamiliar and overlapping translation declarations', async () => {
    const base = fixture();
    base.translations = ["$.data.items.*['name','description']", '$..name'];
    const config = options(base, { NAME: 'NAME2', NAME2: 'Name', PRESET: 'Preset' });
    const expected = adaptItemsResponse(
      await fetchTarkovJsonEndpoint<typeof base.data>('items', config),
      {
        lite: true,
      }
    );
    expect(await createTarkovJsonItemsFetcher(config, { lite: true })()).toEqual(expected);
    expect(expected.data.items[0]?.name).toBe('Name');
  });
  it('isolates concurrent full/lite requests and locales sharing one upstream envelope', async () => {
    const base = fixture();
    const snapshot = JSON.stringify(base);
    const config = options(
      base,
      { NAME: 'Name', description: 'Long description' },
      { NAME: 'Équipement' }
    );
    const [liteEn, liteFr, full] = await Promise.all([
      createTarkovJsonItemsFetcher(config, { lite: true })(),
      createTarkovJsonItemsFetcher({ ...config, lang: 'fr' }, { lite: true })(),
      createTarkovJsonItemsFetcher(config)(),
    ]);
    expect(liteEn.data.items[0]?.name).toBe('Name');
    expect(liteFr.data.items[0]?.name).toBe('Équipement');
    expect(liteEn.data.items[0]).not.toHaveProperty('description');
    expect(full.data.items[0]).toHaveProperty('description', 'Long description');
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(config.requests.filter((url) => url.endsWith('/regular/items'))).toHaveLength(1);
  });
});
