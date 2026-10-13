import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/utils/logger';
import { startRealtimeRecovery } from '@/utils/realtimeRecovery';
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn() } }));
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
describe('realtime snapshot recovery', () => {
  let recovery: ReturnType<typeof startRealtimeRecovery>;
  const setup = () => {
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reconnect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const onDegraded = vi.fn();
    const state = { current: true, suspended: false };
    recovery = startRealtimeRecovery({
      refresh,
      reconnect,
      onDegraded,
      isCurrent: () => state.current,
      isSuspended: () => state.suspended,
    });
    return { refresh, reconnect, onDegraded, state };
  };
  const visibility = (value: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const online = (value: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });
  afterEach(() => {
    recovery?.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('reconciles the first join and stops polling after a healthy snapshot', async () => {
    const { refresh, onDegraded } = setup();
    expect(refresh).not.toHaveBeenCalled();
    recovery.onStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledOnce();
    expect(onDegraded).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
    'polls through %s and warns once until a joined snapshot succeeds',
    async (status) => {
      const { refresh, onDegraded } = setup();
      recovery.onStatus(status, new Error('socket unavailable'));
      recovery.onStatus(status);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(onDegraded.mock.calls).toEqual([[true]]);
      expect(logger.warn).toHaveBeenCalledOnce();
      recovery.onStatus('SUBSCRIBED');
      await vi.advanceTimersByTimeAsync(0);
      expect(onDegraded.mock.calls).toEqual([[true], [false]]);
      recovery.onStatus(status);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    }
  );
  it('detects a silent join without stopping SDK recovery', async () => {
    const { refresh, onDegraded } = setup();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(onDegraded).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onDegraded).toHaveBeenCalledWith(true);
    expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onDegraded).not.toHaveBeenCalledWith(false);
    recovery.onStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    expect(onDegraded).toHaveBeenLastCalledWith(false);
  });
  it('retries a failed first-join snapshot while the socket remains joined', async () => {
    const { refresh, onDegraded } = setup();
    refresh.mockRejectedValueOnce(new Error('snapshot unavailable'));
    recovery.onStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    expect(onDegraded.mock.calls).toEqual([[true]]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onDegraded.mock.calls).toEqual([[true], [false]]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('replaces CLOSED on a jittered cycle and watches a silent replacement join', async () => {
    const { refresh, reconnect, onDegraded } = setup();
    recovery.onStatus('CLOSED');
    recovery.onStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(reconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reconnect).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(reconnect).toHaveBeenCalledOnce();
    expect(onDegraded.mock.calls).toEqual([[true]]);
  });
  it.each(['CHANNEL_ERROR', 'TIMED_OUT'])(
    'keeps %s retries with the SDK while polling snapshots',
    async (status) => {
      const { reconnect, refresh } = setup();
      recovery.onStatus(status);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(reconnect).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledTimes(4);
    }
  );
  it('continues REST reads when replacement fails and retries on the next cycle', async () => {
    const { reconnect, refresh, onDegraded } = setup();
    reconnect.mockRejectedValueOnce(new Error('leave failed')).mockImplementationOnce(async () => {
      recovery.onStatus('SUBSCRIBED');
    });
    recovery.onStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reconnect).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(onDegraded.mock.calls).toEqual([[true]]);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(reconnect).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(reconnect).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onDegraded.mock.calls).toEqual([[true], [false]]);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('allows a synchronous CLOSED during replacement to re-arm the next cycle', async () => {
    const { reconnect, refresh } = setup();
    reconnect.mockImplementationOnce(async () => {
      recovery.onStatus('CLOSED');
    });
    recovery.onStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reconnect).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reconnect).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('cancels replacement need when the channel subscribes before the poll cycle', async () => {
    const { reconnect, refresh } = setup();
    recovery.onStatus('CLOSED');
    recovery.onStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reconnect).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('serializes replacement and snapshot reads across visibility and join events', async () => {
    const { reconnect, refresh, onDegraded } = setup();
    const replacing = deferred();
    const snapshot = deferred();
    reconnect.mockReturnValueOnce(replacing.promise);
    refresh.mockReturnValueOnce(snapshot.promise);
    recovery.onStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(30_000);
    visibility('visible');
    recovery.onStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reconnect).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    replacing.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledOnce();
    expect(onDegraded.mock.calls).toEqual([[true]]);
    snapshot.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(onDegraded.mock.calls).toEqual([[true], [false]]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('queues replacement behind an older snapshot when its poll cycle arrives', async () => {
    const { reconnect, refresh } = setup();
    const snapshot = deferred();
    refresh.mockReturnValueOnce(snapshot.promise);
    recovery.onStatus('SUBSCRIBED');
    recovery.onStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reconnect).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
    snapshot.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(reconnect).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it.each(['resolve', 'reject'] as const)(
    'ignores replacement %s after stop and cancels all pending recovery work',
    async (completion) => {
      const { reconnect, refresh, onDegraded } = setup();
      const replacing = deferred();
      reconnect.mockReturnValueOnce(replacing.promise);
      recovery.onStatus('CLOSED');
      await vi.advanceTimersByTimeAsync(30_000);
      recovery.onStatus('SUBSCRIBED');
      recovery.stop();
      replacing[completion](new Error('late reconnect'));
      await vi.advanceTimersByTimeAsync(120_000);
      expect(reconnect).toHaveBeenCalledOnce();
      expect(refresh).not.toHaveBeenCalled();
      expect(onDegraded.mock.calls).toEqual([[true]]);
      expect(logger.warn).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );
  it('keeps foreground resume reads available before the jittered replacement cycle', async () => {
    const { reconnect, refresh } = setup();
    recovery.onStatus('CLOSED');
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(0);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledOnce();
    expect(reconnect).not.toHaveBeenCalled();
  });
  it('ignores replacement completion after the owner has changed', async () => {
    const { reconnect, refresh, onDegraded, state } = setup();
    const replacing = deferred();
    reconnect.mockReturnValueOnce(replacing.promise);
    recovery.onStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(30_000);
    state.current = false;
    recovery.onStatus('SUBSCRIBED');
    replacing.resolve();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(onDegraded.mock.calls).toEqual([[true]]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('requires a fresh postjoin read after an older poll finishes', async () => {
    const { refresh, onDegraded } = setup();
    const oldPoll = deferred();
    const joinedRead = deferred();
    refresh.mockReturnValueOnce(oldPoll.promise).mockReturnValueOnce(joinedRead.promise);
    recovery.onStatus('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(30_000);
    recovery.onStatus('SUBSCRIBED');
    recovery.onStatus('SUBSCRIBED');
    expect(refresh).toHaveBeenCalledOnce();
    oldPoll.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onDegraded.mock.calls).toEqual([[true]]);
    joinedRead.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(onDegraded.mock.calls).toEqual([[true], [false]]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps the outage active when the queued postjoin read fails', async () => {
    const { refresh, onDegraded } = setup();
    const oldPoll = deferred();
    refresh.mockReturnValueOnce(oldPoll.promise).mockRejectedValueOnce(new Error('read failed'));
    recovery.onStatus('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(30_000);
    recovery.onStatus('SUBSCRIBED');
    oldPoll.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(onDegraded.mock.calls).toEqual([[true]]);
    expect(logger.warn).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onDegraded).toHaveBeenLastCalledWith(false);
    expect(refresh).toHaveBeenCalledTimes(3);
  });
  it('does not clear degradation if the socket fails during the read', async () => {
    const { refresh, onDegraded } = setup();
    const pending = deferred();
    refresh.mockReturnValueOnce(pending.promise);
    recovery.onStatus('SUBSCRIBED');
    recovery.onStatus('CLOSED');
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(onDegraded.mock.calls).toEqual([[true]]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onDegraded).not.toHaveBeenCalledWith(false);
  });
  it('does not overlap slow polls or spin microtasks on persistent failures', async () => {
    const { refresh } = setup();
    const pending = deferred();
    refresh.mockReturnValueOnce(pending.promise).mockRejectedValue(new Error('still down'));
    recovery.onStatus('TIMED_OUT');
    await vi.advanceTimersByTimeAsync(300_000);
    expect(refresh).toHaveBeenCalledOnce();
    pending.reject(new Error('slow failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
  it('jitters the poll delay between 30 and 45 seconds', async () => {
    vi.mocked(Math.random).mockReturnValue(0.999);
    const { refresh } = setup();
    recovery.onStatus('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(44_984);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('pauses hidden polling and immediately reconciles when visible', async () => {
    const { refresh, onDegraded } = setup();
    recovery.onStatus('CHANNEL_ERROR');
    visibility('hidden');
    recovery.onStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledOnce();
    expect(onDegraded).not.toHaveBeenCalledWith(false);
    recovery.onStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0);
    expect(onDegraded).toHaveBeenLastCalledWith(false);
  });
  it('silences hidden and suspended disconnects, then waits for transport resume', async () => {
    const { refresh, onDegraded, state } = setup();
    visibility('hidden');
    state.suspended = true;
    recovery.onStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(120_000);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(3_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(onDegraded).not.toHaveBeenCalled();
    state.suspended = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onDegraded).toHaveBeenCalledWith(true);
  });
  it('reconciles a join received while hidden only once the page is visible', async () => {
    const { refresh } = setup();
    visibility('hidden');
    recovery.onStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('pauses offline polling and refreshes on the online event', async () => {
    const { refresh } = setup();
    recovery.onStatus('TIMED_OUT');
    online(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).not.toHaveBeenCalled();
    online(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('does not accept a snapshot completed while hidden', async () => {
    const { refresh, onDegraded } = setup();
    const pending = deferred();
    recovery.onStatus('CHANNEL_ERROR');
    refresh.mockReturnValueOnce(pending.promise);
    recovery.onStatus('SUBSCRIBED');
    visibility('hidden');
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(onDegraded.mock.calls).toEqual([[true]]);
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onDegraded).toHaveBeenLastCalledWith(false);
  });
  it.each(['resolve', 'reject'] as const)(
    'ignores a late %s after logout, queued joins, and stale status callbacks',
    async (completion) => {
      const { refresh, onDegraded } = setup();
      const pending = deferred();
      refresh.mockReturnValueOnce(pending.promise);
      recovery.onStatus('CHANNEL_ERROR');
      recovery.onStatus('SUBSCRIBED');
      recovery.onStatus('SUBSCRIBED');
      recovery.stop();
      pending[completion](new Error('late result'));
      recovery.onStatus('SUBSCRIBED');
      recovery.onStatus('CHANNEL_ERROR');
      visibility('visible');
      online(true);
      await vi.advanceTimersByTimeAsync(300_000);
      expect(refresh).toHaveBeenCalledOnce();
      expect(onDegraded.mock.calls).toEqual([[true]]);
      expect(logger.warn).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );
  it('ignores replaced owners without requiring a status callback to stop timers', async () => {
    const { refresh, onDegraded, state } = setup();
    const pending = deferred();
    refresh.mockReturnValueOnce(pending.promise);
    recovery.onStatus('SUBSCRIBED');
    state.current = false;
    pending.reject(new Error('replaced read'));
    recovery.onStatus('CHANNEL_ERROR');
    online(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledOnce();
    expect(onDegraded).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
