// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { defaultState } from '@/stores/progressState';
import { reconcileRemoteSnapshot } from '@/stores/tarkov/realtimeListener';
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
    vi.mocked(reconcileRemoteSnapshot).mockClear();
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
  it('holds an oversized payload without retrying it and recovers after an edit', async () => {
    sendProgressSync.mockResolvedValue({
      error: { code: 'P0001', message: 'p_modes exceeds the maximum payload size' },
    });
    const { store, sync } = startSync();
    store.pvp.displayName = 'oversized';
    await nextTick();
    await sync.syncToSupabase();
    expect(sync.saveStatus.value).toMatchObject({
      state: 'failed',
      failure: 'payload_too_large',
      nextRetryAt: null,
    });
    await vi.advanceTimersByTimeAsync(120000);
    await sync.retryNow();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(120000);
    expect(sendProgressSync).toHaveBeenCalledTimes(1);
    expect(sync.hasPendingChanges!()).toBe(true);
    expect(store.pvp.displayName).toBe('oversized');
    sendProgressSync.mockResolvedValue({ error: null });
    store.pvp.displayName = 'recovered';
    await nextTick();
    await vi.advanceTimersByTimeAsync(6001);
    expect(sendProgressSync).toHaveBeenCalledTimes(2);
    expect(sync.hasPendingChanges!()).toBe(false);
  });
  it('recovers an edit held during a deferred snapshot after an oversized rejection', async () => {
    sendProgressSync.mockResolvedValueOnce({
      error: { message: 'p_modes exceeds the maximum payload size' },
    });
    const { store, sync } = startSync();
    store.pvp.displayName = 'oversized';
    await nextTick();
    await sync.syncToSupabase();
    const gate = Promise.withResolvers<undefined>();
    const reading = Promise.withResolvers<undefined>();
    const snapshot = sync.withSnapshot!(async () => {
      reading.resolve(undefined);
      await gate.promise;
    });
    await reading.promise;
    store.pvp.displayName = 'recovered';
    await nextTick();
    await vi.advanceTimersByTimeAsync(120000);
    expect(sendProgressSync).toHaveBeenCalledTimes(1);
    expect(sync.hasPendingChanges!()).toBe(true);
    expect(reconcileRemoteSnapshot).not.toHaveBeenCalled();
    gate.resolve(undefined);
    await snapshot;
    expect(sync.hasPendingChanges!()).toBe(true);
    await vi.advanceTimersByTimeAsync(6001);
    expect(reconcileRemoteSnapshot).toHaveBeenCalledOnce();
    expect(vi.mocked(reconcileRemoteSnapshot).mock.invocationCallOrder[0]).toBeLessThan(
      sendProgressSync.mock.invocationCallOrder[1]!
    );
    expect(sendProgressSync).toHaveBeenCalledTimes(2);
    expect(sendProgressSync.mock.calls[1]?.[2]).toMatchObject({
      pvp_data: { displayName: 'recovered' },
    });
    expect(sync.hasPendingChanges!()).toBe(false);
  });
  it('keeps an unchanged rejected payload blocked across snapshots and merge notifications', async () => {
    sendProgressSync.mockResolvedValue({
      error: { message: 'p_modes exceeds the maximum payload size' },
    });
    const { store, sync } = startSync();
    store.pvp.displayName = 'oversized';
    await nextTick();
    await sync.syncToSupabase();
    await sync.withSnapshot!(async (reconcile) => {
      store.$patch(reconcile(JSON.parse(JSON.stringify(store.$state))));
      await nextTick();
    });
    await vi.advanceTimersByTimeAsync(120000);
    expect(sendProgressSync).toHaveBeenCalledTimes(1);
    expect(sync.saveStatus.value).toMatchObject({ state: 'failed', failure: 'payload_too_large' });
    expect(sync.hasPendingChanges!()).toBe(true);
    // A notification that does not change the wire payload must not clear the cause either.
    store.$patch({});
    await nextTick();
    expect(sync.saveStatus.value).toMatchObject({ state: 'failed', failure: 'payload_too_large' });
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
