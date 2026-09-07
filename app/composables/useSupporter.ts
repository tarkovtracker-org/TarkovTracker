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
let statusLoadedForUserId: string | null = null;
let initialRead: {
  userId: string;
  promise: Promise<boolean>;
  resolve: (success: boolean) => void;
} | null = null;
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
  const finishStatusRequest = (userId: string, requestVersion: number) => {
    if (!isCurrentStatusRequest(userId, requestVersion)) return;
    loading.value = false;
    if (initialRead?.userId !== userId) return;
    initialRead.resolve(error.value === null);
    initialRead = null;
  };
  async function fetchStatus(userId: string): Promise<boolean> {
    if (!$supabase || !userId) return false;
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
        if (!isCurrentStatusRequest(userId, requestVersion)) return false;
        error.value = err.message;
        return false;
      }
      if (!isCurrentStatusRequest(userId, requestVersion)) return false;
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
      statusLoadedForUserId = userId;
      return true;
    } catch (e: unknown) {
      logger.error('fetchStatus threw', { userId, err: e });
      if (!isCurrentStatusRequest(userId, requestVersion)) return false;
      error.value = e instanceof Error ? e.message : 'Failed to load supporter status';
      supporterState.value = null;
      return false;
    } finally {
      finishStatusRequest(userId, requestVersion);
    }
  }
  async function subscribe(userId: string): Promise<boolean> {
    if (!$supabase || !userId) return false;
    if (channel && channelUserId === userId) {
      if (statusLoadedForUserId === userId) return true;
      return initialRead?.promise ?? fetchStatus(userId);
    }
    initialRead?.resolve(false);
    initialRead = null;
    statusLoadedForUserId = null;
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
    if (!(await channelRelease.release(topic))) return false;
    if (requestVersion !== subscriptionRequestVersion) return false;
    if ($supabase.user?.loggedIn === false || $supabase.user?.id !== userId) return false;
    if (channel || channelUserId) return false;
    const client = $supabase.client;
    let initialReadStarted = false;
    let resolveInitial!: (success: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      resolveInitial = resolve;
    });
    const pending = { userId, promise, resolve: resolveInitial };
    initialRead = pending;
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
          if (requestVersion !== subscriptionRequestVersion) return;
          fetchStatus(userId).catch((err) => {
            logger.error('Realtime supporter status refresh failed', { userId, err });
          });
        }
      )
      .subscribe((status, err) => {
        if (requestVersion !== subscriptionRequestVersion) return;
        logChannelSubscribeFailure('Supporter', status, err, { userId });
        // Subscribe reports either a join or a failure. Read once even if the initial join fails.
        if (status !== 'SUBSCRIBED' && initialReadStarted) return;
        initialReadStarted = true;
        void fetchStatus(userId);
      });
    channel = { channel: nextChannel, client, topic };
    channelUserId = userId;
    return promise;
  }
  function unsubscribe() {
    subscriptionRequestVersion += 1;
    initialRead?.resolve(false);
    initialRead = null;
    statusLoadedForUserId = null;
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
