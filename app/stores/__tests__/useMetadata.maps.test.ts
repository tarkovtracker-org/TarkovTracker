// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import type { TarkovMap } from '@/types/tarkov';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
describe('useMetadataStore mapsWithSvg extracts additions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });
  it('reuses artwork for variants without merging their boss rates or extracting from the base map', async () => {
    const store = useMetadataStore();
    await store.loadStaticMapData();
    const infected = { name: 'Infected Tagilla', chance: 0.75, locations: [] };
    store.maps = [
      {
        id: 'factory',
        name: 'Factory',
        normalizedName: 'factory',
        extracts: [{ id: 'base-extract', name: 'Gate' }],
        bossSpawns: [{ name: 'Tagilla', chance: 0.3, locations: [] }],
      },
      {
        id: 'infected',
        name: 'Infected Factory',
        normalizedName: 'infected-factory',
        bossSpawns: [infected],
      },
      { id: 'dark', name: 'The Lab (Dark)', normalizedName: 'the-lab-dark' },
      { id: 'dark-name-only', name: 'The Lab (Dark)' },
      { id: 'infected-lab', name: 'Infected Lab', normalizedName: 'infected-lab' },
    ];
    const byId = new Map(store.mapsWithSvg.map((map) => [map.id, map]));
    expect(byId.get('infected')?.svg).toEqual(byId.get('factory')?.svg);
    expect(byId.get('infected')).toMatchObject({ mergedIds: ['infected'] });
    expect(byId.get('infected')?.bossSpawns).toEqual([infected]);
    expect(byId.get('infected')?.extracts).toBeUndefined();
    for (const id of ['dark', 'dark-name-only', 'infected-lab']) {
      expect(byId.get(id)?.tile).toMatchObject({ elevationKey: 'lab' });
      expect(byId.get(id)).toMatchObject({ mergedIds: [id] });
    }
  });
  it('merges extractsAdd from static map data into mapsWithSvg', async () => {
    const store = useMetadataStore();
    await store.loadStaticMapData();
    store.maps = [
      {
        id: '5704e4dad2720bb55b8b4567',
        name: 'Lighthouse',
        normalizedName: 'lighthouse',
        extracts: [
          {
            id: 'ext-1',
            name: 'Southern Road',
            faction: 'shared',
          },
        ],
      } as TarkovMap,
    ];
    const lighthouse = store.mapsWithSvg.find((m) => m.id === '5704e4dad2720bb55b8b4567');
    expect(lighthouse).toBeDefined();
    expect(lighthouse?.extracts).toHaveLength(2);
    expect(lighthouse?.extracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ext-1', name: 'Southern Road' }),
        expect.objectContaining({
          id: 'SCAV_Underboat_Hideout',
          name: 'Hideout Under the Landing Stage',
          faction: 'scav',
          position: { x: 143.13, y: 0.73, z: -159.34 },
        }),
      ])
    );
  });
  it('deduplicates extracts if already present in API response', async () => {
    const store = useMetadataStore();
    await store.loadStaticMapData();
    store.maps = [
      {
        id: '5704e4dad2720bb55b8b4567',
        name: 'Lighthouse',
        normalizedName: 'lighthouse',
        extracts: [
          {
            id: 'SCAV_Underboat_Hideout',
            name: 'Hideout Under the Landing Stage',
            faction: 'scav',
          },
        ],
      } as TarkovMap,
    ];
    const lighthouse = store.mapsWithSvg.find((m) => m.id === '5704e4dad2720bb55b8b4567');
    expect(lighthouse?.extracts).toHaveLength(1);
    expect(lighthouse?.extracts?.[0]?.id).toBe('SCAV_Underboat_Hideout');
    expect(lighthouse?.extracts?.[0]?.nameKey).toBe('maps.extract_names.scav_underboat_hideout');
  });
});
