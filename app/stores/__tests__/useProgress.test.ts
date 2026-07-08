import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { TASK_ID_REGISTRY } from '@/utils/constants';
type TraderProgress = Record<string, { level?: number; reputation?: number }>;
const createProgressData = (
  taskCompletions: Record<string, unknown>,
  traders: TraderProgress = {}
) => ({
  level: 1,
  pmcFaction: 'USEC',
  displayName: null,
  xpOffset: 0,
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
  pvpTraders = {},
}: {
  currentGameMode?: 'pvp' | 'pve';
  pvpCompletions?: Record<string, unknown>;
  pveCompletions?: Record<string, unknown>;
  pvpTraders?: TraderProgress;
}) => ({
  currentGameMode,
  gameEdition: 1,
  pvp: createProgressData(pvpCompletions, pvpTraders),
  pve: createProgressData(pveCompletions),
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
      getUseAutomaticLevelCalculation: false,
      getTasksRequireTraderLevels: tasksRequireTraderLevels ?? true,
    }),
  }));
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => ({
      tasks,
      traders,
      hideoutStations: [],
      playerLevels: [],
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
describe('useProgressStore', () => {
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
      const repTask = {
        id: 'prapor-rep-task',
        name: 'Prapor Rep Task',
        factionName: 'Any',
        trader: { id: 'skier', name: 'Skier', normalizedName: 'skier' },
        traderRequirements: [{ id: 'req-2', trader: { id: praporId, name: 'Prapor' }, value: 0.5 }],
      };
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
      const repTask = {
        id: 'prapor-rep-task',
        name: 'Prapor Rep Task',
        factionName: 'Any',
        trader: { id: 'skier', name: 'Skier', normalizedName: 'skier' },
        traderRequirements: [{ id: 'req-2', trader: { id: praporId, name: 'Prapor' }, value: 0.5 }],
      };
      setupMocks({
        selfState: createStoreState({ pvpTraders: { [praporId]: { reputation: 0.5 } } }),
        tasks: [repTask],
        traders: metadataTraders,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['prapor-rep-task']?.self).toBe(true);
    });
    it('keeps the Fence negative-reputation special case gating', async () => {
      const lowKarmaTask = {
        id: 'fence-low-karma-task',
        name: 'Low Karma Task',
        factionName: 'Any',
        trader: { id: 'fence', name: 'Fence', normalizedName: 'fence' },
        traderRequirements: [{ id: 'req-3', trader: { id: 'fence', name: 'Fence' }, value: -3 }],
      };
      setupMocks({
        selfState: createStoreState({ pvpTraders: { fence: { reputation: 0 } } }),
        tasks: [lowKarmaTask],
        traders: metadataTraders,
      });
      const { useProgressStore } = await import('@/stores/useProgress');
      const store = useProgressStore();
      expect(store.unlockedTasks['fence-low-karma-task']?.self).toBe(false);
    });
    it('ignores negative reputation requirements for non-Fence traders', async () => {
      const negativeRepTask = {
        id: 'negative-rep-task',
        name: 'Negative Rep Task',
        factionName: 'Any',
        trader: { id: 'skier', name: 'Skier', normalizedName: 'skier' },
        traderRequirements: [
          { id: 'req-4', trader: { id: praporId, name: 'Prapor' }, value: -0.5 },
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
      const repTask = {
        id: 'prapor-rep-task',
        name: 'Prapor Rep Task',
        factionName: 'Any',
        trader: { id: 'skier', name: 'Skier', normalizedName: 'skier' },
        traderRequirements: [{ id: 'req-2', trader: { id: praporId, name: 'Prapor' }, value: 0.5 }],
      };
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
      const lowKarmaTask = {
        id: 'fence-low-karma-task',
        name: 'Low Karma Task',
        factionName: 'Any',
        trader: { id: 'fence', name: 'Fence', normalizedName: 'fence' },
        traderRequirements: [{ id: 'req-3', trader: { id: 'fence', name: 'Fence' }, value: -3 }],
      };
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
