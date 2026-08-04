// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTarkovStore } from '@/stores/useTarkov';
const { rpc, supabaseContext } = vi.hoisted(() => {
  const rpc = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
    error: null,
  }));
  const supabaseContext = {
    user: {
      id: 'user-1' as string | null,
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
describe('useTarkov syncPvpPrestigeLevel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    supabaseContext.user.loggedIn = true;
    supabaseContext.user.id = 'user-1';
    rpc.mockResolvedValue({ error: null });
  });
  it('updates only PvP prestige data without bumping the PvP epoch', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.currentGameMode = 'pve';
      state.gameEdition = 5;
      state.tarkovUid = 12345;
      state.pvp = {
        ...state.pvp,
        displayName: 'Raider',
        level: 33,
        prestigeLevel: 4,
        progressEpoch: 9,
      };
      state.pve = {
        ...state.pve,
        displayName: 'Offline',
        level: 21,
        prestigeLevel: 0,
        progressEpoch: 2,
      };
    });
    await store.syncPvpPrestigeLevel(2);
    expect(rpc).toHaveBeenCalledWith(
      'sync_user_game_mode_progress',
      expect.objectContaining({
        p_current_game_mode: 'pve',
        p_game_edition: 5,
        p_modes: expect.objectContaining({
          pve: expect.objectContaining({
            displayName: 'Offline',
            level: 21,
            prestigeLevel: 0,
            progressEpoch: 2,
          }),
          pvp: expect.objectContaining({
            displayName: 'Raider',
            level: 33,
            prestigeLevel: 2,
            progressEpoch: 9,
          }),
          seasonal: expect.any(Object),
        }),
        p_tarkov_uid: 12345,
      })
    );
    expect(store.pvp.level).toBe(33);
    expect(store.pvp.prestigeLevel).toBe(2);
    expect(store.pvp.progressEpoch).toBe(9);
    expect(store.pve.level).toBe(21);
    expect(store.pve.progressEpoch).toBe(2);
  });
  it('updates local PvP prestige without remote writes when logged out', async () => {
    const store = useTarkovStore();
    supabaseContext.user.loggedIn = false;
    supabaseContext.user.id = null;
    store.$patch((state) => {
      state.pvp.prestigeLevel = 1;
      state.pvp.progressEpoch = 4;
    });
    await store.syncPvpPrestigeLevel(3);
    expect(rpc).not.toHaveBeenCalled();
    expect(store.pvp.prestigeLevel).toBe(3);
    expect(store.pvp.progressEpoch).toBe(4);
  });
  it('keeps local PvP state unchanged when the remote update fails', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.pvp.prestigeLevel = 4;
      state.pvp.progressEpoch = 7;
    });
    rpc.mockResolvedValueOnce({
      error: { message: 'write failed' },
    });
    await expect(store.syncPvpPrestigeLevel(1)).rejects.toThrow(
      'Failed to sync prestige level: write failed'
    );
    expect(store.pvp.prestigeLevel).toBe(4);
    expect(store.pvp.progressEpoch).toBe(7);
  });
});
