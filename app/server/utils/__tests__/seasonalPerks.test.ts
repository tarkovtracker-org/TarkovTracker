import { describe, expect, it, vi } from 'vitest';
import { edgeCache } from '@/server/utils/edgeCache';
import { adaptSeasonalPerks, projectSeasonalPerks } from '@/server/utils/seasonalPerks';
import type { OverlayRecords } from '@/server/utils/overlayTypes';
import type { H3Event } from 'h3';
const sourcePerk = (id: string) => ({
  id,
  name: `Name ${id}`,
  description: `Description ${id}`,
  points: 2,
  exclusiveToPerks: [] as string[],
});
const catalog = () => ({
  perks: {
    common: [{ ...sourcePerk('common'), points: null }],
    personal: [{ ...sourcePerk('personal'), exclusiveToPerks: ['common'] }],
  },
});
describe('seasonal perk metadata and effect join', () => {
  it('returns 502 on malformed cold reads without caching an empty catalog', async () => {
    const cache = { match: vi.fn(async () => undefined), put: vi.fn() };
    await expect(
      edgeCache(
        { context: {} } as H3Event,
        'seasonal-perks-cold-test',
        async () => adaptSeasonalPerks({ perks: {} }),
        60,
        { deps: { cache, setResponseHeadersFn: vi.fn() } }
      )
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(cache.put).not.toHaveBeenCalled();
  });
  it('keeps last-good metadata on an invalid background refresh and marks it stale', async () => {
    const upstream = adaptSeasonalPerks(catalog());
    const cache = {
      match: vi.fn(
        async () =>
          new Response(JSON.stringify(upstream), {
            headers: { 'X-Cache-Stored-At': String(Date.now() - 61_000) },
          })
      ),
      put: vi.fn(),
    };
    const background: Promise<unknown>[] = [];
    const headers = vi.fn();
    const event = {
      context: {
        cloudflare: {
          context: { waitUntil: (promise: Promise<unknown>) => background.push(promise) },
        },
      },
    } as unknown as H3Event;
    const result = await edgeCache(
      event,
      'seasonal-perks-stale-test',
      async () => adaptSeasonalPerks({ perks: {} }),
      60,
      { deps: { cache, setResponseHeadersFn: headers } }
    );
    expect(result).toEqual(upstream);
    expect(headers).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ 'X-Cache-Status': 'STALE' })
    );
    await Promise.all(background);
    expect(cache.put).not.toHaveBeenCalled();
  });
  it('retains all 40 upstream perks when only 37 effect rows exist', () => {
    const source = {
      perks: {
        common: Array.from({ length: 6 }, (_, i) => ({ ...sourcePerk(`c${i}`), points: null })),
        personal: Array.from({ length: 34 }, (_, i) => sourcePerk(`p${i}`)),
      },
    };
    source.perks.personal[0]!.exclusiveToPerks = ['p1'];
    const upstream = adaptSeasonalPerks(source);
    const effects = [{ effectId: 'health', value: 1.25 }];
    const overlay = {
      seasonalPerks: Object.fromEntries(
        upstream.slice(0, 37).map((perk) => [perk.id, { id: perk.id, effects }])
      ),
    };
    const result = projectSeasonalPerks(overlay, 'pvp-season', upstream);
    expect(result).toHaveLength(40);
    expect(result.map((perk) => ({ ...perk, effects: [] }))).toEqual(upstream);
    expect(result.slice(0, 37).map((perk) => perk.effects)).toEqual(
      Array.from({ length: 37 }, () => effects)
    );
    expect(result.slice(37).every((perk) => perk.effects.length === 0)).toBe(true);
    expect(result[0]).toMatchObject({ type: 'common', points: null });
    expect(result[6]).toMatchObject({ type: 'personal', mutuallyExclusiveSeasonalPerkIds: ['p1'] });
  });
  it('uses mode effects while preserving upstream metadata and exclusions', () => {
    const upstream = adaptSeasonalPerks(catalog());
    const itemFilter = {
      allowedItems: ['item'],
      excludedItems: [],
      allowedCategories: [],
      excludedCategories: [],
    };
    const effects = [{ effectId: 'experience', value: 2, itemFilter }];
    const overlay = {
      seasonalPerks: { personal: { name: 'Stale overlay', effects: [{ effectId: 'old' }] } },
      modes: { 'pvp-season': { seasonalPerks: { personal: { effects } } } },
    };
    expect(projectSeasonalPerks(overlay, 'pvp-season', upstream)).toEqual([
      upstream[0],
      { ...upstream[1], effects },
    ]);
    expect(upstream[1]?.effects).toEqual([]);
  });
  it.each(['regular', 'pve'])('does not expose seasonal perks in %s', (mode) => {
    expect(
      projectSeasonalPerks(
        { seasonalPerks: { personal: { effects: [] } } },
        mode,
        adaptSeasonalPerks(catalog())
      )
    ).toEqual([]);
  });
  it.each([
    undefined,
    {},
    { perks: {} },
    { perks: { common: {} } },
    { perks: { common: [null] } },
    { perks: { common: [sourcePerk('same')], personal: [sourcePerk('same')] } },
    ...[
      { id: '' },
      { name: '' },
      { description: 3 },
      { points: undefined },
      { points: NaN },
      { name: 'perk name' },
      { description: 'perk description' },
      { exclusiveToPerks: ['missing'] },
      { exclusiveToPerks: ['perk', 'perk'] },
    ].map((patch) => ({ perks: { personal: [{ ...sourcePerk('perk'), ...patch }] } })),
  ])('rejects malformed or untranslated upstream catalogs (%#)', (payload) => {
    expect(() => adaptSeasonalPerks(payload)).toThrow('Invalid upstream seasonal perk catalog');
  });
  it.each<OverlayRecords>([
    { unknown: { effects: [] } },
    { personal: { id: 'common', effects: [] } },
    { personal: { effects: 'invalid' } },
    { personal: { effects: [{ effectId: 123 }] } },
    { personal: { effects: [{ effectId: 'health', itemFilter: { allowedItems: [] } }] } },
  ])('rejects incompatible effect patches (%#)', (seasonalPerks) => {
    expect(() =>
      projectSeasonalPerks({ seasonalPerks }, 'pvp-season', adaptSeasonalPerks(catalog()))
    ).toThrow('Seasonal perk corrections incompatible');
  });
});
