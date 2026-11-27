import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  describeBlockedHideoutTiers,
  previewBlockedHideoutTiers,
} from '@/stores/tarkov/hideoutPrereqs';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useTarkovStore } from '@/stores/useTarkov';
import type { GameEdition, HideoutStation, Task } from '@/types/tarkov';
describe('useTarkovStore hideout skill prerequisites', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const metadataStore = useMetadataStore();
    metadataStore.tasks = [
      {
        id: 'task-strength-alias',
        objectives: [],
        finishRewards: {
          skillLevelReward: [
            {
              name: 'Starke',
              level: 0,
              skill: { id: 'Strength', name: 'Starke' },
            },
          ],
        },
      },
    ] as Task[];
    metadataStore.hideoutStations = [
      {
        id: 'station-gym',
        name: 'Gym',
        normalizedName: 'gym',
        levels: [
          {
            id: 'module-gym-1',
            level: 1,
            constructionTime: 0,
            itemRequirements: [],
            stationLevelRequirements: [],
            skillRequirements: [{ id: 'req-strength-10', name: 'Strength', level: 10 }],
            traderRequirements: [],
            crafts: [],
          },
        ],
      },
    ] as HideoutStation[];
    metadataStore.editions = [
      {
        id: 'edition-standard',
        value: 1,
        title: 'Standard',
        defaultStashLevel: 0,
        defaultCultistCircleLevel: 0,
        traderRepBonus: {},
      },
    ] as GameEdition[];
  });
  it('previews blocked tiers and planned quest rewards without changing saved progress', () => {
    const metadata = useMetadataStore();
    const quest = metadata.tasks[0]!;
    const level = metadata.hideoutStations[0]!.levels[0]!;
    quest.finishRewards!.skillLevelReward![0]!.level = 10;
    const store = useTarkovStore();
    const draft = { moduleIds: [level.id], questIds: [] };
    expect(previewBlockedHideoutTiers(store, draft)).toEqual([level.id]);
    expect(previewBlockedHideoutTiers(store, { ...draft, questIds: [quest.id] })).toEqual([]);
    expect(store.isTaskComplete(quest.id)).toBe(false);
    expect(store.isHideoutModuleComplete(level.id)).toBe(false);
    store.setTaskComplete(quest.id);
    store.setHideoutModuleComplete(level.id);
    expect(store.enforceHideoutPrereqsNow()).toBe(0);
    expect(store.isHideoutModuleComplete(level.id)).toBe(true);
  });
  it.each([
    ['<', 3, true],
    ['<', 2, true],
    ['>', 2, false],
    ['>', 1, true],
    ['<=', 2, true],
    ['>=', 3, false],
    ['=', 2, true],
    ['==', 3, false],
    ['!=', 2, true],
  ] as const)(
    'retains completed loyalty %s %s when a reached level satisfies it',
    (compareMethod, value, met) => {
      const metadata = useMetadataStore();
      const level = metadata.hideoutStations[0]!.levels[0]!;
      level.skillRequirements = [];
      level.traderRequirements = [
        { id: 'trader-req', trader: { id: 'prapor' }, compareMethod, value },
      ] as typeof level.traderRequirements;
      const store = useTarkovStore();
      store.setTraderLevel('prapor', 2);
      store.setHideoutModuleComplete(level.id);
      expect(store.enforceHideoutPrereqsNow()).toBe(met ? 0 : 1);
      expect(store.isHideoutModuleComplete(level.id)).toBe(met);
    }
  );
  it.each(['<', '<=', '=', '==', '!='] as const)(
    'preserves built modules and parts when loyalty increases past %s',
    (compareMethod) => {
      const level = useMetadataStore().hideoutStations[0]!.levels[0]!;
      level.skillRequirements = [];
      level.itemRequirements = [{ id: 'part-1' }] as typeof level.itemRequirements;
      level.traderRequirements = [
        {
          id: 'trader-req',
          trader: { id: 'prapor' },
          compareMethod,
          value: compareMethod === '!=' || compareMethod === '<' ? 3 : 2,
        },
      ] as typeof level.traderRequirements;
      const store = useTarkovStore();
      store.setTraderLevel('prapor', 2);
      store.setHideoutModuleComplete(level.id);
      store.setHideoutPartComplete('part-1');
      store.setTraderLevel('prapor', 3);
      expect(store.isHideoutModuleComplete(level.id)).toBe(true);
      expect(store.isHideoutPartComplete('part-1')).toBe(true);
    }
  );
  it('still revokes modules and parts after a lower-bound loyalty downgrade', () => {
    const level = useMetadataStore().hideoutStations[0]!.levels[0]!;
    level.skillRequirements = [];
    level.itemRequirements = [{ id: 'part-1' }] as typeof level.itemRequirements;
    level.traderRequirements = [
      { id: 'trader-req', trader: { id: 'prapor' }, compareMethod: '>=', value: 3 },
    ] as typeof level.traderRequirements;
    const store = useTarkovStore();
    store.setTraderLevel('prapor', 3);
    store.setHideoutModuleComplete(level.id);
    store.setHideoutPartComplete('part-1');
    store.setTraderLevel('prapor', 2);
    expect(store.isHideoutModuleComplete(level.id)).toBe(false);
    expect(store.isHideoutPartComplete('part-1')).toBe(false);
  });
  it('preserves existing out-of-range loyalty values that satisfy the requirement', () => {
    const level = useMetadataStore().hideoutStations[0]!.levels[0]!;
    level.skillRequirements = [];
    level.traderRequirements = [
      { id: 'trader-req', trader: { id: 'prapor' }, compareMethod: '>=', value: 5 },
    ] as typeof level.traderRequirements;
    const store = useTarkovStore();
    store.setTraderLevel('prapor', 5);
    store.setHideoutModuleComplete(level.id);
    expect(store.enforceHideoutPrereqsNow()).toBe(0);
    expect(store.isHideoutModuleComplete(level.id)).toBe(true);
  });
  it('preserves completed modules when trader gating is disabled', () => {
    const level = useMetadataStore().hideoutStations[0]!.levels[0]!;
    level.skillRequirements = [];
    level.traderRequirements = [
      { id: 'trader-req', trader: { id: 'prapor' }, compareMethod: '>', value: 4 },
    ] as typeof level.traderRequirements;
    usePreferencesStore().setHideoutRequireTraderLoyalty(false);
    const store = useTarkovStore();
    store.setHideoutModuleComplete(level.id);
    expect(store.enforceHideoutPrereqsNow()).toBe(0);
    expect(store.isHideoutModuleComplete(level.id)).toBe(true);
  });
  it('deduplicates localized and canonical offsets during hideout skill checks', () => {
    const tarkovStore = useTarkovStore();
    tarkovStore.setHideoutModuleComplete('module-gym-1');
    tarkovStore.setSkillOffset('Strength', 6);
    tarkovStore.setSkillOffset('Starke', 12);
    const removedCount = tarkovStore.enforceHideoutPrereqsNow();
    expect(removedCount).toBe(1);
    expect(tarkovStore.isHideoutModuleComplete('module-gym-1')).toBe(false);
  });
  it('describes exact unmet station, trader, and skill blockers and honors planned trader levels', () => {
    const metadata = useMetadataStore();
    metadata.traders = [{ id: 'mechanic', name: 'Mechanic' } as (typeof metadata.traders)[number]];
    metadata.hideoutStations.push({
      id: 'station-security',
      name: 'Security',
      normalizedName: 'security',
      levels: [
        {
          id: 'module-security-1',
          level: 1,
          constructionTime: 0,
          itemRequirements: [],
          stationLevelRequirements: [],
          skillRequirements: [],
          traderRequirements: [],
          crafts: [],
        },
      ],
    } as HideoutStation);
    const gymLevel = metadata.hideoutStations[0]!.levels[0]!;
    gymLevel.stationLevelRequirements = [
      { id: 'req-sec', station: { id: 'station-security', name: 'Security' }, level: 1 },
    ];
    gymLevel.traderRequirements = [
      {
        id: 'req-mech',
        trader: { id: 'mechanic', name: 'Mechanic' },
        compareMethod: '>=',
        value: 2,
      },
    ] as typeof gymLevel.traderRequirements;
    const store = useTarkovStore();
    const details = describeBlockedHideoutTiers(store, {
      moduleIds: [gymLevel.id],
      questIds: [],
    });
    expect(details).toEqual([
      {
        moduleId: 'module-gym-1',
        stationId: 'station-gym',
        stationName: 'Gym',
        level: 1,
        missingStations: [
          {
            stationId: 'station-security',
            stationName: 'Security',
            requiredLevel: 1,
            currentLevel: 0,
          },
        ],
        missingTraders: [
          {
            traderId: 'mechanic',
            traderName: 'Mechanic',
            requiredLevel: 2,
            currentLevel: 1,
          },
        ],
        missingSkills: [
          {
            skillName: 'Strength',
            requiredLevel: 10,
            currentLevel: 0,
          },
        ],
      },
    ]);
    const afterTraders = describeBlockedHideoutTiers(store, {
      moduleIds: ['module-security-1', gymLevel.id],
      questIds: [],
      traderLevels: { mechanic: 2 },
    });
    expect(afterTraders[0]?.missingStations).toEqual([]);
    expect(afterTraders[0]?.missingTraders).toEqual([]);
    expect(afterTraders[0]?.missingSkills).toHaveLength(1);
  });
});
