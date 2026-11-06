import { describe, expect, it, vi } from 'vitest';
import { isRef, ref } from 'vue';
import type { HideoutStation } from '@/types/tarkov';
const createStations = (): HideoutStation[] => [
  {
    id: 'station-available',
    name: 'Available Station',
    levels: [
      {
        id: 'station-available-1',
        level: 1,
        description: 'Level 1',
        constructionTime: 0,
        itemRequirements: [],
        stationLevelRequirements: [],
        skillRequirements: [],
        traderRequirements: [],
        crafts: [],
      },
      {
        id: 'station-available-2',
        level: 2,
        description: 'Level 2',
        constructionTime: 0,
        itemRequirements: [],
        stationLevelRequirements: [
          {
            id: 'req-station',
            station: { id: 'station-prereq', name: 'Prereq' },
            level: 1,
          },
        ],
        skillRequirements: [],
        traderRequirements: [],
        crafts: [],
      },
    ],
  },
  {
    id: 'station-skill-locked',
    name: 'Skill Locked Station',
    levels: [
      {
        id: 'station-skill-locked-1',
        level: 1,
        description: 'Level 1',
        constructionTime: 0,
        itemRequirements: [],
        stationLevelRequirements: [],
        skillRequirements: [
          {
            id: 'req-skill',
            name: 'Strength',
            level: 5,
          },
        ],
        traderRequirements: [],
        crafts: [],
      },
    ],
  },
  {
    id: 'station-maxed',
    name: 'Maxed Station',
    levels: [
      {
        id: 'station-maxed-1',
        level: 1,
        description: 'Level 1',
        constructionTime: 0,
        itemRequirements: [],
        stationLevelRequirements: [],
        skillRequirements: [],
        traderRequirements: [],
        crafts: [],
      },
    ],
  },
  {
    id: 'station-locked',
    name: 'Locked Station',
    levels: [
      {
        id: 'station-locked-1',
        level: 1,
        description: 'Level 1',
        constructionTime: 0,
        itemRequirements: [],
        stationLevelRequirements: [
          {
            id: 'req-missing',
            station: { id: 'station-missing', name: 'Missing' },
            level: 1,
          },
        ],
        skillRequirements: [],
        traderRequirements: [],
        crafts: [],
      },
      {
        id: 'station-locked-2',
        level: 2,
        description: 'Level 2',
        constructionTime: 0,
        itemRequirements: [],
        stationLevelRequirements: [],
        skillRequirements: [],
        traderRequirements: [],
        crafts: [],
      },
    ],
  },
];
const createProgressStore = () => ({
  hideoutLevels: {
    'station-available': { self: 1 },
    'station-maxed': { self: 1 },
    'station-locked': { self: 0 },
    'station-prereq': { self: 1 },
  },
  visibleTeamStores: { self: {} },
});
type HideoutTestSetupOptions = {
  view: string;
  reverseStations?: boolean;
  skillLevels?: Record<string, number>;
};
const initHideoutTest = async ({
  view,
  reverseStations = false,
  skillLevels = { Strength: 1 },
}: HideoutTestSetupOptions) => {
  const stations = createStations();
  const hideoutStations = reverseStations ? stations.reverse() : stations;
  const metadataStore = {
    hideoutStations: ref(hideoutStations),
    hideoutLoading: ref(false),
    hasInitialized: true,
  };
  const progressStore = createProgressStore();
  const tarkovStore = {
    getCurrentProgressData: () => ({
      skills: skillLevels,
    }),
    getSkillLevel: (name: string) => skillLevels[name as keyof typeof skillLevels] ?? 0,
    getTraderLevel: (_id: string) => 1,
  };
  const preferencesStore = {
    getHideoutPrimaryView: view,
    setHideoutPrimaryView: vi.fn(),
    getHideoutRequireStationLevels: true,
    getHideoutRequireSkillLevels: true,
    getHideoutRequireTraderLoyalty: true,
  };
  vi.resetModules();
  vi.doMock('pinia', async () => {
    const actual = await vi.importActual<typeof import('pinia')>('pinia');
    return {
      ...actual,
      storeToRefs: (store: Record<string, unknown>) => {
        const refs: Record<string, unknown> = {};
        Object.entries(store).forEach(([key, value]) => {
          refs[key] = isRef(value) ? value : ref(value);
        });
        return refs;
      },
    };
  });
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => metadataStore,
  }));
  vi.doMock('@/stores/useProgress', () => ({
    useProgressStore: () => progressStore,
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => tarkovStore,
  }));
  vi.doMock('@/composables/useSkillCalculation', () => ({
    useSkillCalculation: () => ({
      getSkillLevel: (name: string) => skillLevels[name as keyof typeof skillLevels] ?? 0,
    }),
  }));
  const { useHideoutFiltering } = await import('@/composables/useHideoutFiltering');
  return {
    hideoutFiltering: useHideoutFiltering(),
    metadataStore,
    preferencesStore,
    progressStore,
    tarkovStore,
  };
};
const setup = async (view: string) => initHideoutTest({ view });
describe('useHideoutFiltering', () => {
  it('calculates station counts', async () => {
    const { hideoutFiltering } = await setup('all');
    expect(hideoutFiltering.stationCounts.value).toEqual({
      available: 1,
      maxed: 1,
      locked: 2,
      all: 4,
    });
  });
  it('shows available stations when filtered', async () => {
    const { hideoutFiltering } = await setup('available');
    expect(hideoutFiltering.visibleStations.value.map((station) => station.id)).toEqual([
      'station-available',
    ]);
  });
  it('shows maxed stations when filtered', async () => {
    const { hideoutFiltering } = await setup('maxed');
    expect(hideoutFiltering.visibleStations.value.map((station) => station.id)).toEqual([
      'station-maxed',
    ]);
  });
  it('shows locked stations when filtered', async () => {
    const { hideoutFiltering } = await setup('locked');
    expect(hideoutFiltering.visibleStations.value.map((station) => station.id)).toEqual([
      'station-skill-locked',
      'station-locked',
    ]);
  });
  it('shows all stations when view is "all"', async () => {
    const { hideoutFiltering } = await setup('all');
    expect(hideoutFiltering.visibleStations.value.map((station) => station.id)).toEqual([
      'station-available',
      'station-skill-locked',
      'station-maxed',
      'station-locked',
    ]);
  });
  describe('ready-to-build ordering', () => {
    it('always lists stations ready to build first and keeps upstream order otherwise', async () => {
      const { hideoutFiltering } = await initHideoutTest({ view: 'all', reverseStations: true });
      expect(hideoutFiltering.visibleStations.value.map((station) => station.id)).toEqual([
        'station-available',
        'station-locked',
        'station-maxed',
        'station-skill-locked',
      ]);
    });
    it('counts a skill-gated station as ready once its skill requirement is met', async () => {
      const { hideoutFiltering } = await initHideoutTest({
        view: 'all',
        reverseStations: true,
        skillLevels: { Strength: 5 },
      });
      expect(hideoutFiltering.visibleStations.value.map((station) => station.id)).toEqual([
        'station-skill-locked',
        'station-available',
        'station-locked',
        'station-maxed',
      ]);
    });
    it('applies the same ordering to stationsForView', async () => {
      const { hideoutFiltering } = await initHideoutTest({ view: 'all', reverseStations: true });
      const reversed = createStations().reverse();
      const idsFor = (view: 'all' | 'maxed') =>
        hideoutFiltering.stationsForView(reversed, view).map((station) => station.id);
      expect(idsFor('all')).toEqual([
        'station-available',
        'station-locked',
        'station-maxed',
        'station-skill-locked',
      ]);
      expect(idsFor('maxed')).toEqual(['station-maxed']);
    });
    it('shows every station when the stored view is not a known status', async () => {
      const { hideoutFiltering } = await initHideoutTest({ view: 'legacy', reverseStations: true });
      expect(hideoutFiltering.visibleStations.value.map((station) => station.id)).toEqual([
        'station-available',
        'station-locked',
        'station-maxed',
        'station-skill-locked',
      ]);
    });
  });
});
