// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { useTeamStoreWithSupabase, useTeammateStores } from '@/stores/useTeamStore';
import { ACTIVE_SEASON_NUMBER } from '@/utils/constants';
const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  rpc: vi.fn(),
  replay: vi.fn(),
  cleanup: vi.fn(),
  user: { id: 'self', loggedIn: false },
}));
vi.mock('@/stores/useSystemStore', () => ({
  getTeamIdFromState: () => null,
  useSystemStoreWithSupabase: () => ({ systemStore: { $state: {} } }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => 'pvp',
    $state: { currentGameMode: 'pvp', pvp: {} },
  }),
}));
vi.mock('@/composables/supabase/useSupabaseListener', () => ({
  useSupabaseListener: () => ({ cleanup: mocks.cleanup, isSubscribed: { value: false } }),
}));
vi.mock('@/composables/useSafeToast', () => ({ useSafeToast: () => ({ add: vi.fn() }) }));
vi.mock('@/stores/tarkov/metadataStoreBridge', () => ({
  replayProgressMetadataMigration: mocks.replay,
}));
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: mocks.user,
    client: { from: () => ({ select: () => ({ eq: mocks.eq }) }), rpc: mocks.rpc },
  },
}));
const row = (level: number, mode = 'pvp', season = 0) => ({
  game_mode: mode,
  season_number: season,
  progress_data: { level },
});
const emitProgress = (data: Record<string, unknown>) =>
  window.dispatchEvent(
    new CustomEvent('teammate-mode-progress', { detail: { user_id: 'other', ...data } })
  );
let scope: ReturnType<typeof effectScope>;
let instance: ReturnType<typeof useTeamStoreWithSupabase>;
let flow: ReturnType<typeof useTeammateStores>;
const addMember = async (mode: 'pvp' | 'pve' | 'seasonal' = 'pvp') => {
  instance.teamStore.members = ['self', 'other'];
  instance.teamStore.memberProfiles = {
    other: {
      gameMode: mode,
      gameEdition: 4,
      displayName: 'Teammate',
      level: 10,
      tasksCompleted: 0,
    },
  };
  await flushPromises();
};
describe('teammate store hydration and lifetime', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    mocks.eq.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
    instance = useTeamStoreWithSupabase();
    await flushPromises();
    scope = effectScope();
    flow = scope.run(() => useTeammateStores())!;
    await flushPromises();
  });
  afterEach(() => {
    scope.stop();
    instance.cleanup();
  });
  it('hydrates actual teammate stores, excludes self and preserves mode identity', async () => {
    mocks.eq.mockResolvedValue({
      data: [row(21), row(32, 'pve'), row(43, 'seasonal', ACTIVE_SEASON_NUMBER)],
      error: null,
    });
    await addMember('pve');
    expect(Object.keys(flow.teammateStores.value)).toEqual(['other']);
    expect(flow.teammateStores.value.other?.$state).toMatchObject({
      currentGameMode: 'pve',
      gameEdition: 4,
      pvp: { level: 21 },
      pve: { level: 32 },
      seasonal: { level: 43 },
    });
    expect(mocks.replay).toHaveBeenCalled();
  });
  it('uses persistent legacy progress only when normalized data is missing', async () => {
    mocks.rpc.mockResolvedValue({ data: { level: 37 }, error: null });
    await addMember('pve');
    expect(flow.teammateStores.value.other?.$state.pve.level).toBe(37);
    expect(mocks.rpc).toHaveBeenCalledWith('get_teammate_legacy_progress', {
      p_user_id: 'other',
      p_game_mode: 'pve',
    });
  });
  it('does not overwrite materialized normalized progress with legacy data', async () => {
    mocks.eq.mockResolvedValue({ data: [row(25)], error: null });
    mocks.rpc.mockResolvedValue({ data: { level: 50 }, error: null });
    await addMember();
    expect(flow.teammateStores.value.other?.$state.pvp.level).toBe(25);
  });
  it('retains hydrated progress when a reconnect placeholder has a failed legacy fallback', async () => {
    mocks.eq.mockResolvedValue({
      data: [{ ...row(25), progress_data: { level: 25, pmcFaction: 'BEAR', xpOffset: 450 } }],
      error: null,
    });
    await addMember();
    const teammate = flow.teammateStores.value.other!;
    const previous = JSON.parse(JSON.stringify(teammate.$state.pvp));
    const placeholder = { ...row(1), progress_data: {} };
    mocks.eq.mockResolvedValue({ data: [placeholder], error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'temporarily unavailable' } });
    window.dispatchEvent(new Event('teammate-progress-reconnected'));
    await flushPromises();
    expect(mocks.rpc).toHaveBeenCalledWith('get_teammate_legacy_progress', {
      p_user_id: 'other',
      p_game_mode: 'pvp',
    });
    expect(teammate.$state.pvp).toEqual(previous);
    emitProgress(placeholder);
    expect(teammate.$state.pvp).toEqual(previous);
    mocks.rpc.mockResolvedValue({ data: { level: 31, pmcFaction: 'BEAR' }, error: null });
    window.dispatchEvent(new Event('teammate-progress-reconnected'));
    await flushPromises();
    expect(teammate.$state.pvp.level).toBe(31);
  });
  it('does not let a live placeholder suppress an outstanding usable legacy read', async () => {
    const legacy = Promise.withResolvers<{ data: { level: number }; error: null }>();
    mocks.eq.mockResolvedValue({ data: [{ ...row(1), progress_data: {} }], error: null });
    mocks.rpc.mockReturnValue(legacy.promise);
    await addMember();
    emitProgress({ ...row(1), progress_data: {} });
    legacy.resolve({ data: { level: 37 }, error: null });
    await flushPromises();
    expect(flow.teammateStores.value.other?.$state.pvp.level).toBe(37);
  });
  it('never uses persistent legacy fallback for a Seasonal teammate', async () => {
    mocks.eq.mockResolvedValue({
      data: [row(20, 'seasonal', ACTIVE_SEASON_NUMBER - 1)],
      error: null,
    });
    await addMember('seasonal');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(flow.teammateStores.value.other?.$state.seasonal.level).toBe(1);
  });
  it('ignores events for a different user, invalid mode, or wrong season', async () => {
    await addMember();
    emitProgress({ ...row(50), user_id: 'outsider' });
    emitProgress(row(50, 'arena'));
    emitProgress(row(50, 'seasonal', ACTIVE_SEASON_NUMBER - 1));
    emitProgress(row(50, 'pvp', 1));
    expect(flow.teammateStores.value.other?.$state.pvp.level).toBe(1);
    expect(flow.teammateStores.value.other?.$state.seasonal.level).toBe(1);
    emitProgress(row(24, 'seasonal', ACTIVE_SEASON_NUMBER));
    expect(flow.teammateStores.value.other?.$state.seasonal.level).toBe(24);
  });
  it('keeps authoritative realtime progress when an older hydration request completes', async () => {
    const pending = Promise.withResolvers<{ data: ReturnType<typeof row>[]; error: null }>();
    mocks.eq.mockReturnValue(pending.promise);
    await addMember();
    emitProgress(row(40));
    pending.resolve({ data: [row(10)], error: null });
    await flushPromises();
    expect(flow.teammateStores.value.other?.$state.pvp.level).toBe(40);
  });
  it('removes departed teammates and ignores their delayed hydration', async () => {
    const pending = Promise.withResolvers<{ data: ReturnType<typeof row>[]; error: null }>();
    mocks.eq.mockReturnValue(pending.promise);
    await addMember();
    const departed = flow.teammateStores.value.other!;
    instance.teamStore.members = ['self'];
    await flushPromises();
    pending.resolve({ data: [row(50)], error: null });
    emitProgress(row(60));
    await flushPromises();
    expect(flow.teammateStores.value).toEqual({});
    expect(departed.$state.pvp.level).toBe(1);
  });
  it('updates identity from refreshed profiles without re-fetching progress', async () => {
    await addMember();
    instance.teamStore.memberProfiles = {
      other: {
        displayName: 'Teammate',
        level: 1,
        tasksCompleted: 0,
        gameMode: 'pve',
        gameEdition: 2,
      },
    };
    await flushPromises();
    expect(flow.teammateStores.value.other?.$state).toMatchObject({
      currentGameMode: 'pve',
      gameEdition: 2,
    });
    expect(mocks.eq).toHaveBeenCalledTimes(1);
  });
  it('detaches event listeners when the owning scope is disposed', async () => {
    await addMember();
    const previous = flow.teammateStores.value.other!;
    scope.stop();
    emitProgress(row(50));
    expect(flow.teammateStores.value).toEqual({});
    expect(flow.teammateUnsubscribes.value).toEqual({});
    expect(previous.$state.pvp.level).toBe(1);
  });
  it.each(['response', 'rejection'])(
    'handles hydration %s errors without applying legacy state',
    async (kind) => {
      if (kind === 'response')
        mocks.eq.mockResolvedValue({ data: null, error: { message: 'offline' } });
      else mocks.eq.mockRejectedValue(new Error('offline'));
      mocks.rpc.mockResolvedValue({ data: { level: 50 }, error: null });
      await addMember();
      expect(flow.teammateStores.value.other?.$state.pvp.level).toBe(1);
      expect(mocks.replay).not.toHaveBeenCalled();
    }
  );
});
