// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from 'pinia';
const { channel, client, loggerMock, removeChannel } = vi.hoisted(() => {
  const realtimeChannel = {
    // Tests read the handler back from `on.mock.calls`, so keep the parameters
    // typed rather than collapsing them away.
    on: vi.fn(
      (_event: string, _config: Record<string, unknown>, _handler: (payload: unknown) => void) =>
        realtimeChannel
    ),
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
  it('waits for the previous channel to leave before rejoining the same topic', async () => {
    const { useSupabaseListener } = await import('@/composables/supabase/useSupabaseListener');
    let resolveRemoval: ((status: string) => void) | undefined;
    removeChannel.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveRemoval = resolve;
        })
    );
    const filter = ref<string | undefined>('id=eq.row-1');
    const listener = useSupabaseListener({
      filter,
      patchStore: false,
      store: createStore(),
      table: 'test_table',
    });
    expect(client.channel).toHaveBeenCalledTimes(1);
    // Same topic again: the rejoin must not happen while the leave is in flight.
    filter.value = undefined;
    await nextTick();
    filter.value = 'id=eq.row-1';
    await nextTick();
    expect(client.channel).toHaveBeenCalledTimes(1);
    resolveRemoval?.('ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(client.channel).toHaveBeenCalledTimes(2);
    listener.cleanup();
  });
  it('logs a channel error instead of failing silently', async () => {
    const { useSupabaseListener } = await import('@/composables/supabase/useSupabaseListener');
    channel.subscribe.mockImplementationOnce((callback: (s: string, e?: Error) => void) => {
      callback('CHANNEL_ERROR', new Error('nope'));
      return channel;
    });
    const listener = useSupabaseListener({
      filter: 'id=eq.row-1',
      patchStore: false,
      store: createStore(),
      table: 'test_table',
    });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[listener-test] Realtime channel is not subscribed:',
      expect.objectContaining({ error: 'nope', status: 'CHANNEL_ERROR' })
    );
    listener.cleanup();
  });
});
