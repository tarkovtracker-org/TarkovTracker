import { logger } from '@/utils/logger';
import type { SupabaseRealtimeChannel } from '@/utils/realtimeChannel';
import type { REALTIME_SUBSCRIBE_STATES, SupabaseClient } from '@supabase/supabase-js';
const REALTIME_BACKGROUND_GRACE_MS = 60_000;
const REALTIME_RESUME_RETRY_MS = 1_000;
type RealtimeTransport = Pick<SupabaseClient['realtime'], 'connect' | 'disconnect' | 'getChannels'>;
type RealtimeSession = { accessToken: string; isCurrent: () => boolean };
type SubscribeCallback = (status: `${REALTIME_SUBSCRIBE_STATES}`, error?: Error) => void;
const suspendedTransports = new WeakMap<
  RealtimeTransport,
  WeakMap<SupabaseRealtimeChannel, SubscribeCallback | undefined>
>();
export const isRealtimeSuspended = (transport: RealtimeTransport): boolean =>
  suspendedTransports.has(toRaw(transport));
/** Delay new joins until resume can give Phoenix an authenticated join payload. */
export const subscribeRealtimeChannel = (
  transport: RealtimeTransport,
  channel: SupabaseRealtimeChannel,
  callback?: SubscribeCallback
): boolean => {
  // Consumers can get the SDK client through Nuxt's reactive injection.
  const pending = suspendedTransports.get(toRaw(transport));
  if (pending) {
    pending.set(toRaw(channel), callback);
    transport.connect();
    return false;
  }
  channel.subscribe(callback);
  return true;
};
const subscribeDeferredChannel = (
  channel: SupabaseRealtimeChannel,
  callback?: SubscribeCallback
) => {
  try {
    channel.subscribe(callback);
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    logger.warn('[Realtime] Deferred channel could not subscribe', error);
    callback?.('CLOSED', error);
  }
};
/** Keep channel ownership intact while closing the shared socket in background tabs. */
export const installRealtimeVisibility = (
  transport: RealtimeTransport & Pick<SupabaseClient['realtime'], 'setAuth'>,
  readSession: () => Promise<RealtimeSession | null>,
  page: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document
): (() => void) => {
  const originalConnect = transport.connect;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let leaving: Promise<unknown> | null = null;
  let disposed = false;
  let generation = 0;
  let resuming: { version: number; retry: boolean } | undefined;
  // A newer visibility transition, a hidden tab, or teardown invalidates a
  // resume that was queued behind an in-flight disconnect.
  const resumeIsStale = (version: number): boolean =>
    disposed || version !== generation || page.visibilityState === 'hidden';
  const reconnect = () => {
    const pending = suspendedTransports.get(transport);
    const channels = transport.getChannels();
    if (channels.length) originalConnect.call(transport);
    suspendedTransports.delete(transport);
    for (const channel of channels) {
      if (pending?.has(channel)) subscribeDeferredChannel(channel, pending.get(channel));
    }
  };
  const authenticateAndReconnect = async (version: number) => {
    const session = await readSession();
    if (!session?.isCurrent() || resumeIsStale(version)) return;
    await transport.setAuth(session.accessToken);
    if (session.isCurrent() && !resumeIsStale(version)) reconnect();
  };
  const resume = async (version: number) => {
    await leaving?.catch(() => undefined);
    if (resumeIsStale(version)) return;
    // The SDK opens the socket while its own token lookup runs. A channel can
    // rejoin with the project key before that lookup returns a user token.
    if (transport.getChannels().length > 0) await authenticateAndReconnect(version);
    else reconnect();
  };
  const requestResume = (allowRetry = true) => {
    if (resumeIsStale(generation)) return;
    if (resuming?.version === generation) {
      resuming.retry = true;
      return;
    }
    clearTimeout(retryTimer);
    const attempt = { version: generation, retry: false };
    resuming = attempt;
    void resume(attempt.version)
      .catch((error: unknown) => {
        logger.warn('[Realtime] Could not resume background transport', error);
        if (allowRetry && !resumeIsStale(attempt.version)) {
          retryTimer = setTimeout(() => requestResume(false), REALTIME_RESUME_RETRY_MS);
        }
      })
      .finally(() => {
        if (resuming !== attempt) return;
        resuming = undefined;
        if (attempt.retry && suspendedTransports.has(transport)) requestResume();
      });
  };
  const connect = () => {
    if (suspendedTransports.has(transport)) {
      requestResume();
      return;
    }
    if (!disposed) originalConnect.call(transport);
  };
  transport.connect = connect;
  const suspend = () => {
    timer = undefined;
    if (disposed || page.visibilityState !== 'hidden') return;
    generation += 1;
    suspendedTransports.set(transport, new WeakMap());
    const pending = Promise.resolve().then(() => transport.disconnect());
    leaving = pending;
    void pending
      .catch((error: unknown) => logger.warn('[Realtime] Background disconnect failed', error))
      .finally(() => {
        if (leaving === pending) leaving = null;
      });
  };
  const resumeIfSuspended = () => {
    if (suspendedTransports.has(transport)) requestResume();
  };
  const visibilityChanged = () => {
    clearTimeout(timer);
    if (page.visibilityState === 'hidden') {
      generation += 1;
      clearTimeout(retryTimer);
      if (!suspendedTransports.has(transport))
        timer = setTimeout(suspend, REALTIME_BACKGROUND_GRACE_MS);
      return;
    }
    resumeIfSuspended();
  };
  page.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('online', resumeIfSuspended);
  visibilityChanged();
  return () => {
    disposed = true;
    generation += 1;
    clearTimeout(timer);
    clearTimeout(retryTimer);
    page.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('online', resumeIfSuspended);
    suspendedTransports.delete(transport);
    transport.connect = originalConnect;
  };
};
