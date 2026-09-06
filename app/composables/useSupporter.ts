import { isSupporterActivityActive } from '@/features/supporter/supporterStatus';
import { logger } from '@/utils/logger';
import {
  createChannelReleaseLatch,
  logChannelSubscribeFailure,
  removeOwnedChannel,
  type OwnedRealtimeChannel,
} from '@/utils/realtimeChannel';
import { refreshSupabaseSession } from '@/utils/supabaseAuth';
export interface SupporterStatus {
  tier: 'supporter' | 'scav' | 'timmy' | 'chad';
  status: 'active' | 'past_due' | 'expired' | 'cancelled';
  type: 'one_time' | 'subscription';
  hasEverSupported: boolean;
  expiresAt: string | null;
  startedAt: string;
}
// Module-scoped reactive state: useSupporter() is a singleton-style composable
// (similar to Pinia stores) so all components observe the same supporter status
// without re-fetching. Per-call refs would defeat the purpose of the realtime channel.
const supporterState = ref<SupporterStatus | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let channel: OwnedRealtimeChannel | null = null;
const channelRelease = createChannelReleaseLatch();
let channelUserId: string | null = null;
let statusRequestVersion = 0;
let subscriptionRequestVersion = 0;
export function useSupporter() {
  const { $supabase } = useNuxtApp();
  const isCurrentStatusRequest = (userId: string, requestVersion: number) => {
    if (requestVersion !== statusRequestVersion) return false;
    if ($supabase.user?.loggedIn === false) return false;
    const currentUserId = $supabase.user?.id ?? null;
    return !currentUserId || currentUserId === userId;
  };
  const isSupporter = computed(() => supporterState.value?.hasEverSupported === true);
  const isActiveSubscriber = computed(
    () =>
      supporterState.value?.type === 'subscription' &&
      isSupporterActivityActive(supporterState.value)
  );
  const activeTier = computed(() => {
    if (!supporterState.value) return null;
    if (isSupporterActivityActive(supporterState.value)) {
      return supporterState.value.tier;
    }
    if (supporterState.value.hasEverSupported) return 'supporter';
    return null;
  });
  const badgeLabel = computed(() => {
    const tier = activeTier.value;
    if (!tier) return null;
    if (tier === 'supporter') return 'Supporter';
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  });
  async function fetchStatus(userId: string) {
    if (!$supabase || !userId) return;
    const requestVersion = ++statusRequestVersion;
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await $supabase.client
        .from('supporters')
        .select('tier, status, type, has_ever_supported, expires_at, started_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (err) {
        logger.error('Failed to fetch supporter status', { userId, err });
        if (!isCurrentStatusRequest(userId, requestVersion)) return;
        error.value = err.message;
        return;
      }
      if (!isCurrentStatusRequest(userId, requestVersion)) return;
      if (data) {
        supporterState.value = {
          tier: data.tier,
          status: data.status,
          type: data.type,
          hasEverSupported: data.has_ever_supported,
          expiresAt: data.expires_at,
          startedAt: data.started_at,
        };
      } else {
        supporterState.value = null;
      }
    } catch (e: unknown) {
      logger.error('fetchStatus threw', { userId, err: e });
      if (!isCurrentStatusRequest(userId, requestVersion)) return;
      error.value = e instanceof Error ? e.message : 'Failed to load supporter status';
      supporterState.value = null;
    } finally {
      if (isCurrentStatusRequest(userId, requestVersion)) {
        loading.value = false;
      }
    }
  }
  async function subscribe(userId: string) {
    if (!$supabase || !userId) return;
    if (channel && channelUserId === userId) return;
    const requestVersion = ++subscriptionRequestVersion;
    const previousChannel = channel;
    channel = null;
    channelUserId = null;
    if (previousChannel) {
      channelRelease.hold(previousChannel, removeOwnedChannel(previousChannel, 'Supporter'));
    }
    const topic = `supporters:${userId}`;
    // Resubscribing to the same user reuses the topic, so its leave has to finish
    // first; an unclean leave declines the topic entirely.
    if (!(await channelRelease.release(topic))) return;
    if (requestVersion !== subscriptionRequestVersion) return;
    if ($supabase.user?.loggedIn === false || $supabase.user?.id !== userId) return;
    if (channel || channelUserId) return;
    const client = $supabase.client;
    const nextChannel = client
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'supporters',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchStatus(userId).catch((err) => {
            logger.error('Realtime supporter status refresh failed', { userId, err });
          });
        }
      )
      .subscribe((status, err) => {
        logChannelSubscribeFailure('Supporter', status, err, { userId });
      });
    channel = { channel: nextChannel, client, topic };
    channelUserId = userId;
  }
  function unsubscribe() {
    subscriptionRequestVersion += 1;
    const channelToRemove = channel;
    channel = null;
    channelUserId = null;
    if (channelToRemove) {
      channelRelease.hold(channelToRemove, removeOwnedChannel(channelToRemove, 'Supporter'));
    }
  }
  function reset() {
    statusRequestVersion += 1;
    unsubscribe();
    supporterState.value = null;
    error.value = null;
    loading.value = false;
  }
  async function createCheckout(params: {
    mode: 'payment' | 'subscription';
    tier?: string;
    interval?: string;
    amount?: number;
  }): Promise<string | null> {
    return postWithAuth<{ url: string }>('/api/stripe/checkout', params).then(
      (r) => r?.url ?? null
    );
  }
  async function openBillingPortal(returnUrl?: string): Promise<string | null> {
    return postWithAuth<{ url: string }>('/api/stripe/portal', returnUrl ? { returnUrl } : {}).then(
      (r) => r?.url ?? null
    );
  }
  async function postWithAuth<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
    if (!$supabase) {
      error.value = 'Supabase client not available';
      return null;
    }
    try {
      // Stripe endpoints require authentication: the server reads the user id
      // from the session, not the request body, so we must forward the
      // bearer token. Refresh once if the cached session is missing/stale.
      let token: string | null = null;
      const sessionResp = await $supabase.client.auth.getSession();
      token = sessionResp.data.session?.access_token ?? null;
      if (!token) {
        // A failed refresh means no usable token; fall through to the
        // sign-in message rather than surfacing a raw Supabase error.
        const refreshed = await refreshSupabaseSession($supabase.client).catch(() => null);
        token = refreshed?.access_token ?? null;
      }
      if (!token) {
        const message = 'You must be signed in to support TarkovTracker.';
        error.value = message;
        return null;
      }
      const result = await $fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      return result as T;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Request failed';
      error.value = message;
      logger.error('Supporter request failed', { path, error: e });
      return null;
    }
  }
  return {
    supporter: supporterState,
    loading,
    error,
    isSupporter,
    isActiveSubscriber,
    activeTier,
    badgeLabel,
    fetchStatus,
    subscribe,
    unsubscribe,
    reset,
    createCheckout,
    openBillingPortal,
  };
}
