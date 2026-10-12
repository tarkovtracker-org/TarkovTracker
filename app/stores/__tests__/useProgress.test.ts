import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';
import { TASK_ID_REGISTRY } from '@/utils/constants';
type TraderProgress = Record<string, { level?: number; reputation?: number }>;
const createProgressData = (
  taskCompletions: Record<string, unknown>,
  traders: TraderProgress = {}
) => ({
  level: 1,
  pmcFaction: 'USEC',
  displayName: null,
  taskObjectives: {},
  taskCompletions,
  hideoutParts: {},
  hideoutModules: {},
  traders,
  skills: {},
  prestigeLevel: 0,
  skillOffsets: {},
});
const createStoreState = ({
  currentGameMode = 'pvp',
  pvpCompletions = {},
  pveCompletions = {},
  seasonalCompletions = {},
  pvpTraders = {},
}: {
  currentGameMode?: 'pvp' | 'pve' | 'seasonal';
  pvpCompletions?: Record<string, unknown>;
  pveCompletions?: Record<string, unknown>;
  seasonalCompletions?: Record<string, unknown>;
  pvpTraders?: TraderProgress;
}) => ({
  currentGameMode,
  gameEdition: 1,
  pvp: createProgressData(pvpCompletions, pvpTraders),
  pve: createProgressData(pveCompletions),
  seasonal: createProgressData(seasonalCompletions),
});
const setupMocks = ({
  selfCompletions = {},
  teammateCompletions = {},
  selfState,
  teammateState,
  tasks = [{ id: 'task-1', name: 'Task One' }],
  traders = [],
  tasksRequireTraderLevels,
}: {
  selfCompletions?: Record<string, unknown>;
  teammateCompletions?: Record<string, unknown>;
  selfState?: ReturnType<typeof createStoreState>;
  teammateState?: ReturnType<typeof createStoreState>;
  tasks?: Array<Record<string, unknown>>;
  traders?: Array<Record<string, unknown>>;
  tasksRequireTraderLevels?: boolean;
}) => {
  vi.resetModules();
  setActivePinia(createPinia());
  const selfStore = {
    $state: selfState ?? createStoreState({ pvpCompletions: selfCompletions }),
  };
  const teammateStore = {
    $state: teammateState ?? createStoreState({ pvpCompletions: teammateCompletions }),
  };
  const teammateStores = ref<Record<string, typeof teammateStore>>({
    'teammate-1': teammateStore,
  });
  vi.doMock('@/stores/useTeamStore', () => ({
    useTeamStore: () => ({ memberProfiles: {} }),
    useTeammateStores: () => ({ teammateStores }),
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => ({
      teamIsHidden: () => false,
      taskTeamAllHidden: false,
      getUseAutomaticLevelCalculation: true,
      getTasksRequireTraderLevels: tasksRequireTraderLevels ?? true,
    }),
  }));
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => ({
      tasks,
      traders,
      hideoutStations: [],
      playerLevels: [
        { level: 1, exp: 0 },
        { level: 60, exp: 1000 },
      ],
      editions: [],
    }),
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => selfStore,
  }));
  return {
    teammateStore,
    teammateStores,
  };
};
const reputationRequirement = (
  id: string,
  trader: { id: string; name: string },
  value: number,
  compareMethod: '>=' | '<=' = '>='
) => ({ id, requirementType: 'reputation' as const, compareMethod, trader, value });
describe('useProgressStore', () => {
  it.each(['pvp', 'pve', 'seasonal'] as const)(
    'uses the saved %s level despite stale automatic preferences and quest XP changes',
    async (mode) => {
      const selfState = reactive(createStoreState({ currentGameMode: mode }));
      Object.assign(selfState[mode], {
        level: 37,
        prestigeLevel: 3,
        xpOffset: 1000000,
        taskCompletions: { 'task-1': { complete: true } },
      });
      setupMocks({ selfState, tasks: [{ id: 'task-1', experience: 1000000 }] });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.getLevel('self')).toBe(37);
      selfState[mode].taskCompletions = { 'task-1': { complete: false } };
      await nextTick();
      expect(store.getLevel('self')).toBe(37);
      expect(selfState[mode].prestigeLevel).toBe(3);
    }
  );
  it('treats boolean teammate completions as completed', async () => {
    setupMocks({
      selfCompletions: { 'task-1': { complete: false, failed: false } },
      teammateCompletions: { 'task-1': true },
    });
    const { useProgressStore } = await import('@/stores/useProgress');
    const store = useProgressStore();
    expect(store.tasksCompletions['task-1']).toEqual({ self: false, 'teammate-1': true });
  });
  it('treats boolean false as not failed in tasksFailed', async () => {
    setupMocks({
      selfCompletions: { 'task-1': { complete: false, failed: true } },
      teammateCompletions: { 'task-1': true },
    });
    const { useProgressStore } = await import('@/stores/useProgress');
    const store = useProgressStore();
    expect(store.tasksFailed['task-1']).toEqual({ self: true, 'teammate-1': false });
  });
  it('reacts when teammate stores are added after progress store initialization', async () => {
    const { teammateStore, teammateStores } = setupMocks({
      selfCompletions: { 'task-1': { complete: false, failed: false } },
      teammateCompletions: { 'task-1': true },
    });
    teammateStores.value = {};
    const { useProgressStore } = await import('@/stores/useProgress');
    const store = useProgressStore();
    expect(store.tasksCompletions['task-1']).toEqual({ self: false });
    teammateStores.value['teammate-1'] = teammateStore;
    await nextTick();
    expect(store.teamStores).toMatchObject({
      self: expect.any(Object),
      'teammate-1': teammateStore,
    });
    expect(store.tasksCompletions['task-1']).toEqual({ self: false, 'teammate-1': true });
  });
  it('unlocks Ref tasks in PvE using Easy Money - Part 1 PvE completion', async () => {
    const refTask = {
      id: 'ref-task',
      name: 'Ref Task',
      factionName: 'Any',
      trader: { id: 'ref', name: 'Ref', normalizedName: 'ref' },
    };
    const easyMoneyPveTask = {
      id: TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVE,
      name: 'Easy Money - Part 1 [PVE ZONE]',
      factionName: 'Any',
      trader: { id: 'skier', name: 'Skier', normalizedName: 'skier' },
    };
    setupMocks({
      selfState: createStoreState({
        currentGameMode: 'pve',
        pveCompletions: { [TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVE]: true },
      }),
      tasks: [refTask, easyMoneyPveTask],
      traders: [{ id: 'fence', normalizedName: 'fence', name: 'Fence' }],
    });
    const { useProgressStore } = await import('@/stores/useProgress');
    const store = useProgressStore();
    expect(store.unlockedTasks['ref-task']?.self).toBe(true);
  });
  it('unlocks Ref tasks in Seasonal using the Seasonal PvP task mapping', async () => {
    const refTask = {
      id: 'ref-task',
      name: 'Ref Task',
      factionName: 'Any',
      trader: { id: 'ref', name: 'Ref', normalizedName: 'ref' },
    };
    const easyMoneySeasonalTask = {
      id: TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVP,
      name: 'Easy Money - Part 1',
      factionName: 'Any',
      trader: { id: 'skier', name: 'Skier', normalizedName: 'skier' },
    };
    setupMocks({
      selfState: createStoreState({
        currentGameMode: 'seasonal',
        seasonalCompletions: { [TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVP]: true },
      }),
      tasks: [refTask, easyMoneySeasonalTask],
      traders: [{ id: 'fence', normalizedName: 'fence', name: 'Fence' }],
    });
    const { useProgressStore } = await import('@/stores/useProgress');
    const store = useProgressStore();
    expect(store.unlockedTasks['ref-task']?.self).toBe(true);
  });
  describe('trader requirement gating', () => {
    const praporId = 'prapor-id';
    const praporLevelTask = {
      id: 'prapor-ll2-task',
      name: 'Shaking Up the Teller',
      factionName: 'Any',
      trader: { id: 'skier', name: 'Skier', normalizedName: 'skier' },
      traderLevelRequirements: [
        { id: 'req-1', trader: { id: praporId, name: 'Prapor' }, level: 2 },
      ],
    };
    const metadataTraders = [
      { id: 'fence', normalizedName: 'fence', name: 'Fence' },
      { id: praporId, normalizedName: 'prapor', name: 'Prapor' },
    ];
    const repTask = {
      id: 'prapor-rep-task',
      name: 'Prapor Rep Task',
      factionName: 'Any',
      trader: { id: 'skier', name: 'Skier', normalizedName: 'skier' },
      traderRequirements: [
        reputationRequirement('req-2', { id: praporId, name: 'Prapor' }, 0.5, '>='),
      ],
    };
    const lowKarmaTask = {
      id: 'fence-low-karma-task',
      name: 'Low Karma Task',
      factionName: 'Any',
      trader: { id: 'fence', name: 'Fence', normalizedName: 'fence' },
      traderRequirements: [
        reputationRequirement('req-3', { id: 'fence', name: 'Fence' }, -3, '<='),
      ],
    };
    it('locks a task when the trader loyalty level requirement is not met', async () => {
      setupMocks({
        selfState: createStoreState({ pvpTraders: { [praporId]: { level: 1 } } }),
        tasks: [praporLevelTask],
        traders: metadataTraders,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['prapor-ll2-task']?.self).toBe(false);
    });
    it('unlocks a task when the trader loyalty level requirement is met', async () => {
      setupMocks({
        selfState: createStoreState({ pvpTraders: { [praporId]: { level: 2 } } }),
        tasks: [praporLevelTask],
        traders: metadataTraders,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['prapor-ll2-task']?.self).toBe(true);
    });
    it('defaults missing trader data to level 1 and locks higher-level requirements', async () => {
      setupMocks({
        selfState: createStoreState({}),
        tasks: [praporLevelTask],
        traders: metadataTraders,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['prapor-ll2-task']?.self).toBe(false);
    });
    it('locks a task when a non-Fence positive reputation requirement is not met', async () => {
      setupMocks({
        selfState: createStoreState({ pvpTraders: { [praporId]: { reputation: 0.2 } } }),
        tasks: [repTask],
        traders: metadataTraders,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['prapor-rep-task']?.self).toBe(false);
    });
    it('unlocks a task when a non-Fence positive reputation requirement is met', async () => {
      setupMocks({
        selfState: createStoreState({ pvpTraders: { [praporId]: { reputation: 0.5 } } }),
        tasks: [repTask],
        traders: metadataTraders,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['prapor-rep-task']?.self).toBe(true);
    });
    it('honors the declared Fence reputation upper bound', async () => {
      setupMocks({
        selfState: createStoreState({ pvpTraders: { fence: { reputation: 0 } } }),
        tasks: [lowKarmaTask],
        traders: metadataTraders,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['fence-low-karma-task']?.self).toBe(false);
    });
    it('honors negative reputation lower bounds for every trader', async () => {
      const negativeRepTask = {
        id: 'negative-rep-task',
        name: 'Negative Rep Task',
        factionName: 'Any',
        trader: { id: 'skier', name: 'Skier', normalizedName: 'skier' },
        traderRequirements: [
          reputationRequirement('req-4', { id: praporId, name: 'Prapor' }, -0.5, '>='),
        ],
      };
      setupMocks({
        selfState: createStoreState({ pvpTraders: { [praporId]: { reputation: 0.3 } } }),
        tasks: [negativeRepTask],
        traders: metadataTraders,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['negative-rep-task']?.self).toBe(true);
    });
    it('skips loyalty level gating when the preference is disabled', async () => {
      setupMocks({
        selfState: createStoreState({ pvpTraders: { [praporId]: { level: 1 } } }),
        tasks: [praporLevelTask],
        traders: metadataTraders,
        tasksRequireTraderLevels: false,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['prapor-ll2-task']?.self).toBe(true);
    });
    it('skips reputation gating when the preference is disabled', async () => {
      setupMocks({
        selfState: createStoreState({ pvpTraders: { [praporId]: { reputation: 0.2 } } }),
        tasks: [repTask],
        traders: metadataTraders,
        tasksRequireTraderLevels: false,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['prapor-rep-task']?.self).toBe(true);
    });
    it('skips Fence negative-reputation gating when the preference is disabled', async () => {
      setupMocks({
        selfState: createStoreState({ pvpTraders: { fence: { reputation: 0 } } }),
        tasks: [lowKarmaTask],
        traders: metadataTraders,
        tasksRequireTraderLevels: false,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['fence-low-karma-task']?.self).toBe(true);
    });
  });
  it('does not lock Ref tasks when unlock task is missing from loaded task payload', async () => {
    const refTask = {
      id: 'ref-task',
      name: 'Ref Task',
      factionName: 'Any',
      trader: { id: 'ref', name: 'Ref', normalizedName: 'ref' },
    };
    setupMocks({
      selfCompletions: {},
      tasks: [refTask],
      traders: [{ id: 'fence', normalizedName: 'fence', name: 'Fence' }],
    });
    const { useProgressStore } = await import('@/stores/useProgress');
    const store = useProgressStore();
    expect(store.unlockedTasks['ref-task']?.self).toBe(true);
  });
});
vi.mock('@/stores/tarkov/progressAuthority', async () => {
  const { createProgressPolicyAuthority } = await import('#tests/test-helpers/progressAuthority');
  return createProgressPolicyAuthority();
});
