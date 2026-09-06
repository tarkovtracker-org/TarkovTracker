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
