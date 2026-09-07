import { describe, expect, it } from 'vitest';
import { resolveSeasonalPerks } from '@/utils/seasonalPerks';
import type { SeasonalPerk, TarkovItem } from '@/types/tarkov';
describe('Seasonal perk reference hydration', () => {
  it('resolves item/category metadata while retaining missing IDs explicitly', () => {
    const perk: SeasonalPerk = {
      id: 'perk',
      name: 'Perk',
      type: 'common',
      points: null,
      description: '',
      mutuallyExclusiveSeasonalPerkIds: [],
      effects: [
        {
          effectId: 'filter',
          itemFilter: {
            allowedItems: ['known', 'unknown'],
            excludedItems: [],
            allowedCategories: ['category'],
            excludedCategories: ['missing-category'],
          },
        },
      ],
    };
    const item = {
      id: 'known',
      name: 'Known',
      categories: [{ id: 'category', name: 'Category' }],
    } as TarkovItem;
    const result = resolveSeasonalPerks([perk], [item]);
    expect(result[0]?.effects[0]?.resolvedItemFilter).toEqual({
      allowedItems: [
        { id: 'known', value: item },
        { id: 'unknown', value: null },
      ],
      excludedItems: [],
      allowedCategories: [{ id: 'category', value: item.categories![0] }],
      excludedCategories: [{ id: 'missing-category', value: null }],
    });
    expect(perk.effects[0]).not.toHaveProperty('resolvedItemFilter');
  });
});
it.each([undefined, null, {}])(
  'keeps malformed cached effects from breaking perk consumers: %j',
  (effects) => {
    const result = resolveSeasonalPerks([{ id: 'broken', effects } as unknown as SeasonalPerk], []);
    expect(result[0]).toMatchObject({ id: 'broken', effects: [] });
  }
);
it.each([undefined, null, {}, 'bad'])(
  'keeps malformed cached item filters from breaking perk consumers: %j',
  (ids) => {
    const perk = {
      id: 'cached',
      effects: [
        {
          effectId: 'filter',
          itemFilter: {
            allowedItems: ids,
            excludedItems: ids,
            allowedCategories: ids,
            excludedCategories: ids,
          },
        },
      ],
    } as unknown as SeasonalPerk;
    const result = resolveSeasonalPerks([perk], []);
    expect(result[0]?.effects[0]?.resolvedItemFilter).toEqual({
      allowedItems: [],
      excludedItems: [],
      allowedCategories: [],
      excludedCategories: [],
    });
  }
);
