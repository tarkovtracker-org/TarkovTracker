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
  it('syncs transformed data when store state contains non-cloneable references', async () => {
    const { useSupabaseSync } = await import('@/composables/supabase/useSupabaseSync');
    const storeState = reactive({
      safeValue: 1,
      unsafeRef: window,
    });
    const store = { $state: storeState } as unknown as Store;
    const sync = useSupabaseSync({
      store,
      table: 'user_progress',
      debounceMs: 5,
      transform: (state: Record<string, unknown>) => ({
        safe_value: state.safeValue,
      }),
    });
    storeState.safeValue = 2;
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
    const store = { $state: storeState } as unknown as Store;
    const sync = useSupabaseSync({
      store,
      table: 'user_preferences',
      debounceMs: 5,
    });
    storeState.count = 3;
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
