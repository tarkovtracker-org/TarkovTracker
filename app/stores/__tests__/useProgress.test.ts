import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
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
const createStoreState = (taskCompletions: Record<string, unknown>) => ({
  currentGameMode: 'pvp',
  gameEdition: 1,
  pvp: createProgressData(taskCompletions),
  pve: createProgressData({}),
});
describe('useProgressStore', () => {
  it('treats boolean teammate completions as completed', async () => {
    vi.resetModules();
    setActivePinia(createPinia());
    const task = { id: 'task-1', name: 'Task One' };
    const selfStore = {
      $state: createStoreState({ 'task-1': { complete: false, failed: false } }),
    };
    const teammateStore = {
      $state: createStoreState({ 'task-1': true }),
    };
    const teammateStores = ref({ 'teammate-1': teammateStore });
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
        tasks: [task],
        traders: [],
        hideoutStations: [],
        playerLevels: [],
        editions: [],
      }),
    }));
    vi.doMock('@/stores/useTarkov', () => ({
      useTarkovStore: () => selfStore,
    }));
    const { useProgressStore } = await import('@/stores/useProgress');
    const store = useProgressStore();
    expect(store.tasksCompletions['task-1']).toEqual({ self: false, 'teammate-1': true });
  });
});
