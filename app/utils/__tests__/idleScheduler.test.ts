import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queueIdleTask, resetIdleQueue } from '@/utils/idleScheduler';
describe('idleScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetIdleQueue();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetIdleQueue();
  });
  it('executes a queued task', async () => {
    const fn = vi.fn();
    const promise = queueIdleTask(fn);
    await vi.runAllTimersAsync();
    await promise;
    expect(fn).toHaveBeenCalledOnce();
  });
  it('executes tasks in FIFO order by default', async () => {
    const order: number[] = [];
    const p1 = queueIdleTask(() => {
      order.push(1);
    });
    const p2 = queueIdleTask(() => {
      order.push(2);
    });
    const p3 = queueIdleTask(() => {
      order.push(3);
    });
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });
  it('executes high-priority tasks before normal tasks', async () => {
    const order: number[] = [];
    const p1 = queueIdleTask(() => {
      order.push(1);
    });
    const p2 = queueIdleTask(
      () => {
        order.push(2);
      },
      { priority: 'high' }
    );
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);
    expect(order).toEqual([2, 1]);
  });
  it('resolves the returned promise on task completion', async () => {
    let resolved = false;
    const promise = queueIdleTask(() => {});
    promise.then(() => {
      resolved = true;
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(resolved).toBe(true);
  });
  it('rejects the returned promise when task throws synchronously', async () => {
    const error = new Error('sync fail');
    const promise = queueIdleTask(() => {
      throw error;
    });
    const assertion = expect(promise).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
  });
  it('rejects the returned promise when task returns a rejected promise', async () => {
    const error = new Error('async fail');
    const promise = queueIdleTask(() => Promise.reject(error));
    const assertion = expect(promise).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
  });
  it('handles async tasks', async () => {
    let completed = false;
    const promise = queueIdleTask(async () => {
      await Promise.resolve();
      completed = true;
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(completed).toBe(true);
  });
  it('resetIdleQueue clears pending tasks', async () => {
    const fn = vi.fn();
    queueIdleTask(fn).catch(() => {});
    resetIdleQueue();
    await vi.runAllTimersAsync();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).not.toHaveBeenCalled();
  });
});
