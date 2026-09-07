// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState, type UserState } from '@/stores/progressState';
import { mergeProgressData } from '@/stores/tarkov/progressMerge';
import { performReset, resolveInitialSyncState } from '@/stores/tarkov/resetEngine';
import { ACTIVE_SEASON_NUMBER } from '@/utils/constants';
const { clearProgressStorageMock, supabaseContext, syncProgressStateMock } = vi.hoisted(() => ({
  clearProgressStorageMock: vi.fn(),
  supabaseContext: {
    client: {},
    user: { id: 'user-1' as string | null, loggedIn: true },
  },
  syncProgressStateMock: vi.fn(async () => ({ error: null as { message: string } | null })),
}));
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: supabaseContext }));
vi.mock('@/stores/tarkov/progressPersistence', () => ({
  syncProgressState: syncProgressStateMock,
}));
vi.mock('@/utils/clientStorage', () => ({
  clearProgressStorage: clearProgressStorageMock,
}));
vi.mock('@/stores/tarkov/realtimeListener', () => ({
  getRegisteredSyncController: () => null,
}));
const createStore = () => {
  const state: UserState = structuredClone(defaultState);
  state.pvp = { ...state.pvp, level: 42, progressEpoch: 3, taskCompletions: { pvpTask: {} } };
  state.pve = { ...state.pve, level: 21, taskCompletions: { pveTask: {} } };
  state.seasonal = {
    ...state.seasonal,
    level: 17,
    progressEpoch: 4,
    taskCompletions: { seasonalTask: {} },
  };
  return {
    $state: state,
    $patch: (fn: (draft: UserState) => void) => fn(state),
  };
};
describe('performReset seasonal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseContext.user.loggedIn = true;
    supabaseContext.user.id = 'user-1';
    syncProgressStateMock.mockResolvedValue({ error: null });
  });
  it('merges timestamped progress when a visibility-only mode timestamp is newer', () => {
    const local = structuredClone(defaultState);
    const remote = structuredClone(defaultState);
    local.pvp.taskCompletions.localTask = { complete: true, timestamp: 20 };
    local.pvp.hideoutModules.module = { complete: true, timestamp: 20 };
    remote.pvp.taskCompletions.remoteTask = { complete: true, timestamp: 10 };
    const result = resolveInitialSyncState(local, remote, 20, 30, 2, 1, {
      mergeModeSnapshots: true,
    });
    expect(result.pvp.taskCompletions.localTask?.complete).toBe(true);
    expect(result.pvp.taskCompletions.remoteTask?.complete).toBe(true);
    expect(result.pvp.hideoutModules.module?.complete).toBe(true);
    remote.pvp.progressEpoch = 1;
    expect(
      resolveInitialSyncState(local, remote, 20, 30, 2, 1, { mergeModeSnapshots: true }).pvp
        .taskCompletions.localTask
    ).toBeUndefined();
  });
  it.each([true, false])(
    'preserves newer count decrements and explicit clears (local preferred: %s)',
    (preferLocal) => {
      const local = structuredClone(defaultState);
      const remote = structuredClone(defaultState);
      const preferred = preferLocal ? local : remote;
      const older = preferLocal ? remote : local;
      preferred.pvp.taskObjectives.objective = { count: 0, complete: false };
      older.pvp.taskObjectives.objective = { count: 5, complete: true };
      // Per-entry timestamps override the overall snapshot preference.
      preferred.pvp.hideoutParts.part = { count: 8, timestamp: 10 };
      older.pvp.hideoutParts.part = { count: 2, timestamp: 20 };
      const result = resolveInitialSyncState(local, remote, preferLocal ? 30 : 10, 20, 1, 1, {
        mergeModeSnapshots: true,
      });
      expect(result.pvp.taskObjectives.objective?.count).toBe(0);
      expect(result.pvp.taskObjectives.objective?.complete).toBe(false);
      expect(result.pvp.hideoutParts.part?.count).toBe(2);
    }
  );
  it.each([false, true])(
    'handles count entries without numeric counts (timestamp preference: %s)',
    (preferNewerCount) => {
      const local = structuredClone(defaultState.pvp);
      const remote = structuredClone(defaultState.pvp);
      local.taskObjectives.noCounts = { complete: false, timestamp: 1 };
      remote.taskObjectives.noCounts = { complete: true, timestamp: 2 };
      local.hideoutParts.olderCount = { count: 4, timestamp: 1 };
      remote.hideoutParts.olderCount = { complete: true, timestamp: 2 };
      local.taskObjectives.decreased = { count: 4, timestamp: 1 };
      remote.taskObjectives.decreased = { count: 2, timestamp: 2 };
      const result = mergeProgressData(local, remote, preferNewerCount);
      expect(result.taskObjectives.decreased?.count).toBe(preferNewerCount ? 2 : 4);
      expect(result.taskObjectives.noCounts?.count).toBe(0);
      expect(result.hideoutParts.olderCount?.count).toBe(4);
    }
  );
  it.each([true, false])(
    'preserves preferred profile clears at startup (local: %s)',
    (localWins) => {
      const local = structuredClone(defaultState);
      const remote = structuredClone(defaultState);
      const preferred = localWins ? local : remote;
      const older = localWins ? remote : local;
      preferred.pvp.displayName = null;
      preferred.pvp.skillOffsets = {};
      preferred.pvp.xpOffset = 0;
      older.pvp.displayName = 'old name';
      older.pvp.skillOffsets = { Endurance: 4 };
      older.pvp.xpOffset = 100;
      older.pvp.taskCompletions.remoteTask = { complete: true, timestamp: 10 };
      const result = resolveInitialSyncState(local, remote, localWins ? 30 : 10, 20, 1, 1, {
        mergeModeSnapshots: true,
      });
      expect(result.pvp).toMatchObject({ displayName: null, skillOffsets: {}, xpOffset: 0 });
      expect(result.pvp.skillOffsets).toEqual({});
      expect(result.pvp.taskCompletions.remoteTask?.complete).toBe(true);
    }
  );
  it('resets only the seasonal mode and leaves persistent progress untouched', async () => {
    const store = createStore();
    await performReset('seasonal', store);
    expect(store.$state.seasonal.level).toBe(defaultState.seasonal.level);
    expect(store.$state.seasonal.taskCompletions).toEqual({});
    expect(store.$state.pvp.level).toBe(42);
    expect(store.$state.pvp.taskCompletions).toEqual({ pvpTask: {} });
    expect(store.$state.pve.level).toBe(21);
    expect(store.$state.pve.taskCompletions).toEqual({ pveTask: {} });
  });
  it('bumps only the seasonal progress epoch so the wipe wins over older progress', async () => {
    const store = createStore();
    await performReset('seasonal', store);
    expect(store.$state.seasonal.progressEpoch).toBeGreaterThan(4);
    expect(store.$state.pvp.progressEpoch).toBe(3);
  });
  it('sends the reset seasonal payload and the active season to the sync RPC', async () => {
    const store = createStore();
    await performReset('seasonal', store);
    expect(syncProgressStateMock).toHaveBeenCalledTimes(1);
    const [, userId, syncedState] = syncProgressStateMock.mock.calls[0] as unknown as [
      unknown,
      string,
      UserState,
    ];
    expect(userId).toBe('user-1');
    expect(syncedState.seasonal.taskCompletions).toEqual({});
    expect(syncedState.seasonal.progressEpoch).toBeGreaterThan(4);
    expect(syncedState.seasonalSeasonNumber).toBe(ACTIVE_SEASON_NUMBER);
    expect(syncedState.pvp.level).toBe(42);
    expect(syncedState.pve.level).toBe(21);
    expect(syncedState.currentGameMode).toBe(store.$state.currentGameMode);
    expect(syncedState.gameEdition).toBe(store.$state.gameEdition);
  });
  it('keeps local state intact when the remote reset fails', async () => {
    syncProgressStateMock.mockResolvedValue({ error: { message: 'network down' } });
    const store = createStore();
    await expect(performReset('seasonal', store)).rejects.toThrow('network down');
    expect(store.$state.seasonal.level).toBe(17);
    expect(clearProgressStorageMock).not.toHaveBeenCalled();
  });
  it('resets seasonal locally without a sync when signed out', async () => {
    supabaseContext.user.loggedIn = false;
    supabaseContext.user.id = null;
    const store = createStore();
    await performReset('seasonal', store);
    expect(syncProgressStateMock).not.toHaveBeenCalled();
    expect(store.$state.seasonal.level).toBe(defaultState.seasonal.level);
    expect(store.$state.pvp.level).toBe(42);
  });
});
