// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTarkovStore } from '@/stores/useTarkov';
const { from, upsert, supabaseContext } = vi.hoisted(() => {
  const upsert = vi.fn(async (): Promise<{ data: null; error: { message: string } | null }> => ({
    data: null,
    error: null,
  }));
  const from = vi.fn(() => ({
    upsert,
  }));
  const supabaseContext = {
    user: {
      id: 'user-1' as string | null,
      loggedIn: true,
    },
    client: {
      from,
    },
  };
  return { from, upsert, supabaseContext };
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
    upsert.mockResolvedValue({ data: null, error: null });
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
    expect(from).toHaveBeenCalledWith('user_progress');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        current_game_mode: 'pve',
        game_edition: 5,
        pve_data: expect.objectContaining({
          displayName: 'Offline',
          level: 21,
          prestigeLevel: 0,
          progressEpoch: 2,
        }),
        pvp_data: expect.objectContaining({
          displayName: 'Raider',
          level: 33,
          prestigeLevel: 2,
          progressEpoch: 9,
        }),
        tarkov_uid: 12345,
        user_id: 'user-1',
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
    expect(from).not.toHaveBeenCalled();
    expect(store.pvp.prestigeLevel).toBe(3);
    expect(store.pvp.progressEpoch).toBe(4);
  });
  it('keeps local PvP state unchanged when the remote update fails', async () => {
    const store = useTarkovStore();
    store.$patch((state) => {
      state.pvp.prestigeLevel = 4;
      state.pvp.progressEpoch = 7;
    });
    upsert.mockResolvedValueOnce({
      data: null,
      error: { message: 'write failed' },
    });
    await expect(store.syncPvpPrestigeLevel(1)).rejects.toThrow(
      'Failed to sync PvP prestige level: write failed'
    );
    expect(store.pvp.prestigeLevel).toBe(4);
    expect(store.pvp.progressEpoch).toBe(7);
  });
});
