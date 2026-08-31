// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from 'pinia';
const { channel, client, loggerMock, removeChannel } = vi.hoisted(() => {
  const handlers: Array<(payload: unknown) => void> = [];
  const realtimeChannel = {
    on: vi.fn((_event: string, _config: unknown, handler: (payload: unknown) => void) => {
      handlers.push(handler);
      return realtimeChannel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      callback('SUBSCRIBED');
      return realtimeChannel;
    }),
  };
  const removeChannelMock = vi.fn().mockResolvedValue('ok');
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(() => query),
    then: (resolve: (value: { data: null; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: null, error: null })),
  };
  const supabaseClient = {
    channel: vi.fn(() => realtimeChannel),
    from: vi.fn(() => query),
    removeChannel: removeChannelMock,
  };
  return {
    channel: realtimeChannel,
    client: supabaseClient,
    loggerMock: {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
    removeChannel: removeChannelMock,
  };
});
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: { client },
}));
vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}));
vi.mock('@/utils/storeHelpers', () => ({
  clearStaleState: vi.fn(),
  resetStore: vi.fn(),
  safePatchStore: vi.fn(),
}));
const createStore = (): Store<string, Record<string, unknown>> =>
  ({
    $id: 'listener-test',
    $state: {},
    $patch: vi.fn(),
  }) as unknown as Store<string, Record<string, unknown>>;
describe('useSupabaseListener cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('does not resume sync after a delayed realtime update is cleaned up', async () => {
    const { useSupabaseListener } = await import('@/composables/supabase/useSupabaseListener');
    const syncController = {
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const listener = useSupabaseListener({
      filter: 'id=eq.row-1',
      patchStore: false,
      store: createStore(),
      syncController,
      table: 'test_table',
    });
    syncController.resume.mockClear();
    const payloadHandler = channel.on.mock.calls[0]?.[2] as
      ((payload: unknown) => void) | undefined;
    payloadHandler?.({ eventType: 'UPDATE', new: { id: 'row-1' } });
    expect(syncController.pause).toHaveBeenCalledOnce();
    listener.cleanup();
    await vi.advanceTimersByTimeAsync(100);
    expect(syncController.resume).toHaveBeenCalledOnce();
    expect(removeChannel).toHaveBeenCalledOnce();
  });
  it('ignores payloads from a channel after cleanup', async () => {
    const { useSupabaseListener } = await import('@/composables/supabase/useSupabaseListener');
    const syncController = {
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const onData = vi.fn();
    const listener = useSupabaseListener({
      filter: 'id=eq.row-1',
      onData,
      patchStore: false,
      store: createStore(),
      syncController,
      table: 'test_table',
    });
    const payloadHandler = channel.on.mock.calls[0]?.[2] as
      ((payload: unknown) => void) | undefined;
    listener.cleanup();
    payloadHandler?.({ eventType: 'UPDATE', new: { id: 'row-1' } });
    expect(syncController.pause).not.toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();
  });
});
