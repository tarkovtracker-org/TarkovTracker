type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;
type IdleTask = {
  task: () => void | Promise<void>;
  timeout: number;
  minTime: number;
  resolve: () => void;
  reject: (error: unknown) => void;
  expiresAt: number;
};
const idleQueue: IdleTask[] = [];
let idleRunnerActive = false;
const getIdleScheduler = () => {
  if (typeof window === 'undefined') return null;
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback.bind(window) as (
      cb: IdleCallback,
      opts?: { timeout?: number }
    ) => number;
  }
  return (cb: IdleCallback, opts?: { timeout?: number }) =>
    window.setTimeout(
      () =>
        cb({
          didTimeout: true,
          timeRemaining: () => 0,
        }),
      opts?.timeout ?? 0
    );
};
const getIdleNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};
const runIdleQueue = () => {
  if (idleRunnerActive) return;
  idleRunnerActive = true;
  const scheduler = getIdleScheduler();
  if (!scheduler) {
    while (idleQueue.length) {
      const next = idleQueue.shift()!;
      Promise.resolve(next.task()).then(next.resolve).catch(next.reject);
    }
    idleRunnerActive = false;
    return;
  }
  const scheduleNext = () => {
    if (!idleQueue.length) {
      idleRunnerActive = false;
      return;
    }
    const next = idleQueue[0]!;
    const remainingTimeout = Math.max(0, next.expiresAt - getIdleNow());
    scheduler(
      (deadline) => {
        if (!idleQueue.length) {
          idleRunnerActive = false;
          return;
        }
        const current = idleQueue[0]!;
        const now = getIdleNow();
        const timedOut = deadline.didTimeout || now >= current.expiresAt;
        const hasTime = deadline.timeRemaining() >= current.minTime;
        if (!timedOut && !hasTime) {
          scheduleNext();
          return;
        }
        const next = idleQueue.shift()!;
        Promise.resolve(next.task())
          .then(next.resolve)
          .catch(next.reject)
          .finally(() => {
            scheduleNext();
          });
      },
      { timeout: remainingTimeout }
    );
  };
  scheduleNext();
};
export const queueIdleTask = (
  task: () => void | Promise<void>,
  options: { timeout?: number; minTime?: number; priority?: 'normal' | 'high' } = {}
) => {
  const { timeout = 2000, minTime = 12, priority = 'normal' } = options;
  return new Promise<void>((resolve, reject) => {
    const now = getIdleNow();
    const entry: IdleTask = { task, timeout, minTime, resolve, reject, expiresAt: now + timeout };
    if (priority === 'high') {
      idleQueue.unshift(entry);
    } else {
      idleQueue.push(entry);
    }
    runIdleQueue();
  });
};
