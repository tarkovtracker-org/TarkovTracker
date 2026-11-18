import { afterEach, expect, it, vi } from 'vitest';
import { loadHideoutRequirements } from '@/server/utils/loadHideoutRequirements';
const base = { id: 'st', name: 'Workbench', normalizedName: 'workbench' };
const second = {
  level: 2,
  itemRequirements: [
    { id: 'cash', item: { id: 'rub' }, count: 150000 },
    {
      id: 'tool',
      item: { id: 'tool', name: 'Toolset' },
      quantity: 2,
      attributes: [{ name: 'foundInRaid', value: 'true' }],
    },
  ],
  stationLevelRequirements: [
    { id: 'prior', station: base, level: 1 },
    { id: 'absent', station: base, level: 9 },
  ],
  skillRequirements: [{ id: 'skill', skill: { name: 'Strength' }, level: 3 }],
  traderRequirements: [
    {
      id: 'trader',
      trader: { name: 'Fence' },
      requirementType: 'reputation',
      compareMethod: '>',
      value: 0.5,
    },
  ],
};
function catalogs(stations: unknown[], items: unknown[]) {
  vi.stubGlobal(
    '$fetch',
    vi.fn(async (url: string, options: { query: unknown }) => {
      expect(options.query).toEqual({ gameMode: 'pvp', lang: 'en' });
      return { data: url.endsWith('/hideout') ? { hideoutStations: stations } : { items } };
    })
  );
}
afterEach(() => vi.unstubAllGlobals());
it('retains level costs and prerequisite semantics, including empty levels and missing link targets', async () => {
  catalogs([{ ...base, levels: [second, { level: 1 }] }], [{ id: 'rub', name: 'Roubles' }]);
  const [station] = await loadHideoutRequirements();
  expect(station?.levels).toMatchObject([
    { level: 1, items: [] },
    {
      level: 2,
      anchor: 'requirements-workbench-level-2',
      items: [
        { name: 'Roubles', count: 150000 },
        { name: 'Toolset', count: 2, fir: true },
      ],
      stations: [
        { anchor: 'requirements-workbench-level-1' },
        { name: 'Workbench', level: 9, anchor: undefined },
      ],
      skills: [{ name: 'Strength', level: 3 }],
      traders: [{ name: 'Fence', type: 'reputation', comparison: '>', value: 0.5 }],
    },
  ]);
});
it('rejects an empty reference and missing material names', async () => {
  catalogs([], []);
  await expect(loadHideoutRequirements()).rejects.toThrow('Empty public hideout requirements');
  catalogs([{ ...base, levels: [second] }], []);
  await expect(loadHideoutRequirements()).rejects.toThrow('Missing hideout material name');
});
