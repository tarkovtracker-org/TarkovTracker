// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createChannelReleaseLatch,
  subscribeAndWaitForRealtimeChannel,
  type OwnedRealtimeChannel,
  type SupabaseRealtimeChannel,
} from '@/utils/realtimeChannel';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
const owned = (topic: string) => ({ topic }) as OwnedRealtimeChannel;
const deferred = () => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
describe('createChannelReleaseLatch', () => {
  it('does not wait for a leave on a different topic', async () => {
    const latch = createChannelReleaseLatch();
    const never = deferred();
    latch.hold(owned('topic-a'), never.promise);
    expect(latch.isHolding('topic-b')).toBe(false);
    await expect(latch.release('topic-b')).resolves.toBe(true);
  });
  it('tracks concurrent leaves of different topics independently', async () => {
    const latch = createChannelReleaseLatch();
    const first = deferred();
    const second = deferred();
    latch.hold(owned('topic-a'), first.promise);
    latch.hold(owned('topic-b'), second.promise);
    // Holding a second topic must not discard the first topic's leave.
    expect(latch.isHolding('topic-a')).toBe(true);
    expect(latch.isHolding('topic-b')).toBe(true);
    first.resolve(true);
    await expect(latch.release('topic-a')).resolves.toBe(true);
    expect(latch.isHolding('topic-a')).toBe(false);
    expect(latch.isHolding('topic-b')).toBe(true);
    second.resolve(true);
    await expect(latch.release('topic-b')).resolves.toBe(true);
  });
  it('keeps a newer hold for a topic whose earlier release is still in flight', async () => {
    const latch = createChannelReleaseLatch();
    const first = deferred();
    const second = deferred();
    latch.hold(owned('topic-a'), first.promise);
    const inFlightRelease = latch.release('topic-a');
    // A cleanup can re-hold the same topic while the previous release awaits.
    latch.hold(owned('topic-a'), second.promise);
    first.resolve(true);
    await expect(inFlightRelease).resolves.toBe(true);
    // The stale release must not discard the newer leave.
    expect(latch.isHolding('topic-a')).toBe(true);
    second.resolve(true);
    await expect(latch.release('topic-a')).resolves.toBe(true);
    expect(latch.isHolding('topic-a')).toBe(false);
  });
  it('forgets a clean leave that is never rejoined', async () => {
    const latch = createChannelReleaseLatch();
    latch.hold(owned('topic-a'), Promise.resolve(true));
    await Promise.resolve();
    await Promise.resolve();
    expect(latch.isHolding('topic-a')).toBe(false);
  });
  it('keeps declining a topic whose leave failed', async () => {
    const latch = createChannelReleaseLatch();
    latch.hold(owned('topic-a'), Promise.resolve(false));
    await expect(latch.release('topic-a')).resolves.toBe(false);
    // The entry is retained so a later attempt still declines the topic.
    expect(latch.isHolding('topic-a')).toBe(true);
    await expect(latch.release('topic-a')).resolves.toBe(false);
  });
});
describe('subscribeAndWaitForRealtimeChannel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const createChannel = () => {
    let statusCallback: ((status: string, error?: Error) => void) | undefined;
    const channel = {
      subscribe: vi.fn((callback?: (status: string, error?: Error) => void) => {
        statusCallback = callback;
        return channel;
      }),
    } as unknown as SupabaseRealtimeChannel;
    return { channel, emit: (status: string, error?: Error) => statusCallback?.(status, error) };
  };
  it('resolves only after the initial subscription is acknowledged', async () => {
    const { channel, emit } = createChannel();
    const ready = subscribeAndWaitForRealtimeChannel(channel, 'test', { topic: 'topic-a' }, 1000);
    let settled = false;
    void ready.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    emit('SUBSCRIBED');
    await expect(ready).resolves.toBeUndefined();
    expect(settled).toBe(true);
  });
  it('rejects on an explicit subscription failure', async () => {
    const { channel, emit } = createChannel();
    const error = new Error('private channel denied');
    const ready = subscribeAndWaitForRealtimeChannel(channel, 'test', { topic: 'topic-a' }, 1000);
    emit('CHANNEL_ERROR', error);
    await expect(ready).rejects.toBe(error);
  });
  it('rejects when the initial subscription never reports a status', async () => {
    vi.useFakeTimers();
    const { channel } = createChannel();
    const ready = subscribeAndWaitForRealtimeChannel(channel, 'test', { topic: 'topic-a' }, 10);
    const rejection = expect(ready).rejects.toThrow('Realtime subscription timed out after 10ms');
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
  });
});
