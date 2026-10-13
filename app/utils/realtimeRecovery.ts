import { logger } from '@/utils/logger';
const JOIN_WATCHDOG_MS = 15_000;
const FAILED_STATUSES = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);
type RealtimeRecoveryOptions = {
  refresh: () => Promise<void>;
  reconnect: () => Promise<void>;
  isCurrent: () => boolean;
  isSuspended: () => boolean;
  onDegraded: (degraded: boolean) => void;
};
/** Reconcile REST snapshots while the SDK retains ownership of channel retries. */
export const startRealtimeRecovery = (options: RealtimeRecoveryOptions) => {
  const page = typeof document === 'undefined' ? undefined : document;
  const browser = typeof window === 'undefined' ? undefined : window;
  let stopped = false;
  let joined = false;
  let degraded = false;
  let needsSnapshot = true;
  let joinVersion = 0;
  let inFlight = false;
  let queued = false;
  let queuedReconnect = false;
  let needsReconnect = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  const isActive = () => !stopped && options.isCurrent();
  const isForeground = () =>
    page?.visibilityState !== 'hidden' && browser?.navigator.onLine !== false;
  const canRefresh = () => isActive() && isForeground() && !options.isSuspended();
  const clearPoll = () => {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  };
  const clearWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = undefined;
  };
  const markDegraded = (reason: unknown) => {
    if (degraded) return;
    degraded = true;
    options.onDegraded(true);
    logger.warn('[Realtime] Subscription degraded; using background refresh', reason);
  };
  const needsPolling = () => degraded || !joined || needsSnapshot;
  const schedulePoll = () => {
    if (pollTimer !== undefined || !canRefresh() || !needsPolling()) return;
    pollTimer = setTimeout(
      () => {
        pollTimer = undefined;
        requestRefresh(true);
      },
      30_000 + Math.random() * 15_000
    );
  };
  const snapshotCoversJoin = (version: number) => version === joinVersion && !queued && joined;
  const acceptSnapshot = (version: number) => {
    // An earlier poll cannot cover a join that happened after the read began.
    if (!snapshotCoversJoin(version)) return;
    needsSnapshot = false;
    if (!degraded) return;
    degraded = false;
    options.onDegraded(false);
  };
  const finishRefresh = () => {
    inFlight = false;
    if (!canRefresh()) return;
    if (queued) {
      requestRefresh(queuedReconnect);
      return;
    }
    schedulePoll();
  };
  const readSnapshot = async () => {
    const version = joinVersion;
    queued = false;
    queuedReconnect = false;
    try {
      await options.refresh();
      if (canRefresh()) acceptSnapshot(version);
    } catch (error) {
      if (canRefresh()) markDegraded(error);
    }
  };
  const reconnectFailed = (error: unknown) => {
    if (!isActive()) return;
    needsReconnect = !joined;
    if (canRefresh()) markDegraded(error);
  };
  const watchFreshJoin = () => {
    if (needsReconnect) return;
    armWatchdog();
  };
  const reconnectChannel = async () => {
    if (!needsReconnect) return;
    // A synchronous CLOSED during replacement must be able to re-arm this flag.
    needsReconnect = false;
    try {
      await options.reconnect();
    } catch (error) {
      reconnectFailed(error);
      return;
    }
    watchFreshJoin();
  };
  const refreshSnapshot = async (allowReconnect: boolean) => {
    inFlight = true;
    queued = false;
    queuedReconnect = false;
    try {
      if (allowReconnect) await reconnectChannel();
      if (canRefresh()) await readSnapshot();
    } finally {
      finishRefresh();
    }
  };
  const requestRefresh = (allowReconnect = false) => {
    if (!canRefresh()) return;
    clearPoll();
    if (inFlight) {
      queued = true;
      queuedReconnect ||= allowReconnect;
      return;
    }
    void refreshSnapshot(allowReconnect);
  };
  const joinTimedOut = () => {
    watchdog = undefined;
    if (!canRefresh() || joined) return;
    markDegraded('No subscription acknowledgement within 15 seconds');
    requestRefresh();
  };
  const armWatchdog = () => {
    if (watchdog !== undefined || joined || !canRefresh()) return;
    watchdog = setTimeout(joinTimedOut, JOIN_WATCHDOG_MS);
  };
  const subscriptionFailed = (status: string, error?: Error) => {
    joined = false;
    if (status === 'CLOSED') needsReconnect = true;
    joinVersion += 1;
    clearWatchdog();
    if (!canRefresh()) return;
    markDegraded(error ?? status);
    schedulePoll();
  };
  const onStatus = (status: string, error?: Error) => {
    if (!isActive()) return;
    if (FAILED_STATUSES.has(status)) {
      subscriptionFailed(status, error);
      return;
    }
    if (status !== 'SUBSCRIBED') return;
    joined = true;
    needsReconnect = false;
    joinVersion += 1;
    needsSnapshot = true;
    clearWatchdog();
    requestRefresh();
  };
  const resume = () => {
    resumeTimer = undefined;
    if (!isActive() || !isForeground()) {
      clearPoll();
      clearWatchdog();
      return;
    }
    // Visibility transport resume may still be waiting for its disconnect.
    if (options.isSuspended()) {
      resumeTimer = setTimeout(resume, 1_000);
      return;
    }
    armWatchdog();
    requestRefresh();
  };
  const queueResume = () => {
    if (!isActive()) return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(resume, 0);
  };
  const stop = () => {
    stopped = true;
    queued = false;
    clearPoll();
    clearWatchdog();
    clearTimeout(resumeTimer);
    page?.removeEventListener('visibilitychange', queueResume);
    browser?.removeEventListener('online', queueResume);
    browser?.removeEventListener('offline', queueResume);
  };
  page?.addEventListener('visibilitychange', queueResume);
  browser?.addEventListener('online', queueResume);
  browser?.addEventListener('offline', queueResume);
  armWatchdog();
  return { onStatus, stop };
};
