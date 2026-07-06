// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTarkovStore } from '@/stores/useTarkov';
const { rpc, supabaseContext } = vi.hoisted(() => {
  const rpc = vi.fn(async (): Promise<{ data: null; error: { message: string } | null }> => ({
    data: null,
    error: null,
  }));
  const supabaseContext = {
    user: {
      id: 'user-1',
      loggedIn: true,
    },
    client: {
      rpc,
    },
  };
  return { rpc, supabaseContext };
});
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: supabaseContext,
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
describe('useTarkov prestigePvP', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: null, error: null });
  });
  it('archives and resets progress through one rpc call', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.currentGameMode = 'pvp';
      state.tarkovUid = 12345;
      state.gameEdition = 3;
      state.pvp = {
        ...state.pvp,
        displayName: 'Raider',
        level: 42,
        pmcFaction: 'BEAR',
        prestigeLevel: 2,
        progressEpoch: 7,
        taskCompletions: {
          'task-1': {
            complete: true,
            failed: false,
            timestamp: 1000,
          },
        },
      };
      state.pve = {
        ...state.pve,
        level: 9,
        progressEpoch: 4,
      };
    });
    await store.prestigePvP();
    expect(rpc).toHaveBeenCalledWith(
      'archive_prestige_run_and_reset_progress',
      expect.objectContaining({
        p_archived_progress: expect.objectContaining({
          level: 42,
          pmcFaction: 'BEAR',
          prestigeLevel: 2,
          progressEpoch: 7,
        }),
        p_current_game_mode: 'pvp',
        p_game_edition: 3,
        p_mode: 'pvp',
        p_prestige_from: 2,
        p_prestige_to: 3,
        p_pve_data: expect.objectContaining({
          level: 9,
          progressEpoch: 4,
        }),
        p_pvp_data: expect.objectContaining({
          displayName: 'Raider',
          level: 1,
          pmcFaction: 'BEAR',
          prestigeLevel: 3,
          progressEpoch: 8,
        }),
        p_tarkov_uid: 12345,
      })
    );
    expect(store.pvp.level).toBe(1);
    expect(store.pvp.prestigeLevel).toBe(3);
    expect(store.pvp.progressEpoch).toBe(8);
    expect(store.pve.level).toBe(9);
  });
  it('does not patch local progress when the rpc fails', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.currentGameMode = 'pvp';
      state.pvp.level = 20;
      state.pvp.prestigeLevel = 1;
      state.pvp.progressEpoch = 4;
    });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'rpc failed' },
    });
    await expect(store.prestigePvP()).rejects.toThrow(
      'Failed to update prestige progress: rpc failed'
    );
    expect(store.pvp.level).toBe(20);
    expect(store.pvp.prestigeLevel).toBe(1);
    expect(store.pvp.progressEpoch).toBe(4);
  });
  it('archives PvP progress even when the active tab is set to PvE', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.currentGameMode = 'pve';
      state.pvp.level = 18;
      state.pvp.prestigeLevel = 1;
      state.pvp.progressEpoch = 3;
      state.pve.level = 27;
      state.pve.progressEpoch = 8;
    });
    await store.prestigePvP();
    expect(rpc).toHaveBeenCalledWith(
      'archive_prestige_run_and_reset_progress',
      expect.objectContaining({
        p_current_game_mode: 'pve',
        p_mode: 'pvp',
        p_prestige_from: 1,
        p_prestige_to: 2,
      })
    );
    expect(store.pvp.level).toBe(1);
    expect(store.pvp.prestigeLevel).toBe(2);
    expect(store.pve.level).toBe(27);
    expect(store.pve.progressEpoch).toBe(8);
  });
});
