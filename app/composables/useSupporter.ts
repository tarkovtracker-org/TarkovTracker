import { isSupporterActivityActive } from '@/features/supporter/supporterStatus';
import { logger } from '@/utils/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';
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
let channel: RealtimeChannel | null = null;
let channelUserId: string | null = null;
export function useSupporter() {
  const { $supabase } = useNuxtApp();
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
        error.value = err.message;
        return;
      }
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
      error.value = e instanceof Error ? e.message : 'Failed to load supporter status';
      supporterState.value = null;
    } finally {
      loading.value = false;
    }
  }
  function subscribe(userId: string) {
    if (!$supabase || !userId) return;
    if (channel && channelUserId === userId) return;
    if (channel) {
      channel.unsubscribe();
      channel = null;
      channelUserId = null;
    }
    channel = $supabase.client
      .channel(`supporters:${userId}`)
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
      .subscribe();
    channelUserId = userId;
  }
  function unsubscribe() {
    if (channel) {
      channel.unsubscribe();
      channel = null;
      channelUserId = null;
    }
  }
  async function createCheckout(params: {
    mode: 'payment' | 'subscription';
    tier?: string;
    interval?: string;
    amount?: number;
  }): Promise<string | null> {
    if (!$supabase) {
      error.value = 'Supabase client not available';
      return null;
    }
    try {
      // Stripe checkout requires authentication: the server reads the user id
      // from the session, not the request body, so we must forward the
      // bearer token. Refresh once if the cached session is missing/stale.
      let token: string | null = null;
      const sessionResp = await $supabase.client.auth.getSession();
      token = sessionResp.data.session?.access_token ?? null;
      if (!token) {
        const refreshed = await $supabase.client.auth.refreshSession();
        token = refreshed.data.session?.access_token ?? null;
      }
      if (!token) {
        const message = 'You must be signed in to support TarkovTracker.';
        error.value = message;
        return null;
      }
      const { url } = await $fetch<{ url: string }>('/api/stripe/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: params,
      });
      return url;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Checkout failed';
      error.value = message;
      logger.error('createCheckout failed', {
        mode: params.mode,
        tier: params.tier,
        interval: params.interval,
        error: e,
      });
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
    createCheckout,
  };
}
