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
});
