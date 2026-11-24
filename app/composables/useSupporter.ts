import {
  useSupporterActivity,
  useSupporterEntitlement,
  useSupporterClock,
} from '@/composables/useSupporterActivity';
import { logger } from '@/utils/logger';
import {
  createChannelReleaseLatch,
  logChannelSubscribeFailure,
  removeOwnedChannel,
  type OwnedRealtimeChannel,
} from '@/utils/realtimeChannel';
import { subscribeRealtimeChannel } from '@/utils/realtimeVisibility';
import { getOrRefreshSupabaseAccessToken } from '@/utils/supabaseAuth';
import type { SupabaseClient } from '@supabase/supabase-js';
export interface SupporterStatus {
  tier: 'supporter' | 'scav' | 'timmy' | 'chad';
  status: 'active' | 'past_due' | 'expired' | 'cancelled';
  type: 'one_time' | 'subscription';
  hasEverSupported: boolean;
  expiresAt: string | null;
  startedAt: string;
  oneTimeTier?: string | null;
  oneTimeRemainingSeconds?: number | null;
  oneTimeExpiresAt?: string | null;
  stripeSubscriptionId?: string | null;
}
// Module-scoped reactive state: useSupporter() is a singleton-style composable
// (similar to Pinia stores) so all components observe the same supporter status
// without re-fetching. Per-call refs would defeat the purpose of the realtime channel.
const supporterState = ref<SupporterStatus | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const checkoutRequest = shallowRef<AbortController | null>(null);
const checkoutPending = computed(() => checkoutRequest.value !== null);
const CHECKOUT_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
let checkoutAttempt: { scope: string; id: string; expiresAt: number } | null = null;
function getCheckoutAttemptId(scope: string) {
  const now = Date.now();
  if (checkoutAttempt?.scope === scope && checkoutAttempt.expiresAt > now) {
    return checkoutAttempt.id;
  }
  const id = crypto.randomUUID();
  checkoutAttempt = { scope, id, expiresAt: now + CHECKOUT_RETRY_WINDOW_MS };
  return id;
}
function finishCheckout(url: string | null, signal: AbortSignal) {
  if (signal.aborted) return null;
  if (url) checkoutAttempt = null;
  return url;
}
function reportSupporterRequestError(message: string, signal?: AbortSignal) {
  if (!signal?.aborted) error.value = message;
}
let channel: OwnedRealtimeChannel | null = null;
const channelRelease = createChannelReleaseLatch();
let channelUserId: string | null = null;
let statusRequestVersion = 0;
let subscriptionRequestVersion = 0;
const statusLoadedForUserId = ref<string | null>(null);
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
  const now = useSupporterClock();
  const effectiveState = useSupporterEntitlement(supporterState, now);
  const isActiveStatus = useSupporterActivity(effectiveState, now);
  const isSupporter = computed(() => supporterState.value?.hasEverSupported === true);
  const isActiveSubscriber = computed(
    () => effectiveState.value?.type === 'subscription' && isActiveStatus.value
  );
  const billingSubscription = computed(() =>
    supporterState.value?.type === 'subscription' ? supporterState.value : null
  );
  const isSubscribed = computed(
    () =>
      Boolean(billingSubscription.value?.stripeSubscriptionId) &&
      ['active', 'past_due'].includes(billingSubscription.value!.status)
  );
  const activeTier = computed(() => {
    if (!supporterState.value) return null;
    if (isActiveStatus.value) {
      return effectiveState.value!.tier;
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
  const finishStatusRequest = (userId: string, requestVersion: number, success: boolean) => {
    if (!isCurrentStatusRequest(userId, requestVersion)) return;
    loading.value = false;
    if (initialRead?.userId !== userId) return;
    initialRead.resolve(success);
    initialRead = null;
  };
  async function fetchStatus(userId: string): Promise<boolean> {
    if (!$supabase || !userId) return false;
    const requestVersion = ++statusRequestVersion;
    loading.value = true;
    error.value = null;
    let success = false;
    try {
      const { data, error: err } = await $supabase.client
        // Keep billing details raw; effective access is projected separately above.
        .from('supporters')
        .select(
          'tier, status, type, has_ever_supported, expires_at, started_at, one_time_tier, one_time_remaining_seconds, one_time_expires_at, stripe_subscription_id'
        )
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
          oneTimeTier: data.one_time_tier,
          oneTimeRemainingSeconds: data.one_time_remaining_seconds,
          oneTimeExpiresAt: data.one_time_expires_at,
          stripeSubscriptionId: data.stripe_subscription_id,
        };
      } else {
        supporterState.value = null;
      }
      statusLoadedForUserId.value = userId;
      success = true;
      return true;
    } catch (e: unknown) {
      logger.error('fetchStatus threw', { userId, err: e });
      if (!isCurrentStatusRequest(userId, requestVersion)) return false;
      error.value = e instanceof Error ? e.message : 'Failed to load supporter status';
      supporterState.value = null;
      statusLoadedForUserId.value = null;
      return false;
    } finally {
      finishStatusRequest(userId, requestVersion, success);
    }
  }
  function subscribeToSupporterChanges(
    client: SupabaseClient,
    topic: string,
    userId: string,
    requestVersion: number
  ) {
    let initialReadStarted = false;
    const nextChannel = client.channel(topic).on(
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
    );
    const readStatus = () => {
      initialReadStarted = true;
      void fetchStatus(userId);
    };
    const joinedImmediately = subscribeRealtimeChannel(
      client.realtime,
      nextChannel,
      (status, err) => {
        if (requestVersion !== subscriptionRequestVersion) return;
        logChannelSubscribeFailure('Supporter', status, err, { userId });
        // Subscribe reports either a join or a failure. Read once even if the initial join fails.
        if (status !== 'SUBSCRIBED' && initialReadStarted) return;
        readStatus();
      }
    );
    if (!joinedImmediately) readStatus();
    return nextChannel;
  }
  async function subscribe(userId: string): Promise<boolean> {
    if (!$supabase || !userId) return false;
    if (channel && channelUserId === userId) {
      if (statusLoadedForUserId.value === userId) return true;
      return initialRead?.promise ?? fetchStatus(userId);
    }
    initialRead?.resolve(false);
    initialRead = null;
    statusLoadedForUserId.value = null;
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
    let resolveInitial!: (success: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      resolveInitial = resolve;
    });
    initialRead = { userId, promise, resolve: resolveInitial };
    channel = {
      channel: subscribeToSupporterChanges(client, topic, userId, requestVersion),
      client,
      topic,
    };
    channelUserId = userId;
    return promise;
  }
  function unsubscribe() {
    subscriptionRequestVersion += 1;
    initialRead?.resolve(false);
    initialRead = null;
    statusLoadedForUserId.value = null;
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
    checkoutRequest.value?.abort();
    checkoutRequest.value = null;
    checkoutAttempt = null;
  }
  async function createCheckout(params: {
    mode: 'payment' | 'subscription';
    tier?: string;
    interval?: string;
    amount?: number;
  }): Promise<string | null> {
    if (checkoutRequest.value) return null;
    const request = new AbortController();
    checkoutRequest.value = request;
    try {
      const { mode, tier, interval, amount } = params;
      const scope = JSON.stringify([mode, tier, interval, amount]);
      const result = await postWithAuth<{ url: string }>(
        '/api/stripe/checkout',
        { ...params, checkoutAttemptId: getCheckoutAttemptId(scope) },
        request.signal
      );
      return finishCheckout(result?.url ?? null, request.signal);
    } finally {
      if (checkoutRequest.value === request) checkoutRequest.value = null;
    }
  }
  async function openBillingPortal(returnUrl?: string): Promise<string | null> {
    return postWithAuth<{ url: string }>('/api/stripe/portal', returnUrl ? { returnUrl } : {}).then(
      (r) => r?.url ?? null
    );
  }
  async function postWithAuth<T>(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T | null> {
    if (!$supabase) {
      reportSupporterRequestError('Supabase client not available', signal);
      return null;
    }
    try {
      // Stripe endpoints require authentication: the server reads the user id
      // from the session, not the request body, so we must forward the
      // bearer token. Refresh once if the cached session is missing/stale.
      const token = await getOrRefreshSupabaseAccessToken($supabase.client);
      if (!token) {
        const message = 'You must be signed in to support TarkovTracker.';
        reportSupporterRequestError(message, signal);
        return null;
      }
      const result = await $fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
        signal,
      });
      return result as T;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Request failed';
      reportSupporterRequestError(message, signal);
      logger.error('Supporter request failed', { path, error: e });
      return null;
    }
  }
  return {
    supporter: effectiveState,
    loading,
    loadedUserId: readonly(statusLoadedForUserId),
    error,
    isSupporter,
    isActiveSubscriber,
    isSubscribed,
    billingSubscription,
    activeTier,
    badgeLabel,
    fetchStatus,
    subscribe,
    unsubscribe,
    reset,
    checkoutPending,
    createCheckout,
    openBillingPortal,
  };
}
