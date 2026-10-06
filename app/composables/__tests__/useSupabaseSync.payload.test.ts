// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { defaultState } from '@/stores/progressState';
import { ProgressSyncSession } from '@/stores/tarkov/syncSession';
const { sendProgressSync, user } = vi.hoisted(() => ({
  sendProgressSync: vi.fn(),
  user: { id: 'user-1', loggedIn: true },
}));
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: { user } }));
vi.mock('@/stores/tarkov/progressPersistence', () => ({ sendProgressSync }));
vi.mock('@/stores/tarkov/realtimeListener', () => ({
  cleanupRealtimeListener: vi.fn(),
  reconcileRemoteSnapshot: vi.fn(),
}));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const useStore = defineStore('payload-regression', {
  state: () => structuredClone(defaultState),
});
const sessions = new Set<ProgressSyncSession>();
const startSync = () => {
  const store = useStore();
  const session = new ProgressSyncSession();
  sessions.add(session);
  session.start({
    store,
    userId: user.id,
    client: { rpc: vi.fn() },
    hadRemoteData: false,
  });
  return { store, sync: session.getController()! };
};
describe('progress sync payload equality', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    sendProgressSync.mockReset().mockResolvedValue({ error: null });
    user.id = 'user-1';
    user.loggedIn = true;
  });
  afterEach(() => {
    for (const session of sessions) session.reset();
    sessions.clear();
    vi.useRealTimers();
  });
  it('uploads Aa then BB through the production transform and deduplicates identical payloads', async () => {
    const { store, sync } = startSync();
    store.pvp.displayName = 'Aa';
    await nextTick();
    await sync.syncToSupabase();
    store.pvp.displayName = 'BB';
    await nextTick();
    await sync.syncToSupabase();
    expect(sendProgressSync).toHaveBeenCalledTimes(2);
    expect(sendProgressSync.mock.calls[0]?.[2]).toMatchObject({
      user_id: 'user-1',
      pvp_data: { displayName: 'Aa' },
    });
    expect(sendProgressSync.mock.calls[1]?.[2]).toMatchObject({
      user_id: 'user-1',
      pvp_data: { displayName: 'BB' },
    });
    await sync.syncToSupabase();
    expect(sendProgressSync).toHaveBeenCalledTimes(2);
    expect(sync.hasPendingChanges!()).toBe(false);
  });
  it('does not acknowledge pending BB when an external save acknowledged Aa', async () => {
    const { store, sync } = startSync();
    store.pvp.displayName = 'Aa';
    const saved = JSON.parse(JSON.stringify(store.$state));
    store.pvp.displayName = 'BB';
    await nextTick();
    sync.acknowledgeExternalSave!(saved);
    expect(sync.hasPendingChanges!()).toBe(true);
    expect(sync.saveStatus.value.state).toBe('pending');
    await vi.advanceTimersByTimeAsync(5001);
    expect(sendProgressSync).toHaveBeenCalledTimes(1);
    expect(sendProgressSync.mock.calls[0]?.[2]).toMatchObject({
      pvp_data: { displayName: 'BB' },
    });
    expect(sync.hasPendingChanges!()).toBe(false);
  });
  it('retains a failed payload until a successful retry acknowledges it', async () => {
    sendProgressSync.mockResolvedValueOnce({ error: { message: 'offline' } });
    const { store, sync } = startSync();
    store.pvp.displayName = 'BB';
    await nextTick();
    await sync.syncToSupabase();
    expect(sync.hasPendingChanges!()).toBe(true);
    await sync.retryNow();
    expect(sendProgressSync).toHaveBeenCalledTimes(2);
    expect(sync.hasPendingChanges!()).toBe(false);
  });
  it('does not acknowledge an upload that finishes after an owner switch', async () => {
    let finish!: (result: { error: null }) => void;
    sendProgressSync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { store, sync } = startSync();
    store.pvp.displayName = 'Aa';
    await nextTick();
    const saving = sync.syncToSupabase();
    user.id = 'user-2';
    finish({ error: null });
    await saving;
    expect(sync.hasPendingChanges!()).toBe(true);
    user.id = 'user-1';
    await sync.syncToSupabase();
    expect(sendProgressSync).toHaveBeenCalledTimes(2);
    expect(sync.hasPendingChanges!()).toBe(false);
  });
});
