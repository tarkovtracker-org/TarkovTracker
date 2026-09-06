import { logger } from '@/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
export const REALTIME_BACKGROUND_GRACE_MS = 60_000;
type RealtimeTransport = Pick<SupabaseClient['realtime'], 'connect' | 'disconnect' | 'getChannels'>;
const suspendedTransports = new WeakSet<RealtimeTransport>();
export const isRealtimeSuspended = (transport: RealtimeTransport): boolean =>
  suspendedTransports.has(transport);
/** Keep channel ownership intact while closing the shared socket in background tabs. */
export const installRealtimeVisibility = (
  transport: RealtimeTransport,
  page: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document
): (() => void) => {
  const originalConnect = transport.connect;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let leaving: Promise<unknown> | null = null;
  let disposed = false;
  let generation = 0;
  const connect = () => {
    if (disposed || suspendedTransports.has(transport) || leaving) return;
    originalConnect.call(transport);
  };
  transport.connect = connect;
  const suspend = () => {
    timer = undefined;
    if (disposed || page.visibilityState !== 'hidden') return;
    generation += 1;
    suspendedTransports.add(transport);
    const pending = Promise.resolve().then(() => transport.disconnect());
    leaving = pending;
    void pending
      .catch((error: unknown) => logger.warn('[Realtime] Background disconnect failed', error))
      .finally(() => {
        if (leaving === pending) leaving = null;
      });
  };
  const visibilityChanged = () => {
    clearTimeout(timer);
    if (page.visibilityState === 'hidden') {
      if (!suspendedTransports.has(transport))
        timer = setTimeout(suspend, REALTIME_BACKGROUND_GRACE_MS);
      return;
    }
    const version = ++generation;
    if (!suspendedTransports.has(transport)) return;
    void Promise.resolve(leaving)
      .catch(() => undefined)
      .then(() => {
        if (disposed || version !== generation || page.visibilityState === 'hidden') return;
        leaving = null;
        suspendedTransports.delete(transport);
        if (transport.getChannels().length > 0) connect();
      });
  };
  page.addEventListener('visibilitychange', visibilityChanged);
  visibilityChanged();
  return () => {
    disposed = true;
    generation += 1;
    clearTimeout(timer);
    page.removeEventListener('visibilitychange', visibilityChanged);
    suspendedTransports.delete(transport);
    transport.connect = originalConnect;
  };
};
