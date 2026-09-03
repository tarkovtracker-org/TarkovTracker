import { logger } from '@/utils/logger';
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
      pending.set(owned.topic, removal);
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
export const logChannelSubscribeFailure = (
  label: string,
  status: string,
  error: Error | undefined,
  context: Record<string, unknown>
): boolean => {
  if (HEALTHY_CHANNEL_STATUSES.has(status)) return false;
  logger.warn(`[${label}] Realtime channel is not subscribed:`, {
    ...context,
    error: describeChannelError(error),
    status,
  });
  return true;
};
