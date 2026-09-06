import { logger } from '@/utils/logger';
import { isRealtimeSuspended } from '@/utils/realtimeVisibility';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
/**
 * The channel type `SupabaseClient.channel()` actually returns.
 *
 * It is structurally distinct from the re-exported `RealtimeChannel` type, so
 * deriving it from the client keeps call sites assignable without a cast.
 */
export type SupabaseRealtimeChannel = ReturnType<SupabaseClient['channel']>;
/**
 * A Realtime channel paired with the client that created it.
 *
 * `$supabase.client` starts as an offline stub and is replaced once background
 * initialization completes. Resolving the client lazily at teardown time can
 * therefore hand the channel to a client that never owned it, so the owner is
 * captured when the channel is created.
 */
export type OwnedRealtimeChannel = {
  channel: SupabaseRealtimeChannel;
  client: Pick<SupabaseClient, 'removeChannel'>;
  /** Topic the channel was created with; leaves are tracked per topic. */
  topic: string;
};
export const REALTIME_SUBSCRIPTION_TIMEOUT_MS = 15_000;
/**
 * Tracks in-flight channel leaves so a topic is not rejoined before it is free.
 *
 * `RealtimeClient` keys channels by topic, so only a rejoin of a leaving topic
 * has to wait; joining a different topic proceeds immediately. Leaves are tracked
 * per topic because several can be in flight at once. A failed leave keeps its
 * entry so later attempts still decline that topic instead of binding to one that
 * is still occupied.
 */
export const createChannelReleaseLatch = () => {
  const pending = new Map<string, Promise<boolean>>();
  return {
    hold: (owned: OwnedRealtimeChannel, removal: Promise<boolean>): void => {
      const { topic } = owned;
      pending.set(topic, removal);
      // Drop the entry once a clean leave settles, so topics that are never
      // rejoined do not accumulate. Failed leaves are retained on purpose.
      void removal.then(
        (leftCleanly) => {
          if (leftCleanly && pending.get(topic) === removal) pending.delete(topic);
        },
        () => undefined
      );
    },
    /** Synchronous check so callers can skip an await when nothing is leaving. */
    isHolding: (topic: string): boolean => pending.has(topic),
    /** @returns `true` when `topic` is free to join. */
    release: async (topic: string): Promise<boolean> => {
      const inFlight = pending.get(topic);
      if (!inFlight) return true;
      const leftCleanly = await inFlight;
      if (leftCleanly && pending.get(topic) === inFlight) pending.delete(topic);
      return leftCleanly;
    },
  };
};
/** The offline stub resolves with no status; treat that as a clean leave. */
const isCleanLeave = (status: string | undefined): boolean =>
  status === undefined || status === 'ok';
/**
 * Leaves a Realtime channel and waits for the leave to complete.
 *
 * Awaiting is required for correctness when the same topic may be rejoined:
 * `RealtimeClient.channel()` returns the existing channel until its `phx_leave`
 * round-trip settles, and `RealtimeChannel.subscribe()` only rejoins a channel
 * that is already closed. Rejoining too early yields a channel that never joins
 * and never reports an error.
 *
 * @param owned - Channel and its creating client, or `null` for a no-op.
 * @param label - Log prefix identifying the caller.
 * @returns `false` when the topic may still be occupied, so callers can avoid
 *   treating a rejoin as successful. `removeChannel` only tears the channel down
 *   on an `ok` leave, and an `error` reply never closes it.
 */
export const removeOwnedChannel = async (
  owned: OwnedRealtimeChannel | null,
  label: string
): Promise<boolean> => {
  if (!owned) return true;
  try {
    const status = await owned.client.removeChannel(owned.channel as unknown as RealtimeChannel);
    if (isCleanLeave(status)) return true;
    logger.warn(`[${label}] Realtime channel did not leave cleanly:`, { status });
    return false;
  } catch (error) {
    logger.warn(`[${label}] Failed to remove realtime channel:`, error);
    return false;
  }
};
/** Statuses that do not indicate a subscription problem. */
const HEALTHY_CHANNEL_STATUSES = new Set(['SUBSCRIBED', 'CLOSED']);
const describeChannelError = (error: Error | undefined): string | null => error?.message ?? null;
/**
 * Logs any subscribe status that is neither a successful join nor the expected
 * terminal status while leaving.
 *
 * Channels that silently fail to join are otherwise invisible: Realtime keeps
 * rejoining forever without surfacing the reason.
 *
 * @returns `true` when the status indicates a failure.
 */
// fallow-ignore-next-line complexity -- initial joins treat CLOSED as an explicit failure
export const logChannelSubscribeFailure = (
  label: string,
  status: string,
  error: Error | undefined,
  context: Record<string, unknown>,
  options?: { treatClosedAsFailure?: boolean }
): boolean => {
  if (
    HEALTHY_CHANNEL_STATUSES.has(status) &&
    !(status === 'CLOSED' && options?.treatClosedAsFailure)
  ) {
    return false;
  }
  logger.warn(`[${label}] Realtime channel is not subscribed:`, {
    ...context,
    error: describeChannelError(error),
    status,
  });
  return true;
};
/**
 * Starts a channel subscription and waits for the initial join acknowledgement.
 *
 * `RealtimeChannel.subscribe()` is intentionally callback-based: returning from
 * the method only starts the join. Waiting for `SUBSCRIBED` prevents callers from
 * treating a channel as ready while the socket is still joining. A timeout turns
 * a stalled socket into an explicit failure instead of leaving initialization
 * pending forever.
 *
 * @param channel - The channel to subscribe.
 * @param label - Log prefix identifying the caller.
 * @param context - Diagnostic fields included in status logs.
 * @param timeoutMs - Maximum time to wait for the initial join acknowledgement.
 * @returns A promise that resolves after `SUBSCRIBED` or rejects on failure.
 */
export const subscribeAndWaitForRealtimeChannel = (
  channel: SupabaseRealtimeChannel,
  label: string,
  context: Record<string, unknown>,
  timeoutMs = REALTIME_SUBSCRIPTION_TIMEOUT_MS,
  onRejoined?: () => void
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    let settled = false;
    let joined = false;
    let needsRefresh = false;
    const suspended = () => channel.socket && isRealtimeSuspended(channel.socket);
    const timeoutJoin = () => {
      if (suspended()) {
        timeout = setTimeout(timeoutJoin, timeoutMs);
        return;
      }
      const error = new Error(`Realtime subscription timed out after ${timeoutMs}ms for ${label}`);
      logger.warn(`[${label}] Realtime subscription timed out:`, {
        ...context,
        timeoutMs,
      });
      settle(error);
    };
    let timeout = setTimeout(timeoutJoin, timeoutMs);
    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    try {
      // fallow-ignore-next-line complexity -- tested join/rejoin state machine; inferred coverage misses the SDK callback
      channel.subscribe((status: string, error?: Error) => {
        logger.debug(`[${label}] Realtime subscription status: ${status}`);
        if (status === 'SUBSCRIBED') {
          if (joined || needsRefresh) onRejoined?.();
          needsRefresh = false;
          joined = true;
          settle();
          return;
        }
        needsRefresh = true;
        if (suspended() && status !== 'CLOSED') return;
        if (
          logChannelSubscribeFailure(label, status, error, context, {
            treatClosedAsFailure: true,
          })
        ) {
          settle(error ?? new Error(`Realtime subscription failed with status ${status}`));
        }
      });
    } catch (error) {
      settle(error instanceof Error ? error : new Error(String(error)));
    }
  });
