import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { TASK_ID_REGISTRY } from '@/utils/constants';
const createProgressData = (taskCompletions: Record<string, unknown>) => ({
  level: 1,
  pmcFaction: 'USEC',
  displayName: null,
  xpOffset: 0,
  taskObjectives: {},
  taskCompletions,
  hideoutParts: {},
  hideoutModules: {},
  traders: {},
  skills: {},
  prestigeLevel: 0,
  skillOffsets: {},
});
const createStoreState = ({
  currentGameMode = 'pvp',
  pvpCompletions = {},
  pveCompletions = {},
}: {
  currentGameMode?: 'pvp' | 'pve';
  pvpCompletions?: Record<string, unknown>;
  pveCompletions?: Record<string, unknown>;
}) => ({
  currentGameMode,
  gameEdition: 1,
  pvp: createProgressData(pvpCompletions),
  pve: createProgressData(pveCompletions),
});
const setupMocks = ({
  selfCompletions = {},
  teammateCompletions = {},
  selfState,
  teammateState,
  tasks = [{ id: 'task-1', name: 'Task One' }],
  traders = [],
}: {
  selfCompletions?: Record<string, unknown>;
  teammateCompletions?: Record<string, unknown>;
  selfState?: ReturnType<typeof createStoreState>;
  teammateState?: ReturnType<typeof createStoreState>;
  tasks?: Array<Record<string, unknown>>;
  traders?: Array<Record<string, unknown>>;
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
