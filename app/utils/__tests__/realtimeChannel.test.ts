// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createChannelReleaseLatch, type OwnedRealtimeChannel } from '@/utils/realtimeChannel';
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
  it('keeps declining a topic whose leave failed', async () => {
    const latch = createChannelReleaseLatch();
    latch.hold(owned('topic-a'), Promise.resolve(false));
    await expect(latch.release('topic-a')).resolves.toBe(false);
    // The entry is retained so a later attempt still declines the topic.
    expect(latch.isHolding('topic-a')).toBe(true);
    await expect(latch.release('topic-a')).resolves.toBe(false);
  });
});
