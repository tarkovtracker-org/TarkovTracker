// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import type { Store } from 'pinia';
const { from, loggerMock, supabaseContext, upsert } = vi.hoisted(() => {
  const hoistedLoggerMock = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  const hoistedUpsert = vi.fn();
  const hoistedFrom = vi.fn(() => ({ upsert: hoistedUpsert }));
  const hoistedSupabaseContext = {
    client: { from: hoistedFrom },
    user: {
      id: 'user-1',
      loggedIn: true,
    },
  };
  return {
    from: hoistedFrom,
    loggerMock: hoistedLoggerMock,
    supabaseContext: hoistedSupabaseContext,
    upsert: hoistedUpsert,
  };
});
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: supabaseContext,
}));
vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));
type MockStore<TState extends object> = Store<string, TState> & {
  notifySubscriber: () => void;
};
const createMockStore = <TState extends object>(storeState: TState): MockStore<TState> => {
  let subscriber: ((mutation: unknown, state: TState) => void) | null = null;
  return {
    $id: 'mock-store',
    $state: storeState,
    $subscribe: vi.fn((callback: (mutation: unknown, state: TState) => void) => {
      subscriber = callback;
      return () => {
        subscriber = null;
      };
    }),
    notifySubscriber: () => {
      subscriber?.({}, storeState);
    },
  } as unknown as MockStore<TState>;
};
const flushSync = async (debounceMs: number) => {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(debounceMs + 1);
};
describe('useSupabaseSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    upsert.mockResolvedValue({ error: null });
    supabaseContext.user.id = 'user-1';
    supabaseContext.user.loggedIn = true;
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it.each(['realtime', 'snapshot'])(
    'persists a revert to an earlier upload after a %s observation',
    async (observation) => {
      const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
      const store = createMockStore({ count: 5 });
      const sync = useSupabaseSync({ store, table: 'test_table' });
      await sync.syncToSupabase();
      if (observation === 'realtime') {
        Object.assign(store.$state, sync.captureRemoteMerge!()({ count: 8 }));
      } else {
        await sync.withSnapshot!(async (reconcile) => {
          Object.assign(store.$state, reconcile({ count: 8 }));
        });
      }
      expect(store.$state.count).toBe(8);
      store.$state.count = 5;
      store.notifySubscriber();
      await sync.syncToSupabase();
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(upsert).toHaveBeenLastCalledWith({ count: 5, user_id: 'user-1' });
      expect(sync.hasPendingChanges!()).toBe(false);
      sync.cleanup();
    }
  );
  it('invalidates an external-save hash when a pending snapshot is finally applied', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    const store = createMockStore({ reset: 5, other: 5 });
    const sync = useSupabaseSync({ store, table: 'test_table' });
    await sync.syncToSupabase();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const snapshot = sync.withSnapshot!(async (reconcile) => {
      await gate;
      Object.assign(store.$state, reconcile({ other: 8 }));
    });
    await Promise.resolve();
    store.$state.reset = 0;
    sync.acknowledgeExternalSave!({ reset: 0, other: 5 });
    release();
    await snapshot;
    store.$state.other = 5;
    store.notifySubscriber();
    await sync.syncToSupabase();
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenLastCalledWith({ reset: 0, other: 5, user_id: 'user-1' });
    sync.cleanup();
  });
  it.each(['paused', 'signed-out', 'disposed'])(
    'does not transform a gated %s save',
    async (gate) => {
      const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
      const transform = vi.fn((state) => state);
      const sync = useSupabaseSync({
        store: createMockStore({ value: 1 }),
        table: 'test_table',
        transform,
      });
      if (gate === 'paused') sync.pause();
      if (gate === 'signed-out') supabaseContext.user.loggedIn = false;
      if (gate === 'disposed') sync.cleanup();
      await sync.syncToSupabase();
      expect(transform).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
      sync.cleanup();
    }
  );
  it.each(['resolved-error', 'rejected-error'])(
    'retains a failed initial imperative save: %s',
    async (failure) => {
      const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
      if (failure === 'resolved-error')
        upsert.mockResolvedValueOnce({ error: { message: 'offline' } });
      else upsert.mockRejectedValueOnce(new Error('offline'));
      const sync = useSupabaseSync({
        store: createMockStore({ history: ['entry'] }),
        table: 'test_table',
      });
      expect(await sync.syncToSupabase()).toBeNull();
      expect(sync.hasPendingChanges!()).toBe(true);
      expect(await sync.syncToSupabase()).toEqual({ history: ['entry'] });
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(sync.hasPendingChanges!()).toBe(false);
      sync.cleanup();
    }
  );
  it('merges only pending paths and protects edits saved during a snapshot read', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    const store = createMockStore({ pvp: { name: 'old', count: 5 }, pve: { name: 'old' } });
    const sync = useSupabaseSync({ store, table: 'test_table' });
    store.$state.pvp.count = 0;
    store.notifySubscriber();
    const reconcile = sync.captureRemoteMerge!();
    await sync.syncToSupabase();
    expect(sync.hasPendingChanges!()).toBe(false);
    const remote = { pvp: { name: 'remote', count: 5 }, pve: { name: 'other device' } };
    const result = reconcile(remote);
    expect(result).toEqual({ pvp: { name: 'remote', count: 0 }, pve: { name: 'other device' } });
    Object.assign(store.$state, result);
    // The saved zero remains acknowledged after the stale snapshot: a later
    // remote change must not be mistaken for a conflict with a pending edit.
    expect(sync.captureRemoteMerge!()({ pvp: { name: 'remote', count: 3 } })).toEqual({
      pvp: { name: 'remote', count: 3 },
    });
    // Applying one remote value must not make it a permanent local override.
    expect(sync.captureRemoteMerge!()({ pve: { name: 'newer remote' } })).toEqual({
      pve: { name: 'newer remote' },
    });
    sync.cleanup();
  });
  it('does not regress remote fields when a prior save finishes after reconciliation', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    let finish!: (result: { error: null }) => void;
    upsert.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const store = createMockStore({ pvp: { count: 5, name: 'old' } });
    const sync = useSupabaseSync({ store, table: 'test_table' });
    store.$state.pvp.count = 0;
    store.notifySubscriber();
    const saving = sync.syncToSupabase();
    expect(upsert).toHaveBeenCalledOnce();
    Object.assign(store.$state, sync.captureRemoteMerge!()({ pvp: { count: 5, name: 'remote' } }));
    expect(store.$state.pvp).toEqual({ count: 0, name: 'remote' });
    finish({ error: null });
    await saving;
    const newer = sync.captureRemoteMerge!()({ pvp: { count: 3, name: 'newer remote' } });
    expect(newer).toEqual({ pvp: { count: 3, name: 'newer remote' } });
    sync.cleanup();
  });
  it('reads snapshots after saves and holds newer edits until reconciliation finishes', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    let finishSave!: (result: { error: null }) => void;
    let finishRead!: () => void;
    upsert.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        })
    );
    const store = createMockStore({ count: 5, name: 'old' });
    const sync = useSupabaseSync({ store, table: 'test_table', debounceMs: 10 });
    store.$state.count = 0;
    store.notifySubscriber();
    const saving = sync.syncToSupabase();
    const read = vi.fn(async (reconcile) => {
      await new Promise<void>((resolve) => {
        finishRead = resolve;
      });
      Object.assign(store.$state, reconcile({ count: 3, name: 'old' }));
    });
    const snapshot = sync.withSnapshot!(read);
    await flushSync(0);
    expect(read).not.toHaveBeenCalled();
    finishSave({ error: null });
    await saving;
    await flushSync(0);
    expect(read).toHaveBeenCalledOnce();
    store.$state.name = 'pending local';
    store.notifySubscriber();
    sync.resume(); // A live-event resume cannot release the snapshot barrier.
    await flushSync(10);
    expect(upsert).toHaveBeenCalledOnce();
    finishRead();
    await snapshot;
    expect(store.$state).toEqual({ count: 3, name: 'pending local' });
    await flushSync(10);
    expect(upsert).toHaveBeenLastCalledWith({ count: 3, name: 'pending local', user_id: 'user-1' });
    sync.cleanup();
  });
  it('retains a domain-merged pending edit after the deferred save fails', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    const store = createMockStore({ mode: { count: 5, name: 'old' } });
    const sync = useSupabaseSync({ store, table: 'test_table', debounceMs: 10 });
    await sync.withSnapshot!(async (reconcile) => {
      store.$state.mode.count = 0;
      store.notifySubscriber();
      Object.assign(
        store.$state,
        reconcile({ mode: { count: 3, name: 'remote' } }, { mode: { count: 0, name: 'remote' } })
      );
    });
    upsert.mockResolvedValueOnce({ error: { code: '42501', message: 'write denied' } });
    await flushSync(10);
    expect(upsert).toHaveBeenCalledOnce();
    expect(sync.hasPendingChanges!()).toBe(true);
    Object.assign(store.$state, sync.captureRemoteMerge!()({ mode: { count: 4, name: 'newer' } }));
    expect(store.$state.mode).toEqual({ count: 0, name: 'newer' });
    await sync.syncToSupabase();
    expect(sync.hasPendingChanges!()).toBe(false);
    expect(sync.captureRemoteMerge!()({ mode: { count: 6, name: 'latest' } })).toEqual({
      mode: { count: 6, name: 'latest' },
    });
    sync.cleanup();
  });
  it('releases the snapshot barrier after a failed read', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    const store = createMockStore({ count: 0 });
    const sync = useSupabaseSync({ store, table: 'test_table', debounceMs: 10 });
    await expect(
      sync.withSnapshot!(async () => {
        throw new Error('read failed');
      })
    ).rejects.toThrow('read failed');
    store.$state.count = 1;
    store.notifySubscriber();
    await flushSync(10);
    expect(upsert).toHaveBeenCalledWith({ count: 1, user_id: 'user-1' });
    sync.cleanup();
  });
  it('queues resumed saves behind an in-flight write', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    let finishFirst!: (result: { error: null }) => void;
    upsert.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        })
    );
    const store = createMockStore({ value: 1 });
    const sync = useSupabaseSync({ store, table: 'test_table', debounceMs: 10 });
    const first = sync.syncToSupabase();
    store.$state.value = 2;
    store.notifySubscriber();
    sync.pause();
    sync.resume();
    await flushSync(10);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({ value: 1 });
    finishFirst({ error: null });
    await first;
    await flushSync(0);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1]?.[0]).toMatchObject({ value: 2 });
    expect(sync.hasPendingChanges?.()).toBe(false);
    sync.cleanup();
  });
  it('retains pending local edits across a remote reconciliation pause', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    const state = { local: 1, remote: 0 };
    const store = createMockStore(state);
    const sync = useSupabaseSync({ store, table: 'user_progress', debounceMs: 5 });
    store.notifySubscriber();
    expect(sync.hasPendingChanges?.()).toBe(true);
    sync.pause();
    state.remote = 2;
    store.notifySubscriber();
    await flushSync(5);
    expect(upsert).not.toHaveBeenCalled();
    sync.resume();
    await flushSync(5);
    expect(upsert).toHaveBeenCalledWith({ local: 1, remote: 2, user_id: 'user-1' });
    expect(sync.hasPendingChanges?.()).toBe(false);
    sync.cleanup();
  });
  it('saves an edit first made during a pause even when its debounce expires while paused', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    const state = { count: 0 };
    const store = createMockStore(state);
    const sync = useSupabaseSync({ store, table: 'user_progress', debounceMs: 5 });
    sync.pause();
    state.count = 3;
    store.notifySubscriber();
    await flushSync(5);
    expect(upsert).not.toHaveBeenCalled();
    expect(sync.hasPendingChanges?.()).toBe(true);
    sync.resume();
    await flushSync(5);
    expect(upsert).toHaveBeenCalledWith({ count: 3, user_id: 'user-1' });
    expect(sync.hasPendingChanges?.()).toBe(false);
    sync.cleanup();
  });
  it('syncs transformed data when store state contains non-cloneable references', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    const storeState = reactive({
      safeValue: 1,
      unsafeRef: window,
    });
    const store = createMockStore(storeState);
    const sync = useSupabaseSync({
      store,
      table: 'user_progress',
      debounceMs: 5,
      transform: (state: Record<string, unknown>) => ({
        safe_value: state.safeValue,
      }),
    });
    storeState.safeValue = 2;
    store.notifySubscriber();
    await flushSync(5);
    expect(from).toHaveBeenCalledWith('user_progress');
    expect(upsert).toHaveBeenCalledWith({
      safe_value: 2,
      user_id: 'user-1',
    });
    expect(loggerMock.warn).not.toHaveBeenCalled();
    sync.cleanup();
  });
  it('does not mutate store state while adding user_id to payload', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    const storeState = reactive<{ count: number; user_id?: string }>({
      count: 0,
    });
    const store = createMockStore(storeState);
    const sync = useSupabaseSync({
      store,
      table: 'user_preferences',
      debounceMs: 5,
    });
    storeState.count = 3;
    store.notifySubscriber();
    await flushSync(5);
    expect(storeState.user_id).toBeUndefined();
    expect(from).toHaveBeenCalledWith('user_preferences');
    expect(upsert).toHaveBeenCalledWith({
      count: 3,
      user_id: 'user-1',
    });
    sync.cleanup();
  });
  describe('cloud save status and bounded retries', () => {
    const RETRY_DELAYS = [10, 20] as const;
    const createRetryingSync = async (
      onSaveStatusChange = vi.fn(),
      reconcileBeforeRetry?: () => Promise<void>
    ) => {
      const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
      const store = createMockStore({ count: 0 });
      const sync = useSupabaseSync({
        store,
        table: 'user_progress',
        debounceMs: 5,
        retryDelaysMs: RETRY_DELAYS,
        reconcileBeforeRetry,
        onSaveStatusChange,
      });
      return { store, sync, onSaveStatusChange };
    };
    it('marks changes pending until the cloud acknowledges them', async () => {
      const { store, sync, onSaveStatusChange } = await createRetryingSync();
      store.$state.count = 1;
      store.notifySubscriber();
      expect(sync.saveStatus.value.state).toBe('pending');
      await flushSync(5);
      expect(sync.saveStatus.value).toEqual({
        state: 'idle',
        failure: null,
        retryAttempt: 0,
        nextRetryAt: null,
      });
      const states = onSaveStatusChange.mock.calls.map(([status]) => status.state);
      expect(states).toEqual(['pending', 'saving', 'idle']);
      sync.cleanup();
    });
    it('retries on a bounded schedule and keeps changes pending after exhaustion', async () => {
      upsert.mockResolvedValue({ error: { message: 'Progress sync rate limit exceeded' } });
      const { store, sync } = await createRetryingSync();
      store.$state.count = 1;
      store.notifySubscriber();
      await flushSync(5);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(sync.saveStatus.value).toMatchObject({
        state: 'retry_scheduled',
        failure: 'rate_limited',
        retryAttempt: 1,
      });
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0]);
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(sync.saveStatus.value).toMatchObject({ state: 'retry_scheduled', retryAttempt: 2 });
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[1]);
      expect(upsert).toHaveBeenCalledTimes(3);
      expect(sync.saveStatus.value).toMatchObject({ state: 'failed', failure: 'rate_limited' });
      expect(sync.hasPendingChanges!()).toBe(true);
      // Exhaustion does not keep retrying in the background.
      await vi.advanceTimersByTimeAsync(1000);
      expect(upsert).toHaveBeenCalledTimes(3);
      sync.cleanup();
    });
    it('offers a manual retry after exhaustion that acknowledges the changes', async () => {
      upsert.mockResolvedValue({ error: { message: 'boom' } });
      const { store, sync } = await createRetryingSync();
      store.$state.count = 2;
      store.notifySubscriber();
      await flushSync(5);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0] + RETRY_DELAYS[1]);
      expect(sync.saveStatus.value).toMatchObject({ state: 'failed', failure: 'unknown' });
      upsert.mockResolvedValue({ error: null });
      await expect(sync.retryNow()).resolves.toBe(true);
      expect(upsert).toHaveBeenLastCalledWith({ count: 2, user_id: 'user-1' });
      expect(sync.saveStatus.value.state).toBe('idle');
      expect(sync.hasPendingChanges!()).toBe(false);
      sync.cleanup();
    });
    it('restarts the retry budget after a manual retry fails again', async () => {
      upsert.mockResolvedValue({ error: { message: 'boom' } });
      const { store, sync } = await createRetryingSync();
      store.$state.count = 3;
      store.notifySubscriber();
      await flushSync(5);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0] + RETRY_DELAYS[1]);
      await expect(sync.retryNow()).resolves.toBe(false);
      expect(sync.saveStatus.value).toMatchObject({ state: 'retry_scheduled', retryAttempt: 1 });
      sync.cleanup();
    });
    it('classifies a thrown network error while offline', async () => {
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      upsert.mockRejectedValue(new TypeError('Failed to fetch'));
      const { store, sync } = await createRetryingSync();
      store.$state.count = 4;
      store.notifySubscriber();
      await flushSync(5);
      expect(sync.saveStatus.value).toMatchObject({ state: 'retry_scheduled', failure: 'offline' });
      onLine.mockRestore();
      sync.cleanup();
    });
    it('retries pending changes when connectivity returns', async () => {
      upsert.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
      const { store, sync } = await createRetryingSync();
      store.$state.count = 5;
      store.notifySubscriber();
      await flushSync(5);
      expect(sync.saveStatus.value.state).toBe('retry_scheduled');
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(sync.saveStatus.value.state).toBe('idle');
      sync.cleanup();
    });
    it('merges the remote snapshot before a reconnect retry uploads', async () => {
      upsert.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
      const order: string[] = [];
      const reconcile = vi.fn(async () => {
        order.push('reconcile');
      });
      upsert.mockImplementation(async () => {
        order.push('upload');
        return { error: null };
      });
      const { store, sync } = await createRetryingSync(vi.fn(), reconcile);
      store.$state.count = 7;
      store.notifySubscriber();
      await flushSync(5);
      order.length = 0;
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      expect(order).toEqual(['reconcile', 'upload']);
      expect(sync.saveStatus.value.state).toBe('idle');
      sync.cleanup();
    });
    it('does not upload a scheduled retry when the remote snapshot cannot be read', async () => {
      upsert.mockResolvedValue({ error: { message: 'boom' } });
      const reconcile = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const { store, sync } = await createRetryingSync(vi.fn(), reconcile);
      store.$state.count = 8;
      store.notifySubscriber();
      await flushSync(5);
      expect(upsert).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0]);
      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(sync.saveStatus.value).toMatchObject({ state: 'retry_scheduled', retryAttempt: 2 });
      expect(sync.hasPendingChanges!()).toBe(true);
      sync.cleanup();
    });
    it('uploads edits made after a failed save only through the reconciled retry', async () => {
      const order: string[] = [];
      const reconcile = vi.fn(async () => {
        order.push('reconcile');
      });
      upsert.mockImplementation(async (payload) => {
        order.push(`upload:${(payload as { count: number }).count}`);
        return order.length === 1 ? { error: { message: 'Failed to fetch' } } : { error: null };
      });
      const { store, sync } = await createRetryingSync(vi.fn(), reconcile);
      store.$state.count = 1;
      store.notifySubscriber();
      await flushSync(5);
      store.$state.count = 2;
      store.notifySubscriber();
      await vi.advanceTimersByTimeAsync(5);
      expect(order).toEqual(['upload:1']);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0]);
      expect(order).toEqual(['upload:1', 'reconcile', 'upload:2']);
      expect(sync.saveStatus.value.state).toBe('idle');
      sync.cleanup();
    });
    it('restarts a reconciled schedule when an edit follows exhaustion', async () => {
      upsert.mockResolvedValue({ error: { message: 'boom' } });
      const reconcile = vi.fn(async () => {});
      const { store, sync } = await createRetryingSync(vi.fn(), reconcile);
      store.$state.count = 1;
      store.notifySubscriber();
      await flushSync(5);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0] + RETRY_DELAYS[1]);
      expect(sync.saveStatus.value.state).toBe('failed');
      expect(upsert).toHaveBeenCalledTimes(3);
      store.$state.count = 2;
      store.notifySubscriber();
      expect(sync.saveStatus.value).toMatchObject({ state: 'retry_scheduled', retryAttempt: 1 });
      await vi.advanceTimersByTimeAsync(5);
      expect(upsert).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0]);
      expect(reconcile).toHaveBeenCalledTimes(3);
      expect(upsert).toHaveBeenLastCalledWith({ count: 2, user_id: 'user-1' });
      sync.cleanup();
    });
    it('stays bounded when each reconciled retry reads through a snapshot', async () => {
      upsert.mockResolvedValue({ error: { message: 'boom' } });
      let snapshotRead: (() => Promise<void>) | null = null;
      const { store, sync } = await createRetryingSync(vi.fn(), () => snapshotRead!());
      snapshotRead = () => sync.withSnapshot!(async () => {});
      store.$state.count = 1;
      store.notifySubscriber();
      await flushSync(5);
      await vi.advanceTimersByTimeAsync(1000);
      expect(upsert).toHaveBeenCalledTimes(3);
      expect(sync.saveStatus.value.state).toBe('failed');
      sync.cleanup();
    });
    it('re-arms a reconciled retry that finished while sync was paused', async () => {
      upsert.mockResolvedValueOnce({ error: { message: 'boom' } });
      const reconcile = vi.fn(async () => {});
      const { store, sync } = await createRetryingSync(vi.fn(), reconcile);
      store.$state.count = 1;
      store.notifySubscriber();
      await flushSync(5);
      sync.pause();
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0]);
      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledTimes(1);
      sync.resume();
      expect(sync.saveStatus.value.state).toBe('retry_scheduled');
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[1]);
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(sync.saveStatus.value.state).toBe('idle');
      sync.cleanup();
    });
    it('reconciles an edit made while the recovering retry was in flight', async () => {
      let finishRetry: (value: { error: null }) => void = () => {};
      upsert
        .mockResolvedValueOnce({ error: { message: 'boom' } })
        .mockImplementationOnce(() => new Promise((resolve) => (finishRetry = resolve)));
      const reconcile = vi.fn(async () => {});
      const { store, sync } = await createRetryingSync(vi.fn(), reconcile);
      store.$state.count = 1;
      store.notifySubscriber();
      await flushSync(5);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0]);
      expect(upsert).toHaveBeenCalledTimes(2);
      store.$state.count = 2;
      store.notifySubscriber();
      finishRetry({ error: null });
      await vi.advanceTimersByTimeAsync(5);
      // The follow-up waits for its own reconciled retry instead of a direct upload.
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(reconcile).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0]);
      expect(reconcile).toHaveBeenCalledTimes(2);
      expect(upsert).toHaveBeenCalledTimes(3);
      expect(upsert).toHaveBeenLastCalledWith({ count: 2, user_id: 'user-1' });
      expect(sync.saveStatus.value.state).toBe('idle');
      sync.cleanup();
    });
    it('acknowledges a state saved outside the controller without uploading it again', async () => {
      const { store, sync } = await createRetryingSync();
      store.$state.count = 3;
      store.notifySubscriber();
      expect(sync.saveStatus.value.state).toBe('pending');
      sync.acknowledgeExternalSave!({ count: 3 });
      expect(sync.saveStatus.value.state).toBe('idle');
      expect(sync.hasPendingChanges!()).toBe(false);
      await flushSync(5);
      expect(upsert).not.toHaveBeenCalled();
      sync.cleanup();
    });
    it('keeps an edit that differs from the externally saved state pending', async () => {
      const { store, sync } = await createRetryingSync();
      store.$state.count = 4;
      store.notifySubscriber();
      sync.acknowledgeExternalSave!({ count: 3 });
      expect(sync.hasPendingChanges!()).toBe(true);
      await flushSync(5);
      expect(upsert).toHaveBeenCalledWith({ count: 4, user_id: 'user-1' });
      sync.cleanup();
    });
    it('stops scheduled retries after cleanup', async () => {
      upsert.mockResolvedValue({ error: { message: 'boom' } });
      const { store, sync } = await createRetryingSync();
      store.$state.count = 6;
      store.notifySubscriber();
      await flushSync(5);
      sync.cleanup();
      await vi.advanceTimersByTimeAsync(1000);
      expect(upsert).toHaveBeenCalledTimes(1);
      await expect(sync.retryNow()).resolves.toBe(false);
    });
  });
  describe('classifyCloudSaveFailure', () => {
    it.each([
      [{ message: 'Progress sync rate limit exceeded' }, 'rate_limited'],
      [{ message: 'Not authenticated' }, 'auth'],
      [new TypeError('Failed to fetch'), 'offline'],
      [{ message: 'relation missing' }, 'unknown'],
      [null, 'unknown'],
    ])('classifies %o as %s', async (error, expected) => {
      const { classifyCloudSaveFailure } = await import('@/composables/supabase/useSupabaseSync');
      expect(classifyCloudSaveFailure(error)).toBe(expected);
    });
  });
});
